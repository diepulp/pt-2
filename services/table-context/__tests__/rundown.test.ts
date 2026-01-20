/**
 * Table Rundown Mapper Unit Tests (ADR-027)
 *
 * Tests type-safe transformations for rundown RPC responses.
 * Validates formula computation and nullable field handling.
 *
 * Formula: win = closing + credits + drop - opening - fills
 *
 * @see mappers.ts - toTableRundownDTO
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 */

import { toTableRundownDTO } from '../mappers';

describe('Table Rundown Mapper (ADR-027)', () => {
  // === Test Data ===

  const mockRundownRpcComplete = {
    session_id: 'session-123',
    opening_total_cents: 100000,
    closing_total_cents: 120000,
    fills_total_cents: 50000,
    credits_total_cents: 30000,
    drop_total_cents: 80000,
    // win = 120000 + 30000 + 80000 - 100000 - 50000 = 80000
    table_win_cents: 80000,
    drop_posted_at: '2026-01-17T15:00:00Z',
    table_bank_mode: 'INVENTORY_COUNT' as const,
    need_total_cents: 100000,
  };

  const mockRundownRpcDropNotPosted = {
    session_id: 'session-456',
    opening_total_cents: 100000,
    closing_total_cents: 150000,
    fills_total_cents: 40000,
    credits_total_cents: 25000,
    drop_total_cents: null,
    table_win_cents: null, // NULL when drop not posted (PATCHED behavior)
    drop_posted_at: null,
    table_bank_mode: 'IMPREST_TO_PAR' as const,
    need_total_cents: 100000,
  };

  const mockRundownRpcNoPar = {
    session_id: 'session-789',
    opening_total_cents: 0,
    closing_total_cents: 0,
    fills_total_cents: 0,
    credits_total_cents: 0,
    drop_total_cents: 0,
    table_win_cents: 0,
    drop_posted_at: '2026-01-17T16:00:00Z',
    table_bank_mode: null,
    need_total_cents: null,
  };

  const mockRundownRpcWin = {
    session_id: 'session-win',
    opening_total_cents: 100000, // $1,000
    closing_total_cents: 180000, // $1,800
    fills_total_cents: 20000, // $200
    credits_total_cents: 15000, // $150
    drop_total_cents: 50000, // $500
    // win = 180000 + 15000 + 50000 - 100000 - 20000 = 125000 ($1,250 win)
    table_win_cents: 125000,
    drop_posted_at: '2026-01-17T17:00:00Z',
    table_bank_mode: 'INVENTORY_COUNT' as const,
    need_total_cents: null,
  };

  const mockRundownRpcLoss = {
    session_id: 'session-loss',
    opening_total_cents: 150000, // $1,500
    closing_total_cents: 80000, // $800
    fills_total_cents: 30000, // $300
    credits_total_cents: 10000, // $100
    drop_total_cents: 40000, // $400
    // win = 80000 + 10000 + 40000 - 150000 - 30000 = -50000 ($500 loss)
    table_win_cents: -50000,
    drop_posted_at: '2026-01-17T18:00:00Z',
    table_bank_mode: 'IMPREST_TO_PAR' as const,
    need_total_cents: 150000,
  };

  // === Basic Mapping Tests ===

  describe('toTableRundownDTO', () => {
    it('maps all fields correctly when drop is posted', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto).toEqual({
        session_id: 'session-123',
        opening_total_cents: 100000,
        closing_total_cents: 120000,
        fills_total_cents: 50000,
        credits_total_cents: 30000,
        drop_total_cents: 80000,
        table_win_cents: 80000,
        drop_posted_at: '2026-01-17T15:00:00Z',
        table_bank_mode: 'INVENTORY_COUNT',
        need_total_cents: 100000,
      });
    });

    it('maps correctly when drop is not posted (table_win_cents is NULL)', () => {
      const dto = toTableRundownDTO(mockRundownRpcDropNotPosted);

      expect(dto.session_id).toBe('session-456');
      expect(dto.drop_total_cents).toBeNull();
      expect(dto.table_win_cents).toBeNull();
      expect(dto.drop_posted_at).toBeNull();
    });

    it('handles null table_bank_mode and need_total_cents', () => {
      const dto = toTableRundownDTO(mockRundownRpcNoPar);

      expect(dto.table_bank_mode).toBeNull();
      expect(dto.need_total_cents).toBeNull();
      expect(dto.drop_posted_at).toBe('2026-01-17T16:00:00Z');
    });

    it('returns a new object (immutability)', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto).not.toBe(mockRundownRpcComplete);
    });
  });

  // === Formula Verification Tests ===

  describe('Formula: win = closing + credits + drop - opening - fills', () => {
    it('computes table win correctly (positive win)', () => {
      const dto = toTableRundownDTO(mockRundownRpcWin);

      // win = 180000 + 15000 + 50000 - 100000 - 20000 = 125000
      expect(dto.table_win_cents).toBe(125000);
    });

    it('computes table loss correctly (negative win)', () => {
      const dto = toTableRundownDTO(mockRundownRpcLoss);

      // win = 80000 + 10000 + 40000 - 150000 - 30000 = -50000
      expect(dto.table_win_cents).toBe(-50000);
    });

    it('computes zero win correctly', () => {
      const zeroWinRpc = {
        session_id: 'session-zero',
        opening_total_cents: 100000,
        closing_total_cents: 100000,
        fills_total_cents: 50000,
        credits_total_cents: 50000,
        drop_total_cents: 0,
        // win = 100000 + 50000 + 0 - 100000 - 50000 = 0
        table_win_cents: 0,
        drop_posted_at: '2026-01-17T19:00:00Z',
        table_bank_mode: 'INVENTORY_COUNT' as const,
        need_total_cents: null,
      };

      const dto = toTableRundownDTO(zeroWinRpc);

      expect(dto.table_win_cents).toBe(0);
    });
  });

  // === Table Bank Mode Tests ===

  describe('Table Bank Mode', () => {
    it('maps INVENTORY_COUNT correctly', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.table_bank_mode).toBe('INVENTORY_COUNT');
    });

    it('maps IMPREST_TO_PAR correctly', () => {
      const dto = toTableRundownDTO(mockRundownRpcDropNotPosted);

      expect(dto.table_bank_mode).toBe('IMPREST_TO_PAR');
    });

    it('handles null table_bank_mode', () => {
      const dto = toTableRundownDTO(mockRundownRpcNoPar);

      expect(dto.table_bank_mode).toBeNull();
    });
  });

  // === Drop Posted Status Tests ===

  describe('Drop Posted Status', () => {
    it('drop_posted_at is non-null when drop is posted', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.drop_posted_at).not.toBeNull();
      expect(dto.drop_posted_at).toBe('2026-01-17T15:00:00Z');
    });

    it('drop_posted_at is null when drop is not posted', () => {
      const dto = toTableRundownDTO(mockRundownRpcDropNotPosted);

      expect(dto.drop_posted_at).toBeNull();
    });

    it('table_win_cents is NULL when drop_posted_at is NULL (PATCHED behavior)', () => {
      const dto = toTableRundownDTO(mockRundownRpcDropNotPosted);

      expect(dto.drop_posted_at).toBeNull();
      expect(dto.table_win_cents).toBeNull();
    });

    it('table_win_cents is computed when drop_posted_at is set', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.drop_posted_at).not.toBeNull();
      expect(dto.table_win_cents).not.toBeNull();
      expect(dto.table_win_cents).toBe(80000);
    });
  });

  // === Variance from Par Tests ===

  describe('Variance from Par', () => {
    it('need_total_cents is preserved when set', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.need_total_cents).toBe(100000);
    });

    it('need_total_cents is null when not configured', () => {
      const dto = toTableRundownDTO(mockRundownRpcNoPar);

      expect(dto.need_total_cents).toBeNull();
    });

    it('variance can be computed from closing and need (client-side)', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      // variance = closing - need = 120000 - 100000 = 20000 (over par)
      if (dto.need_total_cents !== null && dto.closing_total_cents !== null) {
        const variance = dto.closing_total_cents - dto.need_total_cents;
        expect(variance).toBe(20000);
      }
    });

    it('variance is negative when under par', () => {
      const dto = toTableRundownDTO(mockRundownRpcLoss);

      // variance = closing - need = 80000 - 150000 = -70000 (under par)
      if (dto.need_total_cents !== null && dto.closing_total_cents !== null) {
        const variance = dto.closing_total_cents - dto.need_total_cents;
        expect(variance).toBe(-70000);
      }
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles zero values for all totals', () => {
      const zeroRpc = {
        session_id: 'session-empty',
        opening_total_cents: 0,
        closing_total_cents: 0,
        fills_total_cents: 0,
        credits_total_cents: 0,
        drop_total_cents: 0,
        table_win_cents: 0,
        drop_posted_at: '2026-01-17T20:00:00Z',
        table_bank_mode: null,
        need_total_cents: null,
      };

      const dto = toTableRundownDTO(zeroRpc);

      expect(dto.opening_total_cents).toBe(0);
      expect(dto.closing_total_cents).toBe(0);
      expect(dto.fills_total_cents).toBe(0);
      expect(dto.credits_total_cents).toBe(0);
      expect(dto.drop_total_cents).toBe(0);
      expect(dto.table_win_cents).toBe(0);
    });

    it('handles large cent values', () => {
      const largeRpc = {
        session_id: 'session-large',
        opening_total_cents: 999999999,
        closing_total_cents: 888888888,
        fills_total_cents: 111111111,
        credits_total_cents: 222222222,
        drop_total_cents: 333333333,
        table_win_cents: 1222333221,
        drop_posted_at: '2026-01-17T21:00:00Z',
        table_bank_mode: 'INVENTORY_COUNT' as const,
        need_total_cents: 999999999,
      };

      const dto = toTableRundownDTO(largeRpc);

      expect(dto.opening_total_cents).toBe(999999999);
      expect(dto.closing_total_cents).toBe(888888888);
    });

    it('preserves session_id exactly', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.session_id).toBe('session-123');
    });

    it('preserves timestamp format', () => {
      const dto = toTableRundownDTO(mockRundownRpcComplete);

      expect(dto.drop_posted_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      );
    });
  });
});
