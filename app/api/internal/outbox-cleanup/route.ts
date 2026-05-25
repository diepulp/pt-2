import { NextResponse } from 'next/server';

import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_ROWS = 1000;

interface OutboxCleanupCycleSuccessLog {
  cycle: 'outbox_cleanup_cycle';
  outcome: 'ok';
  max_rows: number;
  deleted: number;
  capped: boolean;
  cleanup_duration_ms: number;
}

interface OutboxCleanupCycleAuthFailLog {
  cycle: 'outbox_cleanup_cycle';
  outcome: 'auth_fail';
  cleanup_duration_ms: number;
}

interface OutboxCleanupCycleErrorLog {
  cycle: 'outbox_cleanup_cycle';
  outcome: 'error';
  max_rows: number;
  cleanup_duration_ms: number;
  error: ReturnType<typeof safeErrorDetails>;
}

type OutboxCleanupCycleLog =
  | OutboxCleanupCycleSuccessLog
  | OutboxCleanupCycleAuthFailLog
  | OutboxCleanupCycleErrorLog;

// Phase 2.5 (PRD-089 WS2_RETENTION): one structured log line per cycle.
// console.log is intentional — Vercel function logs are the observability
// surface for cron cycles. Pilot containment (no Slack, no external sinks)
// is honored.
function emitCleanupCycleLog(log: OutboxCleanupCycleLog): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(log));
}

async function runCleanupCycle(req: Request): Promise<Response> {
  const startMs = Date.now();

  // Validate CRON_SECRET BEFORE any DB access (NFR-3).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    emitCleanupCycleLog({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'auth_fail',
      cleanup_duration_ms: Date.now() - startMs,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    emitCleanupCycleLog({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'auth_fail',
      cleanup_duration_ms: Date.now() - startMs,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  // Service-role client constructed only after auth passes.
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('rpc_cleanup_outbox_processed', {
    p_max_rows: MAX_ROWS,
  });

  if (error) {
    emitCleanupCycleLog({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'error',
      max_rows: MAX_ROWS,
      cleanup_duration_ms: Date.now() - startMs,
      error: safeErrorDetails(error),
    });
    return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 });
  }

  const deleted = (data ?? 0) as number;

  emitCleanupCycleLog({
    cycle: 'outbox_cleanup_cycle',
    outcome: 'ok',
    max_rows: MAX_ROWS,
    deleted,
    capped: deleted === MAX_ROWS,
    cleanup_duration_ms: Date.now() - startMs,
  });

  return NextResponse.json({ deleted });
}

// GET only — Vercel cron triggers HTTP GET. POST is intentionally NOT
// exported in production code; the unit test asserts that absence.
export async function GET(req: Request): Promise<Response> {
  return runCleanupCycle(req);
}
