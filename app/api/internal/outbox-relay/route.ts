import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import type {
  ClassARelayBranchResult,
  FinancialOutboxEventDTO,
  OperationalConsumerResultDTO,
  OutboxBacklogSize,
  OutboxRelayCycleLog,
} from '@/services/player-financial/dtos';
import {
  aggregateLagSamples,
  collectLagSamplesMs,
  collectOutboxBacklog,
  runConsumer,
} from '@/services/player-financial/outbox-consumer';
import { runOperationalConsumer } from '@/services/player-financial/outbox-operational-consumer';

const BATCH_SIZE = 50;
const DEADLINE_BUFFER_MS = 5_000;

// Empty backlog object returned when the backlog query itself fails after a
// claim-error path — we still emit one log line per cycle (per FR-1 invariant).
const EMPTY_BACKLOG: OutboxBacklogSize = {
  ledger: { total: 0 },
  operational: { claimable: 0, dead_letter: 0, total: 0 },
};

// Phase 2.5 (PRD-089 WS1_LOG): one structured log line per cycle.
// `console.log` is intentional and is the entire reason this file is exempt
// from the "no console.* in production" guardrail. The log line is the
// observability surface; routing it through any other sink would violate
// pilot containment (no Slack, no external sinks, Vercel function logs only).
function emitRelayCycleLog(log: OutboxRelayCycleLog): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(log));
}

async function runRelayCycle(req: Request): Promise<Response> {
  const startMs = Date.now();

  // Validate CRON_SECRET BEFORE any DB access.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    emitRelayCycleLog({
      cycle: 'outbox_relay_cycle',
      outcome: 'auth_fail',
      relay_duration_ms: Date.now() - startMs,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    emitRelayCycleLog({
      cycle: 'outbox_relay_cycle',
      outcome: 'auth_fail',
      relay_duration_ms: Date.now() - startMs,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const deadlineMs = startMs + 30_000 - DEADLINE_BUFFER_MS;

  // Service-role client constructed only after auth passes.
  // Shared between Class A and operational branches.
  const supabase = createServiceClient();

  // ── Phase 2.3 Class A branch ────────────────────────────────────────────
  const { data: batch, error: claimError } = await supabase.rpc(
    'rpc_claim_class_a_outbox_batch',
    { p_batch_size: BATCH_SIZE },
  );

  if (claimError) {
    // Claim failed — emit one log line with the cycle's degraded shape and
    // return 500 to preserve the prior response contract.
    let backlog: OutboxBacklogSize;
    try {
      backlog = await collectOutboxBacklog(supabase);
    } catch {
      backlog = EMPTY_BACKLOG;
    }
    emitRelayCycleLog({
      cycle: 'outbox_relay_cycle',
      outcome: 'error',
      outbox_backlog_size: backlog,
      lag_ms: null,
      relay_duration_ms: Date.now() - startMs,
      class_a_branch: { processed: 0, failed: 0 },
      operational_branch: { processed: 0, duplicate: 0, errors: 0 },
    });
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as FinancialOutboxEventDTO[];
  const classA: ClassARelayBranchResult = {
    processed: 0,
    failed: 0,
    lagSamplesMs: [],
  };
  const classAProcessedEventIds: string[] = [];

  for (const row of rows) {
    if (Date.now() >= deadlineMs) break;

    const result = await runConsumer(supabase, row);

    if (result === 'processed' || result === 'duplicate') {
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: true,
      });
      classA.processed++;
      // Lag-sample exclusion (P1-LAG-SAMPLE-CLOCK-CONTRACT): only 'processed'
      // contributes a sample. Duplicates had their processed_at stamped on a
      // prior cycle — the lag would be misleading.
      if (result === 'processed') {
        classAProcessedEventIds.push(row.event_id);
      }
    } else {
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: false,
        p_error_detail: String(result),
      });
      classA.failed++;
    }
  }

  classA.lagSamplesMs = await collectLagSamplesMs(
    supabase,
    classAProcessedEventIds,
  );

  // ── Phase 2.4 Operational branch ────────────────────────────────────────
  // Skip if deadline already breached after Class A loop.
  let operational: OperationalConsumerResultDTO = {
    processed: 0,
    duplicate: 0,
    errors: [],
    lagSamplesMs: [],
  };

  if (Date.now() < deadlineMs) {
    try {
      const opResult = await runOperationalConsumer(supabase);
      operational = {
        processed: opResult.processed,
        duplicate: opResult.duplicate,
        errors: opResult.errors.map((e) => e.message),
        lagSamplesMs: opResult.lagSamplesMs,
      };
    } catch (opError) {
      // Operational branch failure does not affect Class A result.
      operational = {
        processed: 0,
        duplicate: 0,
        errors: [opError instanceof Error ? opError.message : String(opError)],
        lagSamplesMs: [],
      };
    }
  }

  // ── Phase 2.5 cycle log line ────────────────────────────────────────────
  let backlog: OutboxBacklogSize;
  try {
    backlog = await collectOutboxBacklog(supabase);
  } catch {
    backlog = EMPTY_BACKLOG;
  }
  const combinedLag = [...classA.lagSamplesMs, ...operational.lagSamplesMs];
  const lagAggregates = aggregateLagSamples(combinedLag);
  const hadErrors = classA.failed > 0 || operational.errors.length > 0;

  emitRelayCycleLog({
    cycle: 'outbox_relay_cycle',
    outcome: hadErrors ? 'error' : 'ok',
    outbox_backlog_size: backlog,
    lag_ms: lagAggregates,
    relay_duration_ms: Date.now() - startMs,
    class_a_branch: { processed: classA.processed, failed: classA.failed },
    operational_branch: {
      processed: operational.processed,
      duplicate: operational.duplicate,
      errors: operational.errors.length,
    },
  });

  // HTTP response preserves prior contract — lagSamplesMs is internal only.
  return NextResponse.json({
    classA: { processed: classA.processed, failed: classA.failed },
    operational: {
      processed: operational.processed,
      duplicate: operational.duplicate,
      errors: operational.errors,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  return runRelayCycle(req);
}

// GET export for Vercel cron — shares the same auth and processing path.
export async function GET(req: Request): Promise<Response> {
  return runRelayCycle(req);
}
