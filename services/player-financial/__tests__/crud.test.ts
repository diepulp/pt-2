import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { createTransaction } from '../crud';
import { toFinancialTransactionDTOFromRpc } from '../mappers';

jest.mock('../mappers', () => ({
  toFinancialTransactionDTOFromRpc: jest.fn(),
}));

describe('player-financial crud.createTransaction', () => {
  const rpcRow: Database['public']['Tables']['player_financial_transaction']['Row'] = {
    id: 'txn-uuid-1',
    casino_id: 'casino-uuid-1',
    player_id: 'player-uuid-1',
    visit_id: 'visit-uuid-1',
    rating_slip_id: null,
    amount: 500,
    direction: 'in',
    source: 'pit',
    tender_type: 'cash',
    created_by_staff_id: 'staff-uuid-1',
    related_transaction_id: null,
    created_at: '2025-01-15T10:00:00Z',
    gaming_day: '2025-01-15',
    idempotency_key: 'idem-123',
  };

  const supabase = {
    rpc: jest.fn(),
  } as unknown as {
    rpc: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls rpc_create_financial_txn with hybrid-required params and maps result', async () => {
    supabase.rpc.mockResolvedValue({ data: rpcRow, error: null });
    (toFinancialTransactionDTOFromRpc as jest.Mock).mockReturnValue({
      id: rpcRow.id,
    });

    const input = {
      casino_id: 'casino-uuid-1',
      player_id: 'player-uuid-1',
      visit_id: 'visit-uuid-1',
      amount: 500,
      direction: 'in' as const,
      source: 'pit' as const,
      tender_type: 'cash',
      created_by_staff_id: 'staff-uuid-1',
      // optional fields omitted to ensure undefined is sent
    };

    await createTransaction(
      supabase as unknown as any,
      input,
    );

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_create_financial_txn', {
      p_casino_id: input.casino_id,
      p_player_id: input.player_id,
      p_visit_id: input.visit_id,
      p_amount: input.amount,
      p_direction: input.direction,
      p_source: input.source,
      p_tender_type: input.tender_type,
      p_created_by_staff_id: input.created_by_staff_id,
      p_rating_slip_id: undefined,
      p_related_transaction_id: undefined,
      p_idempotency_key: undefined,
      p_created_at: undefined,
    });
    expect(toFinancialTransactionDTOFromRpc).toHaveBeenCalledWith(rpcRow);
  });

  it('throws DomainError when RPC returns no data', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    const input = {
      casino_id: 'casino-uuid-1',
      player_id: 'player-uuid-1',
      visit_id: 'visit-uuid-1',
      amount: 500,
      direction: 'in' as const,
      source: 'pit' as const,
      tender_type: 'cash',
      created_by_staff_id: 'staff-uuid-1',
    };

    await expect(
      createTransaction(supabase as unknown as any, input),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
