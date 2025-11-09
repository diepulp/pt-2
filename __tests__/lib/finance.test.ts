import { createFinancialTransaction } from '@/lib/finance';

describe('Finance RPC helper', () => {
  it('passes the canonical RPC arguments and returns Supabase data', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: 'txn-123' },
      error: null,
    });
    const supabase = { rpc } as unknown as Parameters<
      typeof createFinancialTransaction
    >[0];

    const result = await createFinancialTransaction(supabase, {
      casinoId: 'casino-1',
      playerId: 'player-1',
      amount: 250,
      tenderType: 'cash',
      createdAt: '2025-01-01T10:00:00Z',
      visitId: 'visit-1',
      ratingSlipId: 'slip-1',
    });

    expect(rpc).toHaveBeenCalledWith('rpc_create_financial_txn', {
      p_casino_id: 'casino-1',
      p_player_id: 'player-1',
      p_amount: 250,
      p_tender_type: 'cash',
      p_created_at: '2025-01-01T10:00:00Z',
      p_visit_id: 'visit-1',
      p_rating_slip_id: 'slip-1',
    });
    expect(result).toEqual({ id: 'txn-123' });
  });

  it('throws when Supabase returns an error', async () => {
    const rpcError = new Error('derivation failed');
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: rpcError }),
    } as unknown as Parameters<typeof createFinancialTransaction>[0];

    await expect(
      createFinancialTransaction(supabase, {
        casinoId: 'casino-1',
        playerId: 'player-1',
        amount: 100,
      }),
    ).rejects.toThrow('derivation failed');
  });
});
