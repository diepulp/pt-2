import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { collectLagSamplesMs } from './outbox-consumer';

const OPERATIONAL_BATCH_SIZE = 25;

/**
 * Internal operational branch result.
 *
 * `lagSamplesMs` (Phase 2.5, PRD-089 WS1_LOG / P1-LAG-SAMPLE-CLOCK-CONTRACT):
 * DB-clock derived per-row lag in milliseconds for rows that processed
 * successfully this cycle. Duplicate / skipped / failed / claim-error
 * outcomes contribute zero samples — by construction, those event_ids are
 * not in the set passed to `collectLagSamplesMs`.
 */
export type OperationalConsumerResult = {
  processed: number;
  duplicate: number;
  errors: Error[];
  lagSamplesMs: number[];
};

export async function runOperationalConsumer(
  supabase: SupabaseClient<Database>,
): Promise<OperationalConsumerResult> {
  const result: OperationalConsumerResult = {
    processed: 0,
    duplicate: 0,
    errors: [],
    lagSamplesMs: [],
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
  const processedEventIds: string[] = [];

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
        processedEventIds.push(row.event_id);
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

  result.lagSamplesMs = await collectLagSamplesMs(supabase, processedEventIds);

  return result;
}
