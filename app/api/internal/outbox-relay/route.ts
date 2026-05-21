import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import type {
  FinancialOutboxEventDTO,
  OperationalConsumerResultDTO,
} from '@/services/player-financial/dtos';
import { runConsumer } from '@/services/player-financial/outbox-consumer';
import { runOperationalConsumer } from '@/services/player-financial/outbox-operational-consumer';

const BATCH_SIZE = 50;
const DEADLINE_BUFFER_MS = 5_000;

// Class A result shape (not exported as a named DTO — internal to relay)
type ClassARelayResult = { processed: number; failed: number };

export async function POST(req: Request): Promise<Response> {
  // Validate CRON_SECRET BEFORE any DB access.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const startMs = Date.now();
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
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as FinancialOutboxEventDTO[];
  const classA: ClassARelayResult = { processed: 0, failed: 0 };

  for (const row of rows) {
    if (Date.now() >= deadlineMs) break;

    const result = await runConsumer(supabase, row);

    if (result === 'processed' || result === 'duplicate') {
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: true,
      });
      classA.processed++;
    } else {
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: false,
        p_error_detail: String(result),
      });
      classA.failed++;
    }
  }

  // ── Phase 2.4 Operational branch ────────────────────────────────────────
  // Skip if deadline already breached after Class A loop.
  let operational: OperationalConsumerResultDTO = {
    processed: 0,
    duplicate: 0,
    errors: [],
  };

  if (Date.now() < deadlineMs) {
    try {
      const opResult = await runOperationalConsumer(supabase);
      operational = {
        processed: opResult.processed,
        duplicate: opResult.duplicate,
        errors: opResult.errors.map((e) => e.message),
      };
    } catch (opError) {
      // Operational branch failure does not affect Class A result.
      operational = {
        processed: 0,
        duplicate: 0,
        errors: [opError instanceof Error ? opError.message : String(opError)],
      };
    }
  }

  return NextResponse.json({ classA, operational });
}
