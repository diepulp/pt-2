/**
 * @jest-environment node
 *
 * PRD-033 Chip Custody Confirmation Unit Tests
 *
 * Tests cashier confirmation operations:
 * - confirmTableFill — RPC confirm fill fulfillment
 * - confirmTableCredit — RPC confirm credit receipt
 * - acknowledgeDropReceived — RPC stamp drop received
 * - listFills — direct query with filters
 * - listCredits — direct query with filters
 * - listDropEvents — direct query with filters
 *
 * @see chip-custody.ts
 * @see EXECUTION-SPEC-PRD-033.md WS6
 */

import { DomainError } from '@/lib/errors/domain-errors';

import {
  confirmTableFill,
  confirmTableCredit,
  acknowledgeDropReceived,
  listFills,
  listCredits,
  listDropEvents,
} from '../chip-custody';

// === Mock Data ===

const mockConfirmedFillRpcReturn = {
  id: 'fill-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-fill-001',
  chipset: { '100': 50 },
  amount_cents: 500000,
  requested_by: 'staff-pit-001',
  delivered_by: 'staff-runner-001',
  received_by: 'staff-dealer-001',
  slip_no: 'FILL-001',
  created_at: '2026-02-17T10:00:00Z',
  status: 'confirmed',
  confirmed_at: '2026-02-17T10:15:00Z',
  confirmed_by: 'staff-cashier-001',
  confirmed_amount_cents: 500000,
  discrepancy_note: null,
};

const mockConfirmedCreditRpcReturn = {
  id: 'credit-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  request_id: 'req-credit-001',
  chipset: { '500': 10 },
  amount_cents: 500000,
  authorized_by: 'staff-pit-001',
  sent_by: 'staff-dealer-001',
  received_by: 'staff-runner-001',
  slip_no: 'CREDIT-001',
  created_at: '2026-02-17T14:00:00Z',
  status: 'confirmed',
  confirmed_at: '2026-02-17T14:20:00Z',
  confirmed_by: 'staff-cashier-001',
  confirmed_amount_cents: 500000,
  discrepancy_note: null,
};

const mockAcknowledgedDropRpcReturn = {
  id: 'drop-001',
  casino_id: 'casino-abc',
  table_id: 'table-001',
  drop_box_id: 'box-001',
  seal_no: 'SEAL-001',
  gaming_day: '2026-02-17',
  seq_no: 1,
  removed_by: 'staff-security-001',
  witnessed_by: 'staff-pit-001',
  removed_at: '2026-02-17T06:00:00Z',
  delivered_at: '2026-02-17T06:30:00Z',
  delivered_scan_at: '2026-02-17T06:35:00Z',
  note: null,
  cage_received_at: '2026-02-17T07:00:00Z',
  cage_received_by: 'staff-cashier-001',
};

const mockFillRows = [
  {
    id: 'fill-row-001',
    casino_id: 'casino-abc',
    table_id: 'table-001',
    request_id: 'req-r-001',
    chipset: { '100': 30 },
    amount_cents: 300000,
    requested_by: 'staff-pit-001',
    delivered_by: 'staff-runner-001',
    received_by: 'staff-dealer-001',
    slip_no: 'FILL-R-001',
    created_at: '2026-02-17T08:00:00Z',
    gaming_day: '2026-02-17',
    status: 'requested',
    confirmed_at: null,
    confirmed_by: null,
    confirmed_amount_cents: null,
    discrepancy_note: null,
  },
];

const mockCreditRows = [
  {
    id: 'credit-row-001',
    casino_id: 'casino-abc',
    table_id: 'table-001',
    request_id: 'req-cr-001',
    chipset: { '500': 5 },
    amount_cents: 250000,
    authorized_by: 'staff-pit-001',
    sent_by: 'staff-dealer-001',
    received_by: 'staff-runner-001',
    slip_no: 'CREDIT-R-001',
    created_at: '2026-02-17T16:00:00Z',
    gaming_day: '2026-02-17',
    status: 'requested',
    confirmed_at: null,
    confirmed_by: null,
    confirmed_amount_cents: null,
    discrepancy_note: null,
  },
];

