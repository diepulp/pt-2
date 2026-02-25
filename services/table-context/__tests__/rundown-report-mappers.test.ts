/**
 * @jest-environment node
 *
 * PRD-038 Rundown Report Mapper Unit Tests
 *
 * Tests type-safe transformations for rundown report operations:
 * - toRundownReportDTO (from table row)
 * - toRundownReportDTOFromPersistRpc
 * - toRundownReportDTOFromFinalizeRpc
 * - toRundownReportSummaryDTO
 * - toRundownReportSummaryDTOList
 *
 * @see rundown-report/mappers.ts
 * @see EXEC-038 WS6
 */

import {
  toRundownReportDTO,
  toRundownReportDTOFromPersistRpc,
  toRundownReportDTOFromFinalizeRpc,
  toRundownReportSummaryDTO,
  toRundownReportSummaryDTOList,
} from '../rundown-report/mappers';

// === Mock Data: Full Report Row ===

const mockReportRow = {
  id: 'report-001',
  casino_id: 'casino-abc',
  table_session_id: 'session-001',
  gaming_table_id: 'table-001',
  gaming_day: '2026-02-24',
  opening_bankroll_cents: 5000000,
  closing_bankroll_cents: 4800000,
  opening_snapshot_id: 'snap-open-001',
  closing_snapshot_id: 'snap-close-001',
  drop_event_id: 'drop-001',
  fills_total_cents: 1000000,
  credits_total_cents: 500000,
  drop_total_cents: 2500000,
  table_win_cents: 300000,
  opening_source: 'session_opening_snapshot',
  computation_grade: 'A',
  par_target_cents: 250000,
  variance_from_par_cents: 50000,
  has_late_events: false,
  computed_by: 'staff-pit-001',
  computed_at: '2026-02-24T22:00:00Z',
  finalized_at: null,
  finalized_by: null,
  notes: null,
  created_at: '2026-02-24T22:00:00Z',
};

const mockReportRowFinalized = {
  ...mockReportRow,
  id: 'report-002',
  finalized_at: '2026-02-24T23:00:00Z',
  finalized_by: 'staff-admin-001',
  has_late_events: true,
  notes: 'Late fill after close',
};

const mockReportRowNulls = {
  ...mockReportRow,
  id: 'report-003',
  opening_bankroll_cents: null,
  closing_bankroll_cents: null,
  opening_snapshot_id: null,
  closing_snapshot_id: null,
  drop_event_id: null,
  drop_total_cents: null,
  table_win_cents: null,
  par_target_cents: null,
  variance_from_par_cents: null,
  computed_by: null,
  opening_source: 'none',
  computation_grade: 'F',
};

// === Tests ===

