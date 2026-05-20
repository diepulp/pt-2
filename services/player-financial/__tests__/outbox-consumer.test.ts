/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { FinancialOutboxEventDTO } from '../dtos';
import { runConsumer } from '../outbox-consumer';

const baseLedgerEvent: FinancialOutboxEventDTO = {
  event_id: 'ev-cons-0001',
  event_type: 'buyin.recorded',
  casino_id: 'cas-cons-1',
  table_id: 'tbl-cons-1',
  player_id: 'player-cons-1',
  aggregate_id: 'agg-cons-1',
  gaming_day: '2026-05-19',
  created_at: '2026-05-11T00:00:00Z',
  processed_at: null,
  fact_class: 'ledger',
  origin_label: 'actual',
  payload: { amount_cents: 500 },
};

const baseOperationalEvent: FinancialOutboxEventDTO = {
  ...baseLedgerEvent,
  event_id: 'ev-cons-0002',
  event_type: 'fill.recorded',
  fact_class: 'operational',
};

function makeSupabase(rpcReturn: { data: unknown; error: unknown }) {
  return {
    rpc: jest.fn().mockResolvedValue(rpcReturn),
  } as unknown as SupabaseClient<Database>;
}

describe('runConsumer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns skipped for non-ledger (operational) events without calling any RPC', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await runConsumer(supabase, baseOperationalEvent);
    expect(result).toBe('skipped');
    expect(supabase.rpc as jest.Mock).not.toHaveBeenCalled();
  });

  it('returns processed for new ledger event', async () => {
    const supabase = makeSupabase({ data: 'processed', error: null });
    const result = await runConsumer(supabase, baseLedgerEvent);
    expect(result).toBe('processed');
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_process_class_a_projection',
      { p_message_id: baseLedgerEvent.event_id },
    );
  });

  it('returns duplicate for already-processed ledger event', async () => {
    const supabase = makeSupabase({ data: 'duplicate', error: null });
    const result = await runConsumer(supabase, baseLedgerEvent);
    expect(result).toBe('duplicate');
  });

  it('returns Error when RPC call fails', async () => {
    // PostgrestError extends Error — simulate with Error instance
    const rpcError = Object.assign(new Error('permission denied'), {
      code: '42501',
    });
    const supabase = makeSupabase({ data: null, error: rpcError });
    const result = await runConsumer(supabase, baseLedgerEvent);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('permission denied');
  });

  it('returns Error when RPC returns skipped_operational — unexpected routing for a ledger event', async () => {
    const supabase = makeSupabase({ data: 'skipped_operational', error: null });
    const result = await runConsumer(supabase, baseLedgerEvent);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/skipped_operational/);
  });

  it('calls rpc_process_class_a_projection with only p_message_id — no p_casino_id', async () => {
    const supabase = makeSupabase({ data: 'processed', error: null });
    await runConsumer(supabase, baseLedgerEvent);
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_process_class_a_projection',
      { p_message_id: baseLedgerEvent.event_id },
    );
    const [, args] = (supabase.rpc as jest.Mock).mock.calls[0];
    expect(args).not.toHaveProperty('p_casino_id');
  });

  it('runConsumer has no sideEffect parameter — function arity is exactly 2', () => {
    expect(runConsumer.length).toBe(2);
  });
});
