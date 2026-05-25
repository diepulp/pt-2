/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { runOperationalConsumer } from '../outbox-operational-consumer';

function makeRow(eventId = 'ev-op-0001') {
  return { event_id: eventId };
}

function makeSupabase(opts: {
  claimData?: ReturnType<typeof makeRow>[];
  claimError?: unknown;
  processResults?: Array<{ data?: string; error?: unknown }>;
}): SupabaseClient<Database> {
  const rpcFn = jest.fn();
  rpcFn.mockResolvedValueOnce({
    data: opts.claimData ?? [],
    error: opts.claimError ?? null,
  });
  if (opts.processResults) {
    for (const r of opts.processResults) {
      rpcFn.mockResolvedValueOnce({
        data: r.data ?? null,
        error: r.error ?? null,
      });
    }
  } else {
    rpcFn.mockResolvedValue({ data: 'processed', error: null });
  }
  return { rpc: rpcFn } as unknown as SupabaseClient<Database>;
}

describe('runOperationalConsumer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty result when batch is empty', async () => {
    const supabase = makeSupabase({ claimData: [] });
    const result = await runOperationalConsumer(supabase);
    expect(result.processed).toBe(0);
    expect(result.duplicate).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("increments processed for 'processed' outcome", async () => {
    const supabase = makeSupabase({
      claimData: [makeRow()],
      processResults: [{ data: 'processed' }],
    });
    const result = await runOperationalConsumer(supabase);
    expect(result.processed).toBe(1);
    expect(result.duplicate).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("increments duplicate (not an error) for 'duplicate' outcome", async () => {
    const supabase = makeSupabase({
      claimData: [makeRow()],
      processResults: [{ data: 'duplicate' }],
    });
    const result = await runOperationalConsumer(supabase);
    expect(result.processed).toBe(0);
    expect(result.duplicate).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it.each(['skipped_ledger', 'skipped_unknown', 'not_found'])(
    "pushes '%s' outcome to errors (failure outcome, not success)",
    async (outcome) => {
      const supabase = makeSupabase({
        claimData: [makeRow()],
        processResults: [{ data: outcome }],
      });
      const result = await runOperationalConsumer(supabase);
      expect(result.processed).toBe(0);
      expect(result.duplicate).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toMatch(outcome);
    },
  );

  it('pushes RPC error to errors array and continues', async () => {
    const rpcError = Object.assign(new Error('db error'), { code: '42P01' });
    const supabase = makeSupabase({
      claimData: [makeRow('ev-1'), makeRow('ev-2')],
      processResults: [{ error: rpcError }, { error: rpcError }],
    });
    const result = await runOperationalConsumer(supabase);
    expect(result.errors).toHaveLength(2);
    expect(result.processed).toBe(0);
  });

  it('catches thrown exception per row and continues processing remaining rows', async () => {
    const rpcFn = jest.fn();
    rpcFn.mockResolvedValueOnce({
      data: [makeRow('ev-a'), makeRow('ev-b')],
      error: null,
    });
    rpcFn.mockRejectedValueOnce(new Error('network timeout'));
    rpcFn.mockResolvedValueOnce({ data: 'processed', error: null });
    const supabase = { rpc: rpcFn } as unknown as SupabaseClient<Database>;

    const result = await runOperationalConsumer(supabase);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.processed).toBe(1);
  });

  it('DEC-EXEC-3: never calls rpc_acknowledge_outbox_delivery in any code path', async () => {
    const rpcFn = jest.fn();
    rpcFn.mockResolvedValueOnce({ data: [makeRow()], error: null });
    rpcFn.mockResolvedValueOnce({ data: 'processed', error: null });
    const supabase = { rpc: rpcFn } as unknown as SupabaseClient<Database>;

    await runOperationalConsumer(supabase);

    const calledNames = (rpcFn as jest.Mock).mock.calls.map(
      ([name]: [string]) => name,
    );
    expect(calledNames).not.toContain('rpc_acknowledge_outbox_delivery');
  });

  it('calls rpc_claim_operational_outbox_batch with p_batch_size=25', async () => {
    const supabase = makeSupabase({ claimData: [] });
    await runOperationalConsumer(supabase);
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_claim_operational_outbox_batch',
      { p_batch_size: 25 },
    );
  });

  it('calls rpc_process_operational_projection with p_message_id (not p_event_id)', async () => {
    const supabase = makeSupabase({
      claimData: [makeRow('ev-123')],
      processResults: [{ data: 'processed' }],
    });
    await runOperationalConsumer(supabase);
    expect(supabase.rpc as jest.Mock).toHaveBeenCalledWith(
      'rpc_process_operational_projection',
      { p_message_id: 'ev-123' },
    );
    const [, args] = (supabase.rpc as jest.Mock).mock.calls[1];
    expect(args).not.toHaveProperty('p_event_id');
  });

  it('returns errors from claim RPC failure without processing any rows', async () => {
    const claimError = Object.assign(new Error('permission denied'), {
      code: '42501',
    });
    const supabase = makeSupabase({ claimError });
    const result = await runOperationalConsumer(supabase);
    expect(result.errors).toHaveLength(1);
    expect(result.processed).toBe(0);
    expect(result.duplicate).toBe(0);
    expect((supabase.rpc as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('accumulates processed + duplicate across multiple rows', async () => {
    const supabase = makeSupabase({
      claimData: [makeRow('ev-a'), makeRow('ev-b'), makeRow('ev-c')],
      processResults: [
        { data: 'processed' },
        { data: 'duplicate' },
        { data: 'processed' },
      ],
    });
    const result = await runOperationalConsumer(supabase);
    expect(result.processed).toBe(2);
    expect(result.duplicate).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
