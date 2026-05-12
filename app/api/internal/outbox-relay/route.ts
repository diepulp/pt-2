import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import type { FinancialOutboxEventDTO } from '@/services/player-financial/dtos';
import { runConsumer } from '@/services/player-financial/outbox-consumer';

const BATCH_SIZE = 50;
const DEADLINE_BUFFER_MS = 5_000;

export async function POST(req: Request): Promise<Response> {
  // Validate CRON_SECRET BEFORE any DB access.
  // Missing configured secret → 401 for all requests; Bearer undefined does not pass.
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
  const supabase = createServiceClient();

  // Claim batch via rpc_claim_outbox_batch (FOR UPDATE SKIP LOCKED — row locking required).
  // Plain Supabase query-builder SELECT is not acceptable (ADR-056 D3).
  const { data: batch, error: claimError } = await supabase.rpc(
    'rpc_claim_outbox_batch',
    { p_batch_size: BATCH_SIZE },
  );

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as FinancialOutboxEventDTO[];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    // Stop-before-deadline guard (NF10 — 30s Vercel budget).
    if (Date.now() >= deadlineMs) break;

    const result = await runConsumer(supabase, row);

    // 'processed' = rpc_commit_consumer_receipt committed a new receipt.
    // 'duplicate' = prior rpc_commit_consumer_receipt committed atomically (safe durable
    //   prior commit — not a partial prior attempt). Both are safe to mark processed_at.
    if (result === 'processed' || result === 'duplicate') {
      await supabase
        .from('finance_outbox')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', row.event_id);
      processed++;
    } else {
      // Delivery failure: row stays processed_at IS NULL; last_error bounded to 2000 chars.
      await supabase
        .from('finance_outbox')
        .update({ last_error: String(result).slice(0, 2000) })
        .eq('event_id', row.event_id);
      failed++;
    }
  }

  const { count: backlog } = await supabase
    .from('finance_outbox')
    .select('*', { count: 'exact', head: true })
    .is('processed_at', null);

  return NextResponse.json({ processed, failed, backlog: backlog ?? 0 });
}
