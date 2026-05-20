import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { FinancialOutboxEventDTO } from './dtos';

// 'skipped' = non-ledger row; claim RPC filters these out, this guard is defensive only.
export type ConsumerResult = 'processed' | 'duplicate' | 'skipped' | Error;

export async function runConsumer(
  supabase: SupabaseClient<Database>,
  event: FinancialOutboxEventDTO,
): Promise<ConsumerResult> {
  if (event.fact_class !== 'ledger') {
    return 'skipped'; // Non-ledger rows belong to Phase 2.4; rpc_claim_class_a_outbox_batch guards this upstream
  }

  // rpc_process_class_a_projection: SECURITY DEFINER RPC that atomically inserts into
  // processed_messages AND upserts visit_class_a_projection AND sets finance_outbox.processed_at
  // in a single PG transaction. This is the I3 atomicity boundary.
  //
  // 'processed' = new event, all three writes committed atomically.
  // 'duplicate' = message_id already in processed_messages — prior commit is durable; relay treats as success.
  // 'skipped_operational' = fact_class != 'ledger' inside PG — should not occur (claim RPC filters).
  const { data, error } = await supabase.rpc('rpc_process_class_a_projection', {
    p_message_id: event.event_id,
  });

  if (error) return error;
  if (data === 'skipped_operational') {
    return new Error(
      'unexpected: ledger event routed to skipped_operational in rpc_process_class_a_projection',
    );
  }
  return data as 'processed' | 'duplicate';
}
