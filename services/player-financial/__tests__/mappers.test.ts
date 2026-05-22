/** @jest-environment node */
/**
 * PlayerFinancialService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs.
 * Verifies proper handling of all fields including null values.
 *
 * @see services/player-financial/mappers.ts
 * @see PRD-009 Player Financial Service
 */

import { financialValueSchema } from '@/lib/financial/schema';

import type { FinancialDirection, FinancialSource } from '../dtos';
import {
  toFinancialTransactionDTO,
  toFinancialTransactionDTOFromRpc,
  toFinancialTransactionDTOList,
  toFinancialTransactionDTOOrNull,
  toVisitCashInWithAdjustmentsDTO,
  toVisitFinancialSummaryDTO,
  toVisitFinancialSummaryDTOList,
  toVisitFinancialSummaryDTOOrNull,
} from '../mappers';

// === Test Data ===

const mockTransactionRow = {
  id: 'txn-123',
  casino_id: 'casino-456',
  player_id: 'player-789',
  visit_id: 'visit-abc',
  rating_slip_id: 'slip-def',
  amount: 500,
  direction: 'in' as FinancialDirection,
  source: 'pit' as FinancialSource,
  tender_type: 'cash',
  created_by_staff_id: 'staff-ghi',
  related_transaction_id: null,
  created_at: '2025-01-15T10:00:00Z',
  gaming_day: '2025-01-15',
  idempotency_key: 'idem-key-123',
};

const mockTransactionRowOut = {
  ...mockTransactionRow,
  id: 'txn-out-456',
  direction: 'out' as FinancialDirection,
  source: 'cage' as FinancialSource,
  tender_type: 'chips',
  amount: 250,
};

const mockTransactionRowNullOptionals = {
  id: 'txn-nulls',
  casino_id: 'casino-456',
  player_id: 'player-789',
  visit_id: 'visit-abc',
  rating_slip_id: null,
  amount: 100,
  direction: 'in' as FinancialDirection,
  source: 'system' as FinancialSource,
  tender_type: null,
  created_by_staff_id: null,
  related_transaction_id: null,
  created_at: '2025-01-15T10:00:00Z',
  gaming_day: null,
  idempotency_key: null,
};

const mockVisitSummaryRow = {
  visit_id: 'visit-abc',
  casino_id: 'casino-456',
  total_in: 1000,
  total_out: 250,
  net_amount: 750,
  event_count: 5,
  first_transaction_at: '2025-01-15T10:00:00Z',
  last_transaction_at: '2025-01-15T14:00:00Z',
};

const mockVisitSummaryRowEmpty = {
  visit_id: null,
  casino_id: null,
  total_in: null,
  total_out: null,
  net_amount: null,
  event_count: null,
  first_transaction_at: null,
  last_transaction_at: null,
};

// === Tests ===

