/**
 * PlayerImportService Mappers Tests
 *
 * 100% coverage target for all mapper functions.
 *
 * @see services/player-import/mappers.ts
 * @see PRD-037 CSV Player Import
 */

import {
  toImportBatchDTO,
  toImportBatchDTOList,
  toImportBatchDTOOrNull,
  toImportRowDTO,
  toImportRowDTOList,
  toImportRowDTOOrNull,
  toImportBatchReportV1,
} from '../mappers';

describe('PlayerImportService Mappers', () => {
  // === Test Data ===

  const mockBatchRow = {
    id: 'batch-001',
    casino_id: 'casino-123',
    created_by_staff_id: 'staff-456',
    idempotency_key: 'key-abc',
    status: 'staging' as const,
    file_name: 'export.csv',
    vendor_label: 'Konami',
    column_mapping: { email: 'Email' },
    total_rows: 100,
    report_summary: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const mockBatchRowNullVendor = {
    ...mockBatchRow,
    id: 'batch-002',
    vendor_label: null,
  };

  const mockImportRow = {
    id: 'row-001',
    batch_id: 'batch-001',
    row_number: 1,
    raw_row: { email: 'test@example.com', name: 'Test' },
    normalized_payload: {
      contract_version: 'v1',
      identifiers: { email: 'test@example.com' },
    },
    status: 'created' as const,
    reason_code: null,
    reason_detail: null,
    matched_player_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const mockImportRowWithReasons = {
    ...mockImportRow,
    id: 'row-002',
    row_number: 2,
    status: 'conflict' as const,
    reason_code: 'MULTIPLE_MATCHES',
    reason_detail: '3 matching players found',
    matched_player_id: 'player-789',
  };

  // === Batch Mappers ===

  describe('toImportBatchDTO', () => {
    it('maps all fields correctly', () => {
      const dto = toImportBatchDTO(mockBatchRow);

      expect(dto.id).toBe('batch-001');
      expect(dto.casino_id).toBe('casino-123');
      expect(dto.created_by_staff_id).toBe('staff-456');
      expect(dto.idempotency_key).toBe('key-abc');
      expect(dto.status).toBe('staging');
      expect(dto.file_name).toBe('export.csv');
      expect(dto.vendor_label).toBe('Konami');
      expect(dto.column_mapping).toEqual({ email: 'Email' });
      expect(dto.total_rows).toBe(100);
      expect(dto.report_summary).toBeNull();
      expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updated_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('handles null vendor_label', () => {
      const dto = toImportBatchDTO(mockBatchRowNullVendor);
      expect(dto.vendor_label).toBeNull();
    });
  });

  describe('toImportBatchDTOList', () => {
    it('maps array correctly', () => {
      const list = toImportBatchDTOList([mockBatchRow, mockBatchRowNullVendor]);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('batch-001');
      expect(list[1].id).toBe('batch-002');
    });

    it('handles empty array', () => {
      const list = toImportBatchDTOList([]);
      expect(list).toHaveLength(0);
    });
  });

  describe('toImportBatchDTOOrNull', () => {
    it('maps non-null row', () => {
      const dto = toImportBatchDTOOrNull(mockBatchRow);
      expect(dto).not.toBeNull();
      expect(dto!.id).toBe('batch-001');
    });

    it('returns null for null input', () => {
      const dto = toImportBatchDTOOrNull(null);
      expect(dto).toBeNull();
    });
  });

  // === Row Mappers ===

  describe('toImportRowDTO', () => {
    it('maps all fields correctly', () => {
      const dto = toImportRowDTO(mockImportRow);

      expect(dto.id).toBe('row-001');
      expect(dto.batch_id).toBe('batch-001');
      expect(dto.row_number).toBe(1);
      expect(dto.raw_row).toEqual({ email: 'test@example.com', name: 'Test' });
      expect(dto.status).toBe('created');
      expect(dto.reason_code).toBeNull();
      expect(dto.reason_detail).toBeNull();
      expect(dto.matched_player_id).toBeNull();
      expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('maps row with reason fields and matched_player_id', () => {
      const dto = toImportRowDTO(mockImportRowWithReasons);

      expect(dto.status).toBe('conflict');
      expect(dto.reason_code).toBe('MULTIPLE_MATCHES');
      expect(dto.reason_detail).toBe('3 matching players found');
      expect(dto.matched_player_id).toBe('player-789');
    });
  });

  describe('toImportRowDTOList', () => {
    it('maps array correctly', () => {
      const list = toImportRowDTOList([
        mockImportRow,
        mockImportRowWithReasons,
      ]);
      expect(list).toHaveLength(2);
      expect(list[0].row_number).toBe(1);
      expect(list[1].row_number).toBe(2);
    });

    it('handles empty array', () => {
      const list = toImportRowDTOList([]);
      expect(list).toHaveLength(0);
    });
  });

  describe('toImportRowDTOOrNull', () => {
    it('maps non-null row', () => {
      const dto = toImportRowDTOOrNull(mockImportRow);
      expect(dto).not.toBeNull();
      expect(dto!.id).toBe('row-001');
    });

    it('returns null for null input', () => {
      const dto = toImportRowDTOOrNull(null);
      expect(dto).toBeNull();
    });
  });

  // === Report Mapper ===

  describe('toImportBatchReportV1', () => {
    it('parses valid report JSON', () => {
      const reportJson = {
        total_rows: 100,
        created: 60,
        linked: 20,
        skipped: 5,
        conflict: 10,
        error: 5,
        completed_at: '2026-01-01T01:00:00.000Z',
      };

      const report = toImportBatchReportV1(reportJson);

      expect(report).not.toBeNull();
      expect(report!.total_rows).toBe(100);
      expect(report!.created).toBe(60);
      expect(report!.linked).toBe(20);
      expect(report!.skipped).toBe(5);
      expect(report!.conflict).toBe(10);
      expect(report!.error).toBe(5);
      expect(report!.completed_at).toBe('2026-01-01T01:00:00.000Z');
    });

    it('returns null for null input', () => {
      const report = toImportBatchReportV1(null);
      expect(report).toBeNull();
    });

    it('returns null for undefined input', () => {
      const report = toImportBatchReportV1(undefined as unknown as null);
      expect(report).toBeNull();
    });

    it('handles missing numeric fields with zero defaults', () => {
      const report = toImportBatchReportV1({});
      expect(report).not.toBeNull();
      expect(report!.total_rows).toBe(0);
      expect(report!.created).toBe(0);
      expect(report!.linked).toBe(0);
      expect(report!.skipped).toBe(0);
      expect(report!.conflict).toBe(0);
      expect(report!.error).toBe(0);
    });

    it('handles wrong-type fields gracefully', () => {
      const report = toImportBatchReportV1({
        total_rows: 'not-a-number',
        created: true,
        linked: null,
      });
      expect(report).not.toBeNull();
      expect(report!.total_rows).toBe(0);
      expect(report!.created).toBe(0);
      expect(report!.linked).toBe(0);
    });

    it('parses error_count as fallback for error field', () => {
      const report = toImportBatchReportV1({
        total_rows: 10,
        error_count: 3,
      });
      expect(report).not.toBeNull();
      expect(report!.error).toBe(3);
    });

    it('parses error_message from string error field', () => {
      const report = toImportBatchReportV1({
        total_rows: 10,
        error: 'Something went wrong',
        error_code: 'IMPORT_EXECUTE_FAILED',
        failed_at: '2026-01-01T01:00:00.000Z',
      });
      expect(report).not.toBeNull();
      expect(report!.error_message).toBe('Something went wrong');
      expect(report!.error_code).toBe('IMPORT_EXECUTE_FAILED');
      expect(report!.failed_at).toBe('2026-01-01T01:00:00.000Z');
    });

    it('returns undefined for optional fields when missing', () => {
      const report = toImportBatchReportV1({ total_rows: 5 });
      expect(report).not.toBeNull();
      expect(report!.completed_at).toBeUndefined();
      expect(report!.error_message).toBeUndefined();
      expect(report!.error_code).toBeUndefined();
      expect(report!.failed_at).toBeUndefined();
    });
  });
});
