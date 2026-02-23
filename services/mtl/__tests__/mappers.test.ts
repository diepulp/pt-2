/**
 * MTLService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs with badge computation.
 * Critical compliance requirement: CTR threshold uses strictly > (not >=) per 31 CFR § 1021.311.
 *
 * @see PRD-005 MTL Service
 * @see mappers.ts
 * @see EXECUTION-SPEC-PRD-005.md WS6
 */

import type { Database } from '@/types/database.types';

import type { CasinoThresholds } from '../dtos';
import {
  mapMtlEntryRow,
  mapMtlEntryRowList,
  mapMtlEntryRowOrNull,
  mapMtlEntryWithNotesRow,
  mapMtlAuditNoteRow,
  mapMtlAuditNoteRowList,
  mapGamingDaySummaryRow,
  mapGamingDaySummaryRowList,
  deriveEntryBadge,
  deriveAggBadge,
  DEFAULT_THRESHOLDS,
} from '../mappers';

// Type aliases for test readability
type MtlEntryRow = Database['public']['Tables']['mtl_entry']['Row'];
type MtlAuditNoteRow = Database['public']['Tables']['mtl_audit_note']['Row'];
type MtlGamingDaySummaryRow =
  Database['public']['Views']['mtl_gaming_day_summary']['Row'];