const mockDropRows = [
  {
    id: 'drop-row-001',
    casino_id: 'casino-abc',
    table_id: 'table-001',
    drop_box_id: 'box-r-001',
    seal_no: 'SEAL-R-001',
    gaming_day: '2026-02-17',
    seq_no: 1,
    removed_by: 'staff-security-001',
    witnessed_by: 'staff-pit-001',
    removed_at: '2026-02-17T06:00:00Z',
    delivered_at: '2026-02-17T06:30:00Z',
    delivered_scan_at: '2026-02-17T06:35:00Z',
    note: null,
    cage_received_at: null,
    cage_received_by: null,
  },
];

// === Supabase Mock Helpers ===

function createMockRpc(returnData: unknown, error: unknown = null) {
  return jest.fn().mockResolvedValue({ data: returnData, error });
}

function createMockQueryChain(returnData: unknown[], error: unknown = null) {
  const resolved = { data: returnData, error };

  // Create a thenable proxy that supports chaining
  // Every method returns the same proxy, and `then` resolves the data
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolved);
      }
      // All query builder methods return the proxy itself
      return jest.fn().mockReturnValue(new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
type MockSupabase = any;

// === Tests ===

describe('PRD-033 Cashier Confirmation Operations', () => {
  // === confirmTableFill ===

  describe('confirmTableFill', () => {
    it('calls rpc_confirm_table_fill with correct parameters', async () => {
      const mockRpc = createMockRpc(mockConfirmedFillRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      await confirmTableFill(supabase, {
        fillId: 'fill-001',
        confirmedAmountCents: 500000,
        discrepancyNote: undefined,
      });

      expect(mockRpc).toHaveBeenCalledWith('rpc_confirm_table_fill', {
        p_fill_id: 'fill-001',
        p_confirmed_amount_cents: 500000,
        p_discrepancy_note: undefined,
      });
    });

    it('returns TableFillDTO on success', async () => {
      const mockRpc = createMockRpc(mockConfirmedFillRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      const result = await confirmTableFill(supabase, {
        fillId: 'fill-001',
        confirmedAmountCents: 500000,
      });

      expect(result.id).toBe('fill-001');
      expect(result.status).toBe('confirmed');
      expect(result.confirmed_at).toBe('2026-02-17T10:15:00Z');
      expect(result.confirmed_by).toBe('staff-cashier-001');
      expect(result.confirmed_amount_cents).toBe(500000);
    });

    it('passes discrepancy note when provided', async () => {
      const mockRpc = createMockRpc(mockConfirmedFillRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      await confirmTableFill(supabase, {
        fillId: 'fill-001',
        confirmedAmountCents: 400000,
        discrepancyNote: 'Short 1 chip',
      });

      expect(mockRpc).toHaveBeenCalledWith('rpc_confirm_table_fill', {
        p_fill_id: 'fill-001',
        p_confirmed_amount_cents: 400000,
        p_discrepancy_note: 'Short 1 chip',
      });
    });

    it('throws DomainError on RPC failure', async () => {
      const mockRpc = createMockRpc(null, {
        message: 'Fill not found',
        code: 'P0001',
      });
      const supabase = { rpc: mockRpc } as MockSupabase;

      await expect(
        confirmTableFill(supabase, {
          fillId: 'nonexistent',
          confirmedAmountCents: 100,
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  // === confirmTableCredit ===

  describe('confirmTableCredit', () => {
    it('calls rpc_confirm_table_credit with correct parameters', async () => {
      const mockRpc = createMockRpc(mockConfirmedCreditRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      await confirmTableCredit(supabase, {
        creditId: 'credit-001',
        confirmedAmountCents: 500000,
      });

      expect(mockRpc).toHaveBeenCalledWith('rpc_confirm_table_credit', {
        p_credit_id: 'credit-001',
        p_confirmed_amount_cents: 500000,
        p_discrepancy_note: undefined,
      });
    });

    it('returns TableCreditDTO on success', async () => {
      const mockRpc = createMockRpc(mockConfirmedCreditRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      const result = await confirmTableCredit(supabase, {
        creditId: 'credit-001',
        confirmedAmountCents: 500000,
      });

      expect(result.id).toBe('credit-001');
      expect(result.status).toBe('confirmed');
      expect(result.confirmed_at).toBe('2026-02-17T14:20:00Z');
    });

    it('throws DomainError on RPC failure', async () => {
      const mockRpc = createMockRpc(null, {
        message: 'Credit not found',
        code: 'P0001',
      });
      const supabase = { rpc: mockRpc } as MockSupabase;

      await expect(
        confirmTableCredit(supabase, {
          creditId: 'nonexistent',
          confirmedAmountCents: 100,
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  // === acknowledgeDropReceived ===

  describe('acknowledgeDropReceived', () => {
    it('calls rpc_acknowledge_drop_received with correct parameters', async () => {
      const mockRpc = createMockRpc(mockAcknowledgedDropRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      await acknowledgeDropReceived(supabase, {
        dropEventId: 'drop-001',
      });

      expect(mockRpc).toHaveBeenCalledWith('rpc_acknowledge_drop_received', {
        p_drop_event_id: 'drop-001',
      });
    });

    it('returns TableDropEventDTO with cage_received fields', async () => {
      const mockRpc = createMockRpc(mockAcknowledgedDropRpcReturn);
      const supabase = { rpc: mockRpc } as MockSupabase;

      const result = await acknowledgeDropReceived(supabase, {
        dropEventId: 'drop-001',
      });

      expect(result.id).toBe('drop-001');
      expect(result.cage_received_at).toBe('2026-02-17T07:00:00Z');
      expect(result.cage_received_by).toBe('staff-cashier-001');
    });

    it('throws DomainError on RPC failure', async () => {
      const mockRpc = createMockRpc(null, {
        message: 'Drop event not found',
        code: 'P0001',
      });
      const supabase = { rpc: mockRpc } as MockSupabase;

      await expect(
        acknowledgeDropReceived(supabase, { dropEventId: 'nonexistent' }),
      ).rejects.toThrow(DomainError);
    });
  });

  // === listFills ===

  describe('listFills', () => {
    it('returns fill DTOs from direct query', async () => {
      const queryChain = createMockQueryChain(mockFillRows);
      const fromFn = jest.fn().mockReturnValue(queryChain);
      const supabase = { from: fromFn } as MockSupabase;

      const result = await listFills(supabase, {});

      expect(fromFn).toHaveBeenCalledWith('table_fill');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fill-row-001');
      expect(result[0].status).toBe('requested');
    });

    it('returns empty array when no fills', async () => {
      const queryChain = createMockQueryChain([]);
      const supabase = {
        from: jest.fn().mockReturnValue(queryChain),
      } as MockSupabase;

      const result = await listFills(supabase, {});

      expect(result).toEqual([]);
    });

    it('throws DomainError on query failure', async () => {
      const queryChain = createMockQueryChain([], {
        message: 'Query failed',
        code: 'PGRST301',
      });
      const supabase = {
        from: jest.fn().mockReturnValue(queryChain),
      } as MockSupabase;

      await expect(listFills(supabase, {})).rejects.toThrow(DomainError);
    });
  });

  // === listCredits ===

  describe('listCredits', () => {
    it('returns credit DTOs from direct query', async () => {
      const queryChain = createMockQueryChain(mockCreditRows);
      const fromFn = jest.fn().mockReturnValue(queryChain);
      const supabase = { from: fromFn } as MockSupabase;

      const result = await listCredits(supabase, {});

      expect(fromFn).toHaveBeenCalledWith('table_credit');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('credit-row-001');
    });
  });

  // === listDropEvents ===

  describe('listDropEvents', () => {
    it('returns drop event DTOs from direct query', async () => {
      const queryChain = createMockQueryChain(mockDropRows);
      const fromFn = jest.fn().mockReturnValue(queryChain);
      const supabase = { from: fromFn } as MockSupabase;

      const result = await listDropEvents(supabase, {});

      expect(fromFn).toHaveBeenCalledWith('table_drop_event');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('drop-row-001');
      expect(result[0].cage_received_at).toBeNull();
    });
  });
});