describe('PRD-038 Rundown Report Mappers', () => {
  // === toRundownReportDTO ===

  describe('toRundownReportDTO', () => {
    it('maps all 24 fields correctly for a complete report', () => {
      const dto = toRundownReportDTO(mockReportRow);

      expect(dto).toEqual({
        id: 'report-001',
        casino_id: 'casino-abc',
        table_session_id: 'session-001',
        gaming_table_id: 'table-001',
        gaming_day: '2026-02-24',
        opening_bankroll_cents: 5000000,
        closing_bankroll_cents: 4800000,
        opening_snapshot_id: 'snap-open-001',
        closing_snapshot_id: 'snap-close-001',
        drop_event_id: 'drop-001',
        fills_total_cents: 1000000,
        credits_total_cents: 500000,
        drop_total_cents: 2500000,
        table_win_cents: 300000,
        opening_source: 'session_opening_snapshot',
        computation_grade: 'A',
        par_target_cents: 250000,
        variance_from_par_cents: 50000,
        has_late_events: false,
        computed_by: 'staff-pit-001',
        computed_at: '2026-02-24T22:00:00Z',
        finalized_at: null,
        finalized_by: null,
        notes: null,
        created_at: '2026-02-24T22:00:00Z',
      });
    });

    it('maps finalized report with late events', () => {
      const dto = toRundownReportDTO(mockReportRowFinalized);

      expect(dto.finalized_at).toBe('2026-02-24T23:00:00Z');
      expect(dto.finalized_by).toBe('staff-admin-001');
      expect(dto.has_late_events).toBe(true);
      expect(dto.notes).toBe('Late fill after close');
    });

    it('preserves null semantics (NULL = unknown, not zero)', () => {
      const dto = toRundownReportDTO(mockReportRowNulls);

      expect(dto.opening_bankroll_cents).toBeNull();
      expect(dto.closing_bankroll_cents).toBeNull();
      expect(dto.drop_total_cents).toBeNull();
      expect(dto.table_win_cents).toBeNull();
      expect(dto.par_target_cents).toBeNull();
      expect(dto.variance_from_par_cents).toBeNull();
      expect(dto.computed_by).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const dto = toRundownReportDTO(mockReportRow);
      expect(dto).not.toBe(mockReportRow);
    });
  });

  // === toRundownReportDTOFromPersistRpc ===

  describe('toRundownReportDTOFromPersistRpc', () => {
    it('maps RPC persist result to full DTO', () => {
      const dto = toRundownReportDTOFromPersistRpc(mockReportRow);

      expect(dto.id).toBe('report-001');
      expect(dto.table_session_id).toBe('session-001');
      expect(dto.fills_total_cents).toBe(1000000);
      expect(dto.credits_total_cents).toBe(500000);
      expect(dto.computation_grade).toBe('A');
    });

    it('preserves null fields from RPC result', () => {
      const dto = toRundownReportDTOFromPersistRpc(mockReportRowNulls);

      expect(dto.table_win_cents).toBeNull();
      expect(dto.opening_bankroll_cents).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const dto = toRundownReportDTOFromPersistRpc(mockReportRow);
      expect(dto).not.toBe(mockReportRow);
    });
  });

  // === toRundownReportDTOFromFinalizeRpc ===

  describe('toRundownReportDTOFromFinalizeRpc', () => {
    it('maps RPC finalize result with finalization stamps', () => {
      const dto = toRundownReportDTOFromFinalizeRpc(mockReportRowFinalized);

      expect(dto.id).toBe('report-002');
      expect(dto.finalized_at).toBe('2026-02-24T23:00:00Z');
      expect(dto.finalized_by).toBe('staff-admin-001');
    });

    it('maps all 25 fields correctly', () => {
      const dto = toRundownReportDTOFromFinalizeRpc(mockReportRowFinalized);

      expect(Object.keys(dto)).toHaveLength(25);
      expect(dto.casino_id).toBe('casino-abc');
      expect(dto.gaming_day).toBe('2026-02-24');
    });

    it('returns a new object (immutability)', () => {
      const dto = toRundownReportDTOFromFinalizeRpc(mockReportRowFinalized);
      expect(dto).not.toBe(mockReportRowFinalized);
    });
  });

  // === toRundownReportSummaryDTO ===

  describe('toRundownReportSummaryDTO', () => {
    it('maps to summary with 8 fields', () => {
      const dto = toRundownReportSummaryDTO(mockReportRow);

      expect(dto).toEqual({
        id: 'report-001',
        table_session_id: 'session-001',
        gaming_table_id: 'table-001',
        gaming_day: '2026-02-24',
        table_win_cents: 300000,
        computation_grade: 'A',
        has_late_events: false,
        finalized_at: null,
      });
    });

    it('excludes non-summary fields', () => {
      const dto = toRundownReportSummaryDTO(mockReportRow);
      const keys = Object.keys(dto);

      expect(keys).toHaveLength(8);
      expect(keys).not.toContain('casino_id');
      expect(keys).not.toContain('fills_total_cents');
      expect(keys).not.toContain('credits_total_cents');
      expect(keys).not.toContain('notes');
    });

    it('maps finalized report summary', () => {
      const dto = toRundownReportSummaryDTO(mockReportRowFinalized);

      expect(dto.finalized_at).toBe('2026-02-24T23:00:00Z');
      expect(dto.has_late_events).toBe(true);
    });

    it('preserves null table_win_cents in summary', () => {
      const dto = toRundownReportSummaryDTO(mockReportRowNulls);
      expect(dto.table_win_cents).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const dto = toRundownReportSummaryDTO(mockReportRow);
      expect(dto).not.toBe(mockReportRow);
    });
  });

  // === toRundownReportSummaryDTOList ===

  describe('toRundownReportSummaryDTOList', () => {
    it('maps empty array', () => {
      const result = toRundownReportSummaryDTOList([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const result = toRundownReportSummaryDTOList([
        mockReportRow,
        mockReportRowFinalized,
        mockReportRowNulls,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('report-001');
      expect(result[1].id).toBe('report-002');
      expect(result[2].id).toBe('report-003');
    });

    it('each item in list is a summary (8 fields)', () => {
      const result = toRundownReportSummaryDTOList([mockReportRow]);
      expect(Object.keys(result[0])).toHaveLength(8);
    });
  });
});
