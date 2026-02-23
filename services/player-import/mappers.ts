/**
 * PlayerImportService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * No `as` type assertions per SLAD v2.2.0 §327-365.
 *
 * @see PRD-037 CSV Player Import
 */

import type { Json } from '@/types/database.types';

import type {
  ColumnMapping,
  ImportBatchDTO,
  ImportBatchReportV1,
  ImportBatchStatus,
  ImportRowDTO,
  ImportRowStatus,
  StageRowInput,
} from './dtos';

// === Selected Row Types (match what DB queries return) ===

type ImportBatchSelectedRow = {
  id: string;
  casino_id: string;
  created_by_staff_id: string;
  idempotency_key: string;
  status: ImportBatchStatus;
  file_name: string;
  vendor_label: string | null;
  column_mapping: Json;
  total_rows: number;
  report_summary: Json | null;
  created_at: string;
  updated_at: string;
};

type ImportRowSelectedRow = {
  id: string;
  batch_id: string;
  row_number: number;
  raw_row: Json;
  normalized_payload: Json;
  status: ImportRowStatus;
  reason_code: string | null;
  reason_detail: string | null;
  matched_player_id: string | null;
  created_at: string;
};

// === Batch Mappers ===

/** Maps a batch row to ImportBatchDTO */
export function toImportBatchDTO(row: ImportBatchSelectedRow): ImportBatchDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    created_by_staff_id: row.created_by_staff_id,
    idempotency_key: row.idempotency_key,
    status: row.status,
    file_name: row.file_name,
    vendor_label: row.vendor_label,
    column_mapping: row.column_mapping,
    total_rows: row.total_rows,
    report_summary: row.report_summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Maps an array of batch rows to ImportBatchDTO[] */
export function toImportBatchDTOList(
  rows: ImportBatchSelectedRow[],
): ImportBatchDTO[] {
  return rows.map(toImportBatchDTO);
}

/** Maps a nullable batch row to ImportBatchDTO | null */
export function toImportBatchDTOOrNull(
  row: ImportBatchSelectedRow | null,
): ImportBatchDTO | null {
  return row ? toImportBatchDTO(row) : null;
}

// === Row Mappers ===

/** Maps an import row to ImportRowDTO */
export function toImportRowDTO(row: ImportRowSelectedRow): ImportRowDTO {
  return {
    id: row.id,
    batch_id: row.batch_id,
    row_number: row.row_number,
    raw_row: row.raw_row,
    normalized_payload: row.normalized_payload,
    status: row.status,
    reason_code: row.reason_code,
    reason_detail: row.reason_detail,
    matched_player_id: row.matched_player_id,
    created_at: row.created_at,
  };
}

/** Maps an array of import rows to ImportRowDTO[] */
export function toImportRowDTOList(
  rows: ImportRowSelectedRow[],
): ImportRowDTO[] {
  return rows.map(toImportRowDTO);
}

/** Maps a nullable import row to ImportRowDTO | null */
export function toImportRowDTOOrNull(
  row: ImportRowSelectedRow | null,
): ImportRowDTO | null {
  return row ? toImportRowDTO(row) : null;
}

// === RPC Parameter Mappers ===

/** Converts ColumnMapping to Json for RPC parameters (strips undefined values) */
export function toRpcColumnMapping(mapping: ColumnMapping): Json {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** Converts StageRowInput[] to Json for rpc_import_stage_rows p_rows parameter */
export function toRpcStageRows(rows: StageRowInput[]): Json {
  return JSON.parse(
    JSON.stringify(
      rows.map((row) => ({
        row_number: row.row_number,
        raw_row: row.raw_row,
        normalized_payload: row.normalized_payload,
      })),
    ),
  );
}

// === Report Mapper ===

/** Maps raw report_summary JSON to a typed report DTO */
export function toImportBatchReportV1(
  reportJson: Json | null,
): ImportBatchReportV1 | null {
  if (reportJson === null || reportJson === undefined) {
    return null;
  }

  const report = reportJson as Record<string, unknown>;

  return {
    total_rows: typeof report.total_rows === 'number' ? report.total_rows : 0,
    created: typeof report.created === 'number' ? report.created : 0,
    linked: typeof report.linked === 'number' ? report.linked : 0,
    skipped: typeof report.skipped === 'number' ? report.skipped : 0,
    conflict: typeof report.conflict === 'number' ? report.conflict : 0,
    error:
      typeof report.error === 'number'
        ? report.error
        : typeof report.error_count === 'number'
          ? report.error_count
          : 0,
    completed_at:
      typeof report.completed_at === 'string' ? report.completed_at : undefined,
    error_message: typeof report.error === 'string' ? report.error : undefined,
    error_code:
      typeof report.error_code === 'string' ? report.error_code : undefined,
    failed_at:
      typeof report.failed_at === 'string' ? report.failed_at : undefined,
  };
}