describe('Player Financial Mappers', () => {
  // ===========================================================================
  // toFinancialTransactionDTO
  // ===========================================================================

  describe('toFinancialTransactionDTO', () => {
    it('should map all required fields', () => {
      const result = toFinancialTransactionDTO(mockTransactionRow);

      expect(result).toEqual({
        id: 'txn-123',
        casino_id: 'casino-456',
        player_id: 'player-789',
        visit_id: 'visit-abc',
        rating_slip_id: 'slip-def',
        amount: 500,
        direction: 'in',
        source: 'pit',
        tender_type: 'cash',
        created_by_staff_id: 'staff-ghi',
        related_transaction_id: null,
        created_at: '2025-01-15T10:00:00Z',
        gaming_day: '2025-01-15',
        idempotency_key: 'idem-key-123',
      });
    });

    it('should handle null optional fields', () => {
      const result = toFinancialTransactionDTO(mockTransactionRowNullOptionals);

      expect(result.rating_slip_id).toBeNull();
      expect(result.tender_type).toBe(''); // null tender_type maps to empty string
      expect(result.created_by_staff_id).toBeNull();
      expect(result.related_transaction_id).toBeNull();
      expect(result.gaming_day).toBeNull();
      expect(result.idempotency_key).toBeNull();
    });

    it('should map out direction transaction', () => {
      const result = toFinancialTransactionDTO(mockTransactionRowOut);

      expect(result.direction).toBe('out');
      expect(result.source).toBe('cage');
      expect(result.tender_type).toBe('chips');
      expect(result.amount).toBe(250);
    });

    it('should return a new object (immutability)', () => {
      const result = toFinancialTransactionDTO(mockTransactionRow);

      expect(result).not.toBe(mockTransactionRow);
    });

    it('should handle system source', () => {
      const systemRow = {
        ...mockTransactionRow,
        source: 'system' as FinancialSource,
      };

      const result = toFinancialTransactionDTO(systemRow);

      expect(result.source).toBe('system');
    });

    it('should preserve different tender types', () => {
      const markerRow = {
        ...mockTransactionRow,
        tender_type: 'marker',
      };

      const result = toFinancialTransactionDTO(markerRow);

      expect(result.tender_type).toBe('marker');
    });

    it('should handle ISO date strings correctly', () => {
      const row = {
        ...mockTransactionRow,
        created_at: '2025-01-15T10:00:00.123456Z',
      };

      const result = toFinancialTransactionDTO(row);

      expect(result.created_at).toBe('2025-01-15T10:00:00.123456Z');
    });

    it('should handle related_transaction_id for reversals', () => {
      const reversalRow = {
        ...mockTransactionRow,
        id: 'txn-reversal',
        direction: 'out' as FinancialDirection,
        related_transaction_id: 'txn-123',
      };

      const result = toFinancialTransactionDTO(reversalRow);

      expect(result.related_transaction_id).toBe('txn-123');
    });
  });

  // ===========================================================================
  // toFinancialTransactionDTOList
  // ===========================================================================

  describe('toFinancialTransactionDTOList', () => {
    it('should map empty array', () => {
      const result = toFinancialTransactionDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single item array', () => {
      const result = toFinancialTransactionDTOList([mockTransactionRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn-123');
    });

    it('should map multiple items', () => {
      const result = toFinancialTransactionDTOList([
        mockTransactionRow,
        mockTransactionRowOut,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('txn-123');
      expect(result[1].id).toBe('txn-out-456');
    });

    it('should preserve order', () => {
      const result = toFinancialTransactionDTOList([
        mockTransactionRowOut,
        mockTransactionRow,
      ]);

      expect(result[0].id).toBe('txn-out-456');
      expect(result[1].id).toBe('txn-123');
    });
  });

  // ===========================================================================
  // toFinancialTransactionDTOOrNull
  // ===========================================================================

  describe('toFinancialTransactionDTOOrNull', () => {
    it('should return DTO for valid row', () => {
      const result = toFinancialTransactionDTOOrNull(mockTransactionRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('txn-123');
    });

    it('should return null for null input', () => {
      const result = toFinancialTransactionDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // toFinancialTransactionDTOFromRpc
  // ===========================================================================

  describe('toFinancialTransactionDTOFromRpc', () => {
    it('should map RPC response to DTO', () => {
      const result = toFinancialTransactionDTOFromRpc(mockTransactionRow);

      expect(result.id).toBe('txn-123');
      expect(result.amount).toBe(500);
      expect(result.direction).toBe('in');
    });

    it('should handle RPC response with null optionals', () => {
      const result = toFinancialTransactionDTOFromRpc(
        mockTransactionRowNullOptionals,
      );

      expect(result.id).toBe('txn-nulls');
      expect(result.rating_slip_id).toBeNull();
    });
  });

  // ===========================================================================
  // toVisitFinancialSummaryDTO
  // ===========================================================================

  describe('toVisitFinancialSummaryDTO', () => {
    it('should map all summary fields with FinancialValue envelopes (PRD-080 WS2)', () => {
      const result = toVisitFinancialSummaryDTO(mockVisitSummaryRow);

      expect(result.visit_id).toBe('visit-abc');
      expect(result.casino_id).toBe('casino-456');
      expect(result.event_count).toBe(5);
      expect(result.first_transaction_at).toBe('2025-01-15T10:00:00Z');
      expect(result.last_transaction_at).toBe('2025-01-15T14:00:00Z');

      // FinancialValue envelopes — type: actual, source: PFT, completeness: unknown
      expect(result.total_in).toEqual({
        value: 1000,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      });
      expect(result.total_out).toEqual({
        value: 250,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      });
      expect(result.net_amount).toEqual({
        value: 750,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      });

      // Validate against canonical schema
      expect(() => financialValueSchema.parse(result.total_in)).not.toThrow();
      expect(() => financialValueSchema.parse(result.total_out)).not.toThrow();
      expect(() => financialValueSchema.parse(result.net_amount)).not.toThrow();
    });

    it('should handle null values with defaults', () => {
      const result = toVisitFinancialSummaryDTO(mockVisitSummaryRowEmpty);

      expect(result.visit_id).toBe('');
      expect(result.casino_id).toBe('');
      expect(result.total_in.value).toBe(0);
      expect(result.total_out.value).toBe(0);
      expect(result.net_amount.value).toBe(0);
      expect(result.event_count).toBe(0);
      expect(result.first_transaction_at).toBeNull();
      expect(result.last_transaction_at).toBeNull();
    });

    it('should return a new object (immutability)', () => {
      const result = toVisitFinancialSummaryDTO(mockVisitSummaryRow);

      expect(result).not.toBe(mockVisitSummaryRow);
    });

    it('should handle zero totals', () => {
      const zeroRow = {
        ...mockVisitSummaryRow,
        total_in: 0,
        total_out: 0,
        net_amount: 0,
        event_count: 0,
      };

      const result = toVisitFinancialSummaryDTO(zeroRow);

      expect(result.total_in.value).toBe(0);
      expect(result.total_out.value).toBe(0);
      expect(result.net_amount.value).toBe(0);
      expect(result.event_count).toBe(0);
    });

    it('should handle negative net_amount (player won)', () => {
      const winningRow = {
        ...mockVisitSummaryRow,
        total_in: 500,
        total_out: 1000,
        net_amount: -500,
      };

      const result = toVisitFinancialSummaryDTO(winningRow);

      expect(result.net_amount.value).toBe(-500);
    });
  });

  // ===========================================================================
  // toVisitFinancialSummaryDTOOrNull
  // ===========================================================================

  describe('toVisitFinancialSummaryDTOOrNull', () => {
    it('should return DTO for valid row', () => {
      const result = toVisitFinancialSummaryDTOOrNull(mockVisitSummaryRow);

      expect(result).not.toBeNull();
      expect(result?.visit_id).toBe('visit-abc');
    });

    it('should return null for null input', () => {
      const result = toVisitFinancialSummaryDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // toVisitFinancialSummaryDTOList
  // ===========================================================================

  describe('toVisitFinancialSummaryDTOList', () => {
    it('should map empty array', () => {
      const result = toVisitFinancialSummaryDTOList([]);

      expect(result).toEqual([]);
    });

    it('should map single summary', () => {
      const result = toVisitFinancialSummaryDTOList([mockVisitSummaryRow]);

      expect(result).toHaveLength(1);
      expect(result[0].visit_id).toBe('visit-abc');
    });

    it('should map multiple summaries', () => {
      const summary2 = { ...mockVisitSummaryRow, visit_id: 'visit-def' };
      const result = toVisitFinancialSummaryDTOList([
        mockVisitSummaryRow,
        summary2,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].visit_id).toBe('visit-abc');
      expect(result[1].visit_id).toBe('visit-def');
    });

    it('should preserve order', () => {
      const summary2 = { ...mockVisitSummaryRow, visit_id: 'visit-def' };
      const result = toVisitFinancialSummaryDTOList([
        summary2,
        mockVisitSummaryRow,
      ]);

      expect(result[0].visit_id).toBe('visit-def');
      expect(result[1].visit_id).toBe('visit-abc');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle very large amounts', () => {
      const largeAmountRow = { ...mockTransactionRow, amount: 1000000000 };

      const result = toFinancialTransactionDTO(largeAmountRow);

      expect(result.amount).toBe(1000000000);
    });

    it('should handle decimal amounts', () => {
      const decimalRow = { ...mockTransactionRow, amount: 500.75 };

      const result = toFinancialTransactionDTO(decimalRow);

      expect(result.amount).toBe(500.75);
    });

    it('should handle empty string tender_type', () => {
      const emptyTenderRow = { ...mockTransactionRow, tender_type: '' };

      const result = toFinancialTransactionDTO(emptyTenderRow);

      expect(result.tender_type).toBe('');
    });

    it('should handle all tender types', () => {
      const tenderTypes = ['cash', 'chips', 'marker', 'check', 'wire'];

      tenderTypes.forEach((tender) => {
        const row = { ...mockTransactionRow, tender_type: tender };
        const result = toFinancialTransactionDTO(row);
        expect(result.tender_type).toBe(tender);
      });
    });

    it('should handle very large transaction counts in summary', () => {
      const largeSummary = {
        ...mockVisitSummaryRow,
        event_count: 10000,
      };

      const result = toVisitFinancialSummaryDTO(largeSummary);

      expect(result.event_count).toBe(10000);
    });

    it('should handle large integer cent amounts in summary', () => {
      // Financial values are always stored as integer cents (ISSUE-FB8EB717)
      const largeSummary = {
        ...mockVisitSummaryRow,
        total_in: 100099,
        total_out: 25050,
        net_amount: 75049,
      };

      const result = toVisitFinancialSummaryDTO(largeSummary);

      expect(result.total_in.value).toBe(100099);
      expect(result.total_out.value).toBe(25050);
      expect(result.net_amount.value).toBe(75049);
    });
  });

  // ===========================================================================
  // toVisitCashInWithAdjustmentsDTO — PRD-070 WS2 FinancialValue envelope
  // ===========================================================================

  describe('toVisitCashInWithAdjustmentsDTO', () => {
    it('toVisitCashInWithAdjustmentsDTO wraps totals as FinancialValue envelopes (PRD-070 §3.1 PFT visit aggregate)', () => {
      const row = {
        original_total: 150000,
        adjustment_total: -5000,
        net_total: 145000,
        adjustment_count: 2,
      };

      const result = toVisitCashInWithAdjustmentsDTO(row);

      expect(result.original_total).toEqual({
        value: 150000,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      });
      expect(result.adjustment_total).toEqual({
        value: -5000,
        type: 'actual',
        source: 'PFT.adjustment',
        completeness: { status: 'unknown' },
      });
      expect(result.net_total).toEqual({
        value: 145000,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      });
      expect(result.adjustment_count).toBe(2);

      // Envelope shape validates against the canonical schema
      expect(() =>
        financialValueSchema.parse(result.original_total),
      ).not.toThrow();
      expect(() =>
        financialValueSchema.parse(result.adjustment_total),
      ).not.toThrow();
      expect(() => financialValueSchema.parse(result.net_total)).not.toThrow();
    });

    it('toVisitCashInWithAdjustmentsDTO coerces string-numeric RPC totals to cents', () => {
      const row = {
        original_total: '12345',
        adjustment_total: '0',
        net_total: '12345',
        adjustment_count: '1',
      };

      const result = toVisitCashInWithAdjustmentsDTO(row);

      expect(result.original_total.value).toBe(12345);
      expect(result.adjustment_total.value).toBe(0);
      expect(result.net_total.value).toBe(12345);
      expect(result.adjustment_count).toBe(1);
    });

    it('toVisitCashInWithAdjustmentsDTO emits zero envelopes with completeness=unknown for null row', () => {
      const result = toVisitCashInWithAdjustmentsDTO(null);

      expect(result.original_total.value).toBe(0);
      expect(result.original_total.completeness.status).toBe('unknown');
      expect(result.adjustment_total.value).toBe(0);
      expect(result.adjustment_total.source).toBe('PFT.adjustment');
      expect(result.net_total.value).toBe(0);
      expect(result.adjustment_count).toBe(0);
    });

    it('toVisitCashInWithAdjustmentsDTO adjustment_total envelope uses PFT.adjustment source (PRD-070 §3.1 adjustments are separate rows)', () => {
      const row = {
        original_total: 10000,
        adjustment_total: -2500,
        net_total: 7500,
        adjustment_count: 1,
      };

      const { adjustment_total, original_total } =
        toVisitCashInWithAdjustmentsDTO(row);

      expect(original_total.source).toBe('PFT');
      expect(adjustment_total.source).toBe('PFT.adjustment');
    });
  });
});