describe('MTLService Mappers', () => {
  // === Test Data ===

  // Thresholds in CENTS per ADR-031 ($3,000 = 300000, $10,000 = 1000000)
  const thresholds: CasinoThresholds = {
    watchlistFloor: 300000,
    ctrThreshold: 1000000,
  };

  const mockEntryRow: MtlEntryRow = {
    id: 'entry-uuid-1',
    patron_uuid: 'patron-uuid-1',
    casino_id: 'casino-uuid-1',
    staff_id: 'staff-uuid-1',
    rating_slip_id: 'slip-uuid-1',
    visit_id: 'visit-uuid-1',
    amount: 500000, // $5,000 in cents
    direction: 'in',
    txn_type: 'buy_in',
    source: 'table',
    area: 'high-limit',
    gaming_day: '2025-01-15',
    occurred_at: '2025-01-15T14:30:00Z',
    created_at: '2025-01-15T14:30:05Z',
  };

  const mockAuditNoteRow: MtlAuditNoteRow = {
    id: 'note-uuid-1',
    mtl_entry_id: 'entry-uuid-1',
    staff_id: 'staff-uuid-1',
    note: 'Verified player ID',
    created_at: '2025-01-15T14:31:00Z',
  };

  // All amounts in CENTS per ADR-031 (e.g., 1500000 = $15,000)
  const mockGamingDaySummaryRow: MtlGamingDaySummaryRow = {
    casino_id: 'casino-uuid-1',
    patron_uuid: 'patron-uuid-1',
    gaming_day: '2025-01-15',
    total_in: 1500000,
    count_in: 3,
    max_single_in: 800000,
    first_in_at: '2025-01-15T10:00:00Z',
    last_in_at: '2025-01-15T14:30:00Z',
    total_out: 700000,
    count_out: 2,
    max_single_out: 450000,
    first_out_at: '2025-01-15T11:00:00Z',
    last_out_at: '2025-01-15T13:00:00Z',
    total_volume: 2200000,
    entry_count: 5,
  };

  // === Entry Badge Derivation Tests ===

  describe('deriveEntryBadge', () => {
    it('returns "none" for amounts below watchlist floor', () => {
      expect(deriveEntryBadge(50000, thresholds)).toBe('none'); // $500
      expect(deriveEntryBadge(299900, thresholds)).toBe('none'); // $2,999
    });

    it('returns "watchlist_near" for amounts >= watchlist floor and <= 90% of CTR', () => {
      expect(deriveEntryBadge(300000, thresholds)).toBe('watchlist_near'); // $3,000
      expect(deriveEntryBadge(500000, thresholds)).toBe('watchlist_near'); // $5,000
      expect(deriveEntryBadge(900000, thresholds)).toBe('watchlist_near'); // $9,000
    });

    it('returns "ctr_near" for amounts > 90% of CTR threshold and <= CTR threshold', () => {
      expect(deriveEntryBadge(900100, thresholds)).toBe('ctr_near'); // $9,001
      expect(deriveEntryBadge(950000, thresholds)).toBe('ctr_near'); // $9,500
      expect(deriveEntryBadge(999900, thresholds)).toBe('ctr_near'); // $9,999
    });

    it('returns "ctr_near" for amount exactly at CTR threshold (CRITICAL: uses >, not >=)', () => {
      // CRITICAL COMPLIANCE REQUIREMENT:
      // Amount exactly at $10,000 is NOT reportable, therefore badge is "ctr_near"
      // Per 31 CFR § 1021.311: "each transaction in currency of more than $10,000"
      expect(deriveEntryBadge(1000000, thresholds)).toBe('ctr_near'); // $10,000
    });

    it('returns "ctr_met" for amounts > CTR threshold', () => {
      expect(deriveEntryBadge(1000100, thresholds)).toBe('ctr_met'); // $10,001
      expect(deriveEntryBadge(1500000, thresholds)).toBe('ctr_met'); // $15,000
      expect(deriveEntryBadge(5000000, thresholds)).toBe('ctr_met'); // $50,000
    });

    it('handles edge case: amount at exactly 90% of CTR threshold', () => {
      // 90% of 1000000 = 900000
      expect(deriveEntryBadge(900000, thresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(900001, thresholds)).toBe('ctr_near');
    });

    it('handles zero and negative amounts', () => {
      expect(deriveEntryBadge(0, thresholds)).toBe('none');
      expect(deriveEntryBadge(-10000, thresholds)).toBe('none');
    });

    it('handles custom thresholds', () => {
      const customThresholds: CasinoThresholds = {
        watchlistFloor: 500000, // $5,000
        ctrThreshold: 1000000, // $10,000
      };

      expect(deriveEntryBadge(499900, customThresholds)).toBe('none');
      expect(deriveEntryBadge(500000, customThresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(900100, customThresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(1000100, customThresholds)).toBe('ctr_met');
    });
  });

  // === Aggregate Badge Derivation Tests ===

  describe('deriveAggBadge', () => {
    it('returns "none" for totals below watchlist floor', () => {
      expect(deriveAggBadge(50000, thresholds)).toBe('none'); // $500
      expect(deriveAggBadge(299900, thresholds)).toBe('none'); // $2,999
    });

    it('returns "agg_watchlist" for totals >= watchlist floor and <= 90% of CTR', () => {
      expect(deriveAggBadge(300000, thresholds)).toBe('agg_watchlist'); // $3,000
      expect(deriveAggBadge(500000, thresholds)).toBe('agg_watchlist'); // $5,000
      expect(deriveAggBadge(900000, thresholds)).toBe('agg_watchlist'); // $9,000
    });

    it('returns "agg_ctr_near" for totals > 90% of CTR threshold and <= CTR threshold', () => {
      expect(deriveAggBadge(900100, thresholds)).toBe('agg_ctr_near'); // $9,001
      expect(deriveAggBadge(950000, thresholds)).toBe('agg_ctr_near'); // $9,500
      expect(deriveAggBadge(999900, thresholds)).toBe('agg_ctr_near'); // $9,999
    });

    it('returns "agg_ctr_near" for total exactly at CTR threshold (CRITICAL: uses >, not >=)', () => {
      // CRITICAL COMPLIANCE REQUIREMENT:
      // Daily total exactly at $10,000 is NOT reportable, therefore badge is "agg_ctr_near"
      // Per 31 CFR § 1021.311: "aggregate amount of transactions...more than $10,000"
      expect(deriveAggBadge(1000000, thresholds)).toBe('agg_ctr_near'); // $10,000
    });

    it('returns "agg_ctr_met" for totals > CTR threshold', () => {
      expect(deriveAggBadge(1000100, thresholds)).toBe('agg_ctr_met'); // $10,001
      expect(deriveAggBadge(1500000, thresholds)).toBe('agg_ctr_met'); // $15,000
      expect(deriveAggBadge(5000000, thresholds)).toBe('agg_ctr_met'); // $50,000
    });

    it('handles edge case: total at exactly 90% of CTR threshold', () => {
      // 90% of 1000000 = 900000
      expect(deriveAggBadge(900000, thresholds)).toBe('agg_watchlist');
      expect(deriveAggBadge(900001, thresholds)).toBe('agg_ctr_near');
    });

    it('handles zero and negative totals', () => {
      expect(deriveAggBadge(0, thresholds)).toBe('none');
      expect(deriveAggBadge(-10000, thresholds)).toBe('none');
    });
  });

  // === Entry Mapper Tests ===

  describe('mapMtlEntryRow', () => {
    it('maps all fields correctly with badge computation', () => {
      const result = mapMtlEntryRow(mockEntryRow, thresholds);

      expect(result).toEqual({
        id: 'entry-uuid-1',
        patron_uuid: 'patron-uuid-1',
        casino_id: 'casino-uuid-1',
        staff_id: 'staff-uuid-1',
        rating_slip_id: 'slip-uuid-1',
        visit_id: 'visit-uuid-1',
        amount: 500000,
        direction: 'in',
        txn_type: 'buy_in',
        source: 'table',
        area: 'high-limit',
        gaming_day: '2025-01-15',
        occurred_at: '2025-01-15T14:30:00Z',
        created_at: '2025-01-15T14:30:05Z',
        entry_badge: 'watchlist_near',
      });
    });

    it('derives correct badge for amount below watchlist', () => {
      const row = { ...mockEntryRow, amount: 100000 }; // $1,000
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('none');
    });

    it('derives correct badge for amount in ctr_near range', () => {
      const row = { ...mockEntryRow, amount: 950000 }; // $9,500
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('ctr_near');
    });

    it('derives correct badge for amount exactly at CTR threshold', () => {
      const row = { ...mockEntryRow, amount: 1000000 }; // $10,000
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('ctr_near');
    });

    it('derives correct badge for amount above CTR threshold', () => {
      const row = { ...mockEntryRow, amount: 1250000 }; // $12,500
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('ctr_met');
    });

    it('handles null optional fields', () => {
      const row: MtlEntryRow = {
        ...mockEntryRow,
        staff_id: null,
        rating_slip_id: null,
        visit_id: null,
        area: null,
        gaming_day: null,
      };

      const result = mapMtlEntryRow(row, thresholds);

      expect(result.staff_id).toBeNull();
      expect(result.rating_slip_id).toBeNull();
      expect(result.visit_id).toBeNull();
      expect(result.area).toBeNull();
      expect(result.gaming_day).toBeNull();
    });

    it('handles direction "out"', () => {
      const row: MtlEntryRow = {
        ...mockEntryRow,
        direction: 'out',
        txn_type: 'cash_out',
        amount: 800000, // $8,000
      };

      const result = mapMtlEntryRow(row, thresholds);

      expect(result.direction).toBe('out');
      expect(result.txn_type).toBe('cash_out');
    });

    it('handles different transaction types', () => {
      const types: Array<Database['public']['Enums']['mtl_txn_type']> = [
        'buy_in',
        'cash_out',
        'marker',
        'front_money',
        'chip_fill',
      ];

      types.forEach((txn_type) => {
        const row: MtlEntryRow = { ...mockEntryRow, txn_type };
        const result = mapMtlEntryRow(row, thresholds);
        expect(result.txn_type).toBe(txn_type);
      });
    });

    it('handles different source types', () => {
      const sources: Array<Database['public']['Enums']['mtl_source']> = [
        'table',
        'cage',
        'kiosk',
        'other',
      ];

      sources.forEach((source) => {
        const row: MtlEntryRow = { ...mockEntryRow, source };
        const result = mapMtlEntryRow(row, thresholds);
        expect(result.source).toBe(source);
      });
    });

    it('returns a new object (immutability)', () => {
      const result = mapMtlEntryRow(mockEntryRow, thresholds);

      expect(result).not.toBe(mockEntryRow);
    });
  });

  describe('mapMtlEntryRowList', () => {
    it('maps empty array', () => {
      const result = mapMtlEntryRowList([], thresholds);

      expect(result).toEqual([]);
    });

    it('maps single item array', () => {
      const result = mapMtlEntryRowList([mockEntryRow], thresholds);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('entry-uuid-1');
      expect(result[0].entry_badge).toBe('watchlist_near');
    });

    it('maps multiple items with different badge levels', () => {
      const rows: MtlEntryRow[] = [
        { ...mockEntryRow, id: 'entry-1', amount: 100000 }, // $1,000 → none
        { ...mockEntryRow, id: 'entry-2', amount: 950000 }, // $9,500 → ctr_near
        { ...mockEntryRow, id: 'entry-3', amount: 1200000 }, // $12,000 → ctr_met
      ];

      const result = mapMtlEntryRowList(rows, thresholds);

      expect(result).toHaveLength(3);
      expect(result[0].entry_badge).toBe('none');
      expect(result[1].entry_badge).toBe('ctr_near');
      expect(result[2].entry_badge).toBe('ctr_met');
    });

    it('preserves order', () => {
      const rows: MtlEntryRow[] = [
        { ...mockEntryRow, id: 'entry-3' },
        { ...mockEntryRow, id: 'entry-1' },
        { ...mockEntryRow, id: 'entry-2' },
      ];

      const result = mapMtlEntryRowList(rows, thresholds);

      expect(result[0].id).toBe('entry-3');
      expect(result[1].id).toBe('entry-1');
      expect(result[2].id).toBe('entry-2');
    });
  });

  describe('mapMtlEntryRowOrNull', () => {
    it('returns DTO for valid row', () => {
      const result = mapMtlEntryRowOrNull(mockEntryRow, thresholds);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('entry-uuid-1');
      expect(result?.entry_badge).toBe('watchlist_near');
    });

    it('returns null for null input', () => {
      const result = mapMtlEntryRowOrNull(null, thresholds);

      expect(result).toBeNull();
    });
  });

  // === Entry with Notes Mapper Tests ===

  describe('mapMtlEntryWithNotesRow', () => {
    it('maps entry with empty audit notes', () => {
      const row = {
        ...mockEntryRow,
        mtl_audit_note: [],
      };

      const result = mapMtlEntryWithNotesRow(row, thresholds);

      expect(result.id).toBe('entry-uuid-1');
      expect(result.entry_badge).toBe('watchlist_near');
      expect(result.audit_notes).toEqual([]);
    });

    it('maps entry with single audit note', () => {
      const row = {
        ...mockEntryRow,
        mtl_audit_note: [mockAuditNoteRow],
      };

      const result = mapMtlEntryWithNotesRow(row, thresholds);

      expect(result.audit_notes).toHaveLength(1);
      expect(result.audit_notes[0]).toEqual({
        id: 'note-uuid-1',
        mtl_entry_id: 'entry-uuid-1',
        staff_id: 'staff-uuid-1',
        note: 'Verified player ID',
        created_at: '2025-01-15T14:31:00Z',
      });
    });

    it('maps entry with multiple audit notes', () => {
      const row = {
        ...mockEntryRow,
        mtl_audit_note: [
          mockAuditNoteRow,
          {
            ...mockAuditNoteRow,
            id: 'note-uuid-2',
            note: 'Transaction approved by supervisor',
            created_at: '2025-01-15T14:32:00Z',
          },
        ],
      };

      const result = mapMtlEntryWithNotesRow(row, thresholds);

      expect(result.audit_notes).toHaveLength(2);
      expect(result.audit_notes[0].note).toBe('Verified player ID');
      expect(result.audit_notes[1].note).toBe(
        'Transaction approved by supervisor',
      );
    });
  });

  // === Audit Note Mapper Tests ===

  describe('mapMtlAuditNoteRow', () => {
    it('maps all fields correctly', () => {
      const result = mapMtlAuditNoteRow(mockAuditNoteRow);

      expect(result).toEqual({
        id: 'note-uuid-1',
        mtl_entry_id: 'entry-uuid-1',
        staff_id: 'staff-uuid-1',
        note: 'Verified player ID',
        created_at: '2025-01-15T14:31:00Z',
      });
    });

    it('handles null staff_id', () => {
      const row: MtlAuditNoteRow = {
        ...mockAuditNoteRow,
        staff_id: null,
      };

      const result = mapMtlAuditNoteRow(row);

      expect(result.staff_id).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const result = mapMtlAuditNoteRow(mockAuditNoteRow);

      expect(result).not.toBe(mockAuditNoteRow);
    });
  });

  describe('mapMtlAuditNoteRowList', () => {
    it('maps empty array', () => {
      const result = mapMtlAuditNoteRowList([]);

      expect(result).toEqual([]);
    });

    it('maps single item array', () => {
      const result = mapMtlAuditNoteRowList([mockAuditNoteRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('note-uuid-1');
    });

    it('maps multiple items', () => {
      const rows: MtlAuditNoteRow[] = [
        mockAuditNoteRow,
        { ...mockAuditNoteRow, id: 'note-uuid-2' },
      ];

      const result = mapMtlAuditNoteRowList(rows);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('note-uuid-1');
      expect(result[1].id).toBe('note-uuid-2');
    });

    it('preserves order', () => {
      const rows: MtlAuditNoteRow[] = [
        { ...mockAuditNoteRow, id: 'note-3' },
        { ...mockAuditNoteRow, id: 'note-1' },
      ];

      const result = mapMtlAuditNoteRowList(rows);

      expect(result[0].id).toBe('note-3');
      expect(result[1].id).toBe('note-1');
    });
  });

  // === Gaming Day Summary Mapper Tests ===

  describe('mapGamingDaySummaryRow', () => {
    it('maps all fields correctly with aggregate badges', () => {
      const result = mapGamingDaySummaryRow(
        mockGamingDaySummaryRow,
        thresholds,
      );

      expect(result).toEqual({
        casino_id: 'casino-uuid-1',
        patron_uuid: 'patron-uuid-1',
        patron_first_name: null,
        patron_last_name: null,
        patron_date_of_birth: null,
        gaming_day: '2025-01-15',
        total_in: 1500000,
        count_in: 3,
        max_single_in: 800000,
        first_in_at: '2025-01-15T10:00:00Z',
        last_in_at: '2025-01-15T14:30:00Z',
        agg_badge_in: 'agg_ctr_met',
        total_out: 700000,
        count_out: 2,
        max_single_out: 450000,
        first_out_at: '2025-01-15T11:00:00Z',
        last_out_at: '2025-01-15T13:00:00Z',
        agg_badge_out: 'agg_watchlist',
        total_volume: 2200000,
        entry_count: 5,
      });
    });

    it('derives separate badges for in and out totals', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 950000, // $9,500 → ctr_near
        total_out: 1200000, // $12,000 → ctr_met
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_near');
      expect(result.agg_badge_out).toBe('agg_ctr_met');
    });

    it('handles total_in exactly at CTR threshold', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 1000000, // $10,000
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_near');
    });

    it('handles total_out exactly at CTR threshold', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_out: 1000000, // $10,000
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_out).toBe('agg_ctr_near');
    });

    it('handles total_in at exactly CTR threshold + 1 cent', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 1000001, // $10,000.01
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_met');
    });

    it('handles total_out at exactly CTR threshold + 1 cent', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_out: 1000001, // $10,000.01
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_out).toBe('agg_ctr_met');
    });

    it('handles null totals from view (defaults to 0)', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: null,
        total_out: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.total_in).toBe(0);
      expect(result.total_out).toBe(0);
      expect(result.agg_badge_in).toBe('none');
      expect(result.agg_badge_out).toBe('none');
    });

    it('handles null counts from view', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        count_in: null,
        count_out: null,
        entry_count: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.count_in).toBe(0);
      expect(result.count_out).toBe(0);
      expect(result.entry_count).toBe(0);
    });

    it('handles null max values', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        max_single_in: null,
        max_single_out: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.max_single_in).toBeNull();
      expect(result.max_single_out).toBeNull();
    });

    it('handles null timestamp values', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        first_in_at: null,
        last_in_at: null,
        first_out_at: null,
        last_out_at: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.first_in_at).toBeNull();
      expect(result.last_in_at).toBeNull();
      expect(result.first_out_at).toBeNull();
      expect(result.last_out_at).toBeNull();
    });

    it('handles null identifiers from view', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        casino_id: null,
        patron_uuid: null,
        gaming_day: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.casino_id).toBe('');
      expect(result.patron_uuid).toBe('');
      expect(result.gaming_day).toBe('');
    });

    it('returns a new object (immutability)', () => {
      const result = mapGamingDaySummaryRow(
        mockGamingDaySummaryRow,
        thresholds,
      );

      expect(result).not.toBe(mockGamingDaySummaryRow);
    });
  });

  describe('mapGamingDaySummaryRowList', () => {
    it('maps empty array', () => {
      const result = mapGamingDaySummaryRowList([], thresholds);

      expect(result).toEqual([]);
    });

    it('maps single item array', () => {
      const result = mapGamingDaySummaryRowList(
        [mockGamingDaySummaryRow],
        thresholds,
      );

      expect(result).toHaveLength(1);
      expect(result[0].patron_uuid).toBe('patron-uuid-1');
      expect(result[0].agg_badge_in).toBe('agg_ctr_met');
    });

    it('maps multiple items with different badge levels', () => {
      const rows: MtlGamingDaySummaryRow[] = [
        {
          ...mockGamingDaySummaryRow,
          patron_uuid: 'patron-1',
          total_in: 200000,
        }, // $2,000 → none
        {
          ...mockGamingDaySummaryRow,
          patron_uuid: 'patron-2',
          total_in: 950000,
        }, // $9,500 → ctr_near
        {
          ...mockGamingDaySummaryRow,
          patron_uuid: 'patron-3',
          total_in: 1500000, // $15,000 → ctr_met
        },
      ];

      const result = mapGamingDaySummaryRowList(rows, thresholds);

      expect(result).toHaveLength(3);
      expect(result[0].agg_badge_in).toBe('none');
      expect(result[1].agg_badge_in).toBe('agg_ctr_near');
      expect(result[2].agg_badge_in).toBe('agg_ctr_met');
    });

    it('preserves order', () => {
      const rows: MtlGamingDaySummaryRow[] = [
        { ...mockGamingDaySummaryRow, patron_uuid: 'patron-3' },
        { ...mockGamingDaySummaryRow, patron_uuid: 'patron-1' },
      ];

      const result = mapGamingDaySummaryRowList(rows, thresholds);

      expect(result[0].patron_uuid).toBe('patron-3');
      expect(result[1].patron_uuid).toBe('patron-1');
    });
  });

  // === Default Thresholds Tests ===

  describe('DEFAULT_THRESHOLDS', () => {
    it('exports correct default values per PRD-005 (in cents per ADR-031)', () => {
      expect(DEFAULT_THRESHOLDS).toEqual({
        watchlistFloor: 300000, // $3,000
        ctrThreshold: 1000000, // $10,000
      });
    });

    it('can be used with mappers', () => {
      const result = mapMtlEntryRow(mockEntryRow, DEFAULT_THRESHOLDS);

      expect(result.entry_badge).toBe('watchlist_near');
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles very large amounts', () => {
      expect(deriveEntryBadge(100000000, thresholds)).toBe('ctr_met'); // $1,000,000
      expect(deriveAggBadge(100000000, thresholds)).toBe('agg_ctr_met');
    });

    it('handles decimal amounts (sub-cent precision)', () => {
      expect(deriveEntryBadge(1000050, thresholds)).toBe('ctr_met'); // $10,000.50
      expect(deriveEntryBadge(999999, thresholds)).toBe('ctr_near'); // $9,999.99
    });

    it('handles zero total_volume in summary', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_volume: null,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.total_volume).toBe(0);
    });

    it('handles empty string area', () => {
      const row: MtlEntryRow = { ...mockEntryRow, area: '' };
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.area).toBe('');
    });

    it('handles empty string gaming_day', () => {
      const row: MtlEntryRow = { ...mockEntryRow, gaming_day: '' };
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.gaming_day).toBe('');
    });
  });

  // === Compliance Regression Tests ===

  describe('Compliance Regression Tests', () => {
    it('CRITICAL: CTR threshold uses strictly > not >= for entry badge', () => {
      // These tests ensure we never regress on the compliance requirement
      // Per 31 CFR § 1021.311: "more than $10,000"

      // Below threshold ($9,999.99)
      expect(deriveEntryBadge(999999, thresholds)).not.toBe('ctr_met');

      // Exactly at threshold ($10,000) - NOT reportable
      expect(deriveEntryBadge(1000000, thresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(1000000, thresholds)).not.toBe('ctr_met');

      // Above threshold - reportable ($10,000.01, $10,001)
      expect(deriveEntryBadge(1000001, thresholds)).toBe('ctr_met');
      expect(deriveEntryBadge(1000100, thresholds)).toBe('ctr_met');
    });

    it('CRITICAL: CTR threshold uses strictly > not >= for aggregate badge', () => {
      // Below threshold ($9,999.99)
      expect(deriveAggBadge(999999, thresholds)).not.toBe('agg_ctr_met');

      // Exactly at threshold ($10,000) - NOT reportable
      expect(deriveAggBadge(1000000, thresholds)).toBe('agg_ctr_near');
      expect(deriveAggBadge(1000000, thresholds)).not.toBe('agg_ctr_met');

      // Above threshold - reportable ($10,000.01, $10,001)
      expect(deriveAggBadge(1000001, thresholds)).toBe('agg_ctr_met');
      expect(deriveAggBadge(1000100, thresholds)).toBe('agg_ctr_met');
    });

    it('CRITICAL: separate in/out totals for aggregate badges', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 500000, // $5,000 → agg_watchlist
        total_out: 1200000, // $12,000 → agg_ctr_met
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      // Each direction evaluated independently
      expect(result.agg_badge_in).toBe('agg_watchlist');
      expect(result.agg_badge_out).toBe('agg_ctr_met');

      // NOT combined (that would be $17,000 which is wrong)
      expect(result.agg_badge_in).not.toBe('agg_ctr_met');
    });

    it('CRITICAL: watchlist floor uses >= (not >) for both filter and badge', () => {
      // The DB-level .or() filter uses .gte (>=) for watchlistFloor.
      // Badge derivation must use the same >= semantics so that every
      // patron included by the filter receives at least an "agg_watchlist"
      // badge — no patron should pass the filter but get badge "none".
      const exactlyAtFloor = thresholds.watchlistFloor; // 300000 ($3,000)

      // Badge at exactly watchlistFloor → agg_watchlist (not "none")
      expect(deriveAggBadge(exactlyAtFloor, thresholds)).toBe('agg_watchlist');
      expect(deriveEntryBadge(exactlyAtFloor, thresholds)).toBe(
        'watchlist_near',
      );

      // One cent below → none (filter would exclude this patron)
      expect(deriveAggBadge(exactlyAtFloor - 1, thresholds)).toBe('none');
      expect(deriveEntryBadge(exactlyAtFloor - 1, thresholds)).toBe('none');
    });

    it('CRITICAL: patron below threshold on BOTH directions gets badge "none"', () => {
      // A patron with total_in < watchlistFloor AND total_out < watchlistFloor
      // should receive "none" badges for both directions.
      // The DB filter excludes them from list queries, but single-patron
      // queries (usePatronDailyTotal) bypass the filter and must still
      // compute correct badges.
      const belowThreshold: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 200000, // $2,000 — below $3,000 floor
        total_out: 100000, // $1,000 — below $3,000 floor
      };

      const result = mapGamingDaySummaryRow(belowThreshold, thresholds);

      expect(result.agg_badge_in).toBe('none');
      expect(result.agg_badge_out).toBe('none');
      // Totals are still correctly mapped (not zeroed)
      expect(result.total_in).toBe(200000);
      expect(result.total_out).toBe(100000);
    });

    it('CRITICAL: patron above threshold on ONE direction is included', () => {
      // The DB filter uses OR — a patron meeting threshold on only one
      // direction must still appear and get correct badges for both.
      const mixedThreshold: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 100000, // $1,000 — below floor → "none"
        total_out: 500000, // $5,000 — above floor → "agg_watchlist"
      };

      const result = mapGamingDaySummaryRow(mixedThreshold, thresholds);

      expect(result.agg_badge_in).toBe('none');
      expect(result.agg_badge_out).toBe('agg_watchlist');
    });
  });
});
