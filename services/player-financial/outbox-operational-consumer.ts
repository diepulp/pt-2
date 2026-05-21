import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const OPERATIONAL_BATCH_SIZE = 25;

export type OperationalConsumerResult = {
  processed: number;
  duplicate: number;
  errors: Error[];
};

export async function runOperationalConsumer(
  supabase: SupabaseClient<Database>,
): Promise<OperationalConsumerResult> {
  const result: OperationalConsumerResult = {
    processed: 0,
    duplicate: 0,
    errors: [],
  };

  const { data: batch, error: claimError } = await supabase.rpc(
    'rpc_claim_operational_outbox_batch',
    { p_batch_size: OPERATIONAL_BATCH_SIZE },
  );

  if (claimError) {
    result.errors.push(claimError);
    return result;
  }

  const rows = batch ?? [];

  for (const row of rows) {
    try {
      const { data, error } = await supabase.rpc(
        'rpc_process_operational_projection',
        { p_message_id: row.event_id },
      );

      if (error) {
        result.errors.push(error);
        continue;
      }

      if (data === 'processed') {
        result.processed++;
      } else if (data === 'duplicate') {
        result.duplicate++;
      } else {
        // 'skipped_ledger', 'skipped_unknown', 'not_found' are failure outcomes
        result.errors.push(
          new Error(`operational row ${row.event_id} returned: ${data}`),
        );
      }
    } catch (rowError) {
      result.errors.push(
        rowError instanceof Error ? rowError : new Error(String(rowError)),
      );
    }
  }

  return result;
}
