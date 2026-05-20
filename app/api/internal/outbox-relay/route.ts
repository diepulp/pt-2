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

  // Phase 2.3: claim ledger-only batch via rpc_claim_class_a_outbox_batch (FOR UPDATE SKIP LOCKED).
  // Phase 2.4 will use rpc_claim_outbox_batch for operational events.
  // Plain Supabase query-builder SELECT is not acceptable (ADR-056 D3).
  const { data: batch, error: claimError } = await supabase.rpc(
    'rpc_claim_class_a_outbox_batch',
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

    // 'processed' = rpc_process_class_a_projection committed all three writes atomically.
    // 'duplicate' = message_id already in processed_messages — prior commit is durable. Both success.
    // 'skipped' = defensive backstop (non-ledger row; rpc_claim_class_a_outbox_batch should prevent this).
    if (result === 'processed' || result === 'duplicate') {
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: true,
      });
      processed++;
    } else {
      // Delivery failure: row stays processed_at IS NULL for retry.
      // SQL does LEFT(p_error_detail, 2000) — VARCHAR(2000) constraint enforced in RPC.
      await supabase.rpc('rpc_acknowledge_outbox_delivery', {
        p_event_id: row.event_id,
        p_success: false,
        p_error_detail: String(result),
      });
      failed++;
    }
  }

  const { count: backlog } = await supabase
    .from('finance_outbox')
    .select('*', { count: 'exact', head: true })
    .is('processed_at', null);

  return NextResponse.json({ processed, failed, backlog: backlog ?? 0 });
}
