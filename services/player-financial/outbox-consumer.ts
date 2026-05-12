import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { FinancialOutboxEventDTO } from './dtos';

export type ConsumerResult = 'processed' | 'duplicate' | Error;

export async function runConsumer(
  supabase: SupabaseClient<Database>,
  event: FinancialOutboxEventDTO,
): Promise<ConsumerResult> {
  // Delegates to rpc_commit_consumer_receipt — a SECURITY DEFINER PostgreSQL function.
  // The RPC performs processed_messages INSERT + consumer side effect SQL in ONE PG transaction.
  // This is the I3 atomicity boundary. TypeScript cannot guarantee it; the RPC does.
  //
  // 'processed' = INSERT committed → new event, side effect ran in same transaction.
  // 'duplicate' = prior rpc_commit_consumer_receipt committed atomically → safe durable prior
  //   commit; relay may set processed_at. Not a partial prior attempt.
  //
  // Wave 2: consumer side effect is a no-op placeholder inside the RPC.
  // Future waves: consumer side effect SQL is added to the RPC body — same transaction.
  //
  // Single-consumer Wave 2 assumption: message_id is global (not consumer-scoped).

  const { data, error } = await supabase.rpc('rpc_commit_consumer_receipt', {
    p_message_id: event.event_id,
    p_casino_id: event.casino_id,
  });

  if (error) return error;
  return data as 'processed' | 'duplicate';
}
