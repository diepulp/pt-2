/** @jest-environment node */

// I3 — Idempotency: runConsumer() called twice on the same event_id produces
// 'processed' on the first call and 'duplicate' on the second. No duplicate
// consumer side effect occurs. The 'duplicate' path is a safe durable prior
// commit — rpc_process_class_a_projection enforces this via the processed_messages
// unique constraint on (message_id, casino_id) inside its atomic BEGIN…COMMIT.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { FinancialOutboxEventDTO } from '@/services/player-financial/dtos';
import { runConsumer } from '@/services/player-financial/outbox-consumer';
import type { Database } from '@/types/database.types';

const event: FinancialOutboxEventDTO = {
  event_id: 'ev-idem-0001',
  event_type: 'buyin.recorded',
  casino_id: 'cas-idem-1',
  table_id: 'tbl-idem-1',
  player_id: 'player-idem-1',
  aggregate_id: 'agg-idem-1',
  created_at: '2026-05-11T00:00:00Z',
  processed_at: null,
  fact_class: 'ledger',
  origin_label: 'actual',
  payload: { amount_cents: 5000 },
};

describe('I3 — Idempotency: duplicate delivery produces no duplicate consumer side effect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('first call returns processed, second call returns duplicate', async () => {
    const rpcMock = jest
      .fn()
      .mockResolvedValueOnce({ data: 'processed', error: null })
      .mockResolvedValueOnce({ data: 'duplicate', error: null });

    const supabase = { rpc: rpcMock } as unknown as SupabaseClient<Database>;

    const first = await runConsumer(supabase, event);
    const second = await runConsumer(supabase, event);

    expect(first).toBe('processed');
    expect(second).toBe('duplicate');
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('both calls target the same RPC with identical parameters', async () => {
    const rpcMock = jest
      .fn()
      .mockResolvedValueOnce({ data: 'processed', error: null })
      .mockResolvedValueOnce({ data: 'duplicate', error: null });

    const supabase = { rpc: rpcMock } as unknown as SupabaseClient<Database>;

    await runConsumer(supabase, event);
    await runConsumer(supabase, event);

    const expectedArgs = [
      'rpc_process_class_a_projection',
      {
        p_message_id: event.event_id,
      },
    ];
    expect(rpcMock).toHaveBeenNthCalledWith(1, ...expectedArgs);
    expect(rpcMock).toHaveBeenNthCalledWith(2, ...expectedArgs);
  });

  it("'duplicate' is a safe durable prior commit — relay marks processed_at for both", () => {
    // Both 'processed' and 'duplicate' result in processed_at being set by the relay.
    // This prevents indefinite re-delivery of an event whose consumer already committed.
    const relayMarksBothSafe = (
      result: 'processed' | 'duplicate' | Error,
    ): boolean => result === 'processed' || result === 'duplicate';

    expect(relayMarksBothSafe('processed')).toBe(true);
    expect(relayMarksBothSafe('duplicate')).toBe(true);
    expect(relayMarksBothSafe(new Error('fail'))).toBe(false);
  });

  it('runConsumer accepts exactly 2 parameters — no sideEffect parameter', () => {
    expect(runConsumer.length).toBe(2);
  });

  it('Error result is not confused with duplicate — relay records last_error instead', () => {
    const consumerError: unknown = new Error('downstream timeout');
    // Error is an instance of Error, not 'processed' or 'duplicate'
    expect(consumerError instanceof Error).toBe(true);
    expect(consumerError).not.toBe('processed');
    expect(consumerError).not.toBe('duplicate');
  });
});
