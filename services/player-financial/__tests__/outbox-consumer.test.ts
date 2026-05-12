/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { runConsumer } from '../outbox-consumer';
import type { FinancialOutboxEventDTO } from '../dtos';

const baseEvent: FinancialOutboxEventDTO = {
  event_id: 'ev-cons-0001',
  event_type: 'buyin.recorded',
  casino_id: 'cas-cons-1',
  table_id: 'tbl-cons-1',
  player_id: 'player-cons-1',
  aggregate_id: 'agg-cons-1',
  created_at: '2026-05-11T00:00:00Z',
  processed_at: null,
  fact_class: 'ledger',
  origin_label: 'actual',
  payload: { amount_cents: 500 },
};

function makeSupabase(rpcReturn: { data: unknown; error: unknown }) {
  return {
    rpc: jest.fn().mockResolvedValue(rpcReturn),
  } as unknown as SupabaseClient<Database>;
}

describe('runConsumer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns processed for new event', async () => {
    const supabase = makeSupabase({ data: 'processed', error: null });
    const result = await runConsumer(supabase, baseEvent);
    expect(result).toBe('processed');
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_commit_consumer_receipt',
      {
        p_message_id: baseEvent.event_id,
        p_casino_id: baseEvent.casino_id,
      },
    );
  });

  it('returns duplicate for already-processed event', async () => {
    const supabase = makeSupabase({ data: 'duplicate', error: null });
    const result = await runConsumer(supabase, baseEvent);
    expect(result).toBe('duplicate');
  });

  it('returns Error when RPC call fails', async () => {
    // PostgrestError extends Error — simulate with Error instance
    const rpcError = Object.assign(new Error('permission denied'), {
      code: '42501',
    });
    const supabase = makeSupabase({ data: null, error: rpcError });
    const result = await runConsumer(supabase, baseEvent);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('permission denied');
  });

  it('rejects casino mismatch — RPC returns error, consumer surfaces it as Error', async () => {
    const rpcError = Object.assign(new Error('casino_id context mismatch'), {
      code: 'P0001',
    });
    const supabase = makeSupabase({ data: null, error: rpcError });
    const mismatchedEvent: FinancialOutboxEventDTO = {
      ...baseEvent,
      casino_id: 'other-casino',
    };
    const result = await runConsumer(supabase, mismatchedEvent);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/casino_id/);
  });

  it('calls rpc_commit_consumer_receipt with event_id as p_message_id', async () => {
    const supabase = makeSupabase({ data: 'processed', error: null });
    await runConsumer(supabase, baseEvent);
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_commit_consumer_receipt',
      expect.objectContaining({ p_message_id: baseEvent.event_id }),
    );
  });

  it('runConsumer has no sideEffect parameter — function arity is exactly 2', () => {
    expect(runConsumer.length).toBe(2);
  });
});
