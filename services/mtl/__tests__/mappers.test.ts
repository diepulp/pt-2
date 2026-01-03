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
import type { Database } from '@/types/database.types';
import type { CasinoThresholds } from '../dtos';

// Type aliases for test readability
type MtlEntryRow = Database['public']['Tables']['mtl_entry']['Row'];
type MtlAuditNoteRow = Database['public']['Tables']['mtl_audit_note']['Row'];
type MtlGamingDaySummaryRow =
  Database['public']['Views']['mtl_gaming_day_summary']['Row'];

describe('MTLService Mappers', () => {
  // === Test Data ===

  const thresholds: CasinoThresholds = {
    watchlistFloor: 3000,
    ctrThreshold: 10000,
  };

  const mockEntryRow: MtlEntryRow = {
    id: 'entry-uuid-1',
    patron_uuid: 'patron-uuid-1',
    casino_id: 'casino-uuid-1',
    staff_id: 'staff-uuid-1',
    rating_slip_id: 'slip-uuid-1',
    visit_id: 'visit-uuid-1',
    amount: 5000,
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

  const mockGamingDaySummaryRow: MtlGamingDaySummaryRow = {
    casino_id: 'casino-uuid-1',
    patron_uuid: 'patron-uuid-1',
    gaming_day: '2025-01-15',
    total_in: 15000,
    count_in: 3,
    max_single_in: 8000,
    first_in_at: '2025-01-15T10:00:00Z',
    last_in_at: '2025-01-15T14:30:00Z',
    total_out: 7000,
    count_out: 2,
    max_single_out: 4500,
    first_out_at: '2025-01-15T11:00:00Z',
    last_out_at: '2025-01-15T13:00:00Z',
    total_volume: 22000,
    entry_count: 5,
  };

  // === Entry Badge Derivation Tests ===

  describe('deriveEntryBadge', () => {
    it('returns "none" for amounts below watchlist floor', () => {
      expect(deriveEntryBadge(500, thresholds)).toBe('none');
      expect(deriveEntryBadge(2999, thresholds)).toBe('none');
    });

    it('returns "watchlist_near" for amounts >= watchlist floor and <= 90% of CTR', () => {
      expect(deriveEntryBadge(3000, thresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(5000, thresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(9000, thresholds)).toBe('watchlist_near');
    });

    it('returns "ctr_near" for amounts > 90% of CTR threshold and <= CTR threshold', () => {
      expect(deriveEntryBadge(9001, thresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(9500, thresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(9999, thresholds)).toBe('ctr_near');
    });

    it('returns "ctr_near" for amount exactly at CTR threshold (CRITICAL: uses >, not >=)', () => {
      // CRITICAL COMPLIANCE REQUIREMENT:
      // Amount exactly at $10,000 is NOT reportable, therefore badge is "ctr_near"
      // Per 31 CFR § 1021.311: "each transaction in currency of more than $10,000"
      expect(deriveEntryBadge(10000, thresholds)).toBe('ctr_near');
    });

    it('returns "ctr_met" for amounts > CTR threshold', () => {
      expect(deriveEntryBadge(10001, thresholds)).toBe('ctr_met');
      expect(deriveEntryBadge(15000, thresholds)).toBe('ctr_met');
      expect(deriveEntryBadge(50000, thresholds)).toBe('ctr_met');
    });

    it('handles edge case: amount at exactly 90% of CTR threshold', () => {
      // 90% of 10000 = 9000
      expect(deriveEntryBadge(9000, thresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(9000.01, thresholds)).toBe('ctr_near');
    });

    it('handles zero and negative amounts', () => {
      expect(deriveEntryBadge(0, thresholds)).toBe('none');
      expect(deriveEntryBadge(-100, thresholds)).toBe('none');
    });

    it('handles custom thresholds', () => {
      const customThresholds: CasinoThresholds = {
        watchlistFloor: 5000,
        ctrThreshold: 10000,
      };

      expect(deriveEntryBadge(4999, customThresholds)).toBe('none');
      expect(deriveEntryBadge(5000, customThresholds)).toBe('watchlist_near');
      expect(deriveEntryBadge(9001, customThresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(10001, customThresholds)).toBe('ctr_met');
    });
  });

  // === Aggregate Badge Derivation Tests ===

  describe('deriveAggBadge', () => {
    it('returns "none" for totals below watchlist floor', () => {
      expect(deriveAggBadge(500, thresholds)).toBe('none');
      expect(deriveAggBadge(2999, thresholds)).toBe('none');
    });

    it('returns "agg_watchlist" for totals >= watchlist floor and <= 90% of CTR', () => {
      expect(deriveAggBadge(3000, thresholds)).toBe('agg_watchlist');
      expect(deriveAggBadge(5000, thresholds)).toBe('agg_watchlist');
      expect(deriveAggBadge(9000, thresholds)).toBe('agg_watchlist');
    });

    it('returns "agg_ctr_near" for totals > 90% of CTR threshold and <= CTR threshold', () => {
      expect(deriveAggBadge(9001, thresholds)).toBe('agg_ctr_near');
      expect(deriveAggBadge(9500, thresholds)).toBe('agg_ctr_near');
      expect(deriveAggBadge(9999, thresholds)).toBe('agg_ctr_near');
    });

    it('returns "agg_ctr_near" for total exactly at CTR threshold (CRITICAL: uses >, not >=)', () => {
      // CRITICAL COMPLIANCE REQUIREMENT:
      // Daily total exactly at $10,000 is NOT reportable, therefore badge is "agg_ctr_near"
      // Per 31 CFR § 1021.311: "aggregate amount of transactions...more than $10,000"
      expect(deriveAggBadge(10000, thresholds)).toBe('agg_ctr_near');
    });

    it('returns "agg_ctr_met" for totals > CTR threshold', () => {
      expect(deriveAggBadge(10001, thresholds)).toBe('agg_ctr_met');
      expect(deriveAggBadge(15000, thresholds)).toBe('agg_ctr_met');
      expect(deriveAggBadge(50000, thresholds)).toBe('agg_ctr_met');
    });

    it('handles edge case: total at exactly 90% of CTR threshold', () => {
      expect(deriveAggBadge(9000, thresholds)).toBe('agg_watchlist');
      expect(deriveAggBadge(9000.01, thresholds)).toBe('agg_ctr_near');
    });

    it('handles zero and negative totals', () => {
      expect(deriveAggBadge(0, thresholds)).toBe('none');
      expect(deriveAggBadge(-100, thresholds)).toBe('none');
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
        amount: 5000,
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
      const row = { ...mockEntryRow, amount: 1000 };
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('none');
    });

    it('derives correct badge for amount in ctr_near range', () => {
      const row = { ...mockEntryRow, amount: 9500 };
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('ctr_near');
    });

    it('derives correct badge for amount exactly at CTR threshold', () => {
      const row = { ...mockEntryRow, amount: 10000 };
      const result = mapMtlEntryRow(row, thresholds);

      expect(result.entry_badge).toBe('ctr_near');
    });

    it('derives correct badge for amount above CTR threshold', () => {
      const row = { ...mockEntryRow, amount: 12500 };
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
        amount: 8000,
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
        { ...mockEntryRow, id: 'entry-1', amount: 1000 },
        { ...mockEntryRow, id: 'entry-2', amount: 9500 },
        { ...mockEntryRow, id: 'entry-3', amount: 12000 },
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
        'Transaction approved by supervisor'
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
      const result = mapGamingDaySummaryRow(mockGamingDaySummaryRow, thresholds);

      expect(result).toEqual({
        casino_id: 'casino-uuid-1',
        patron_uuid: 'patron-uuid-1',
        gaming_day: '2025-01-15',
        total_in: 15000,
        count_in: 3,
        max_single_in: 8000,
        first_in_at: '2025-01-15T10:00:00Z',
        last_in_at: '2025-01-15T14:30:00Z',
        agg_badge_in: 'agg_ctr_met',
        total_out: 7000,
        count_out: 2,
        max_single_out: 4500,
        first_out_at: '2025-01-15T11:00:00Z',
        last_out_at: '2025-01-15T13:00:00Z',
        agg_badge_out: 'agg_watchlist',
        total_volume: 22000,
        entry_count: 5,
      });
    });

    it('derives separate badges for in and out totals', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 9500, // ctr_near
        total_out: 12000, // ctr_met
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_near');
      expect(result.agg_badge_out).toBe('agg_ctr_met');
    });

    it('handles total_in exactly at CTR threshold', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 10000,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_near');
    });

    it('handles total_out exactly at CTR threshold', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_out: 10000,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_out).toBe('agg_ctr_near');
    });

    it('handles total_in at exactly CTR threshold + $1', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 10001,
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      expect(result.agg_badge_in).toBe('agg_ctr_met');
    });

    it('handles total_out at exactly CTR threshold + $1', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_out: 10001,
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
      const result = mapGamingDaySummaryRow(mockGamingDaySummaryRow, thresholds);

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
        thresholds
      );

      expect(result).toHaveLength(1);
      expect(result[0].patron_uuid).toBe('patron-uuid-1');
      expect(result[0].agg_badge_in).toBe('agg_ctr_met');
    });

    it('maps multiple items with different badge levels', () => {
      const rows: MtlGamingDaySummaryRow[] = [
        { ...mockGamingDaySummaryRow, patron_uuid: 'patron-1', total_in: 2000 },
        { ...mockGamingDaySummaryRow, patron_uuid: 'patron-2', total_in: 9500 },
        {
          ...mockGamingDaySummaryRow,
          patron_uuid: 'patron-3',
          total_in: 15000,
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
    it('exports correct default values per PRD-005', () => {
      expect(DEFAULT_THRESHOLDS).toEqual({
        watchlistFloor: 3000,
        ctrThreshold: 10000,
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
      expect(deriveEntryBadge(1000000, thresholds)).toBe('ctr_met');
      expect(deriveAggBadge(1000000, thresholds)).toBe('agg_ctr_met');
    });

    it('handles decimal amounts', () => {
      expect(deriveEntryBadge(10000.5, thresholds)).toBe('ctr_met');
      expect(deriveEntryBadge(9999.99, thresholds)).toBe('ctr_near');
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

      // Below threshold
      expect(deriveEntryBadge(9999.99, thresholds)).not.toBe('ctr_met');

      // Exactly at threshold - NOT reportable
      expect(deriveEntryBadge(10000, thresholds)).toBe('ctr_near');
      expect(deriveEntryBadge(10000, thresholds)).not.toBe('ctr_met');

      // Above threshold - reportable
      expect(deriveEntryBadge(10000.01, thresholds)).toBe('ctr_met');
      expect(deriveEntryBadge(10001, thresholds)).toBe('ctr_met');
    });

    it('CRITICAL: CTR threshold uses strictly > not >= for aggregate badge', () => {
      // Below threshold
      expect(deriveAggBadge(9999.99, thresholds)).not.toBe('agg_ctr_met');

      // Exactly at threshold - NOT reportable
      expect(deriveAggBadge(10000, thresholds)).toBe('agg_ctr_near');
      expect(deriveAggBadge(10000, thresholds)).not.toBe('agg_ctr_met');

      // Above threshold - reportable
      expect(deriveAggBadge(10000.01, thresholds)).toBe('agg_ctr_met');
      expect(deriveAggBadge(10001, thresholds)).toBe('agg_ctr_met');
    });

    it('CRITICAL: separate in/out totals for aggregate badges', () => {
      const row: MtlGamingDaySummaryRow = {
        ...mockGamingDaySummaryRow,
        total_in: 5000, // Not reportable
        total_out: 12000, // Reportable
      };

      const result = mapGamingDaySummaryRow(row, thresholds);

      // Each direction evaluated independently
      expect(result.agg_badge_in).toBe('agg_watchlist');
      expect(result.agg_badge_out).toBe('agg_ctr_met');

      // NOT combined (that would be 17000 which is wrong)
      expect(result.agg_badge_in).not.toBe('agg_ctr_met');
    });
  });
});
