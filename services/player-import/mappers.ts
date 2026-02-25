/**
 * PlayerImportService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 *
 * @see PRD-037 CSV Player Import
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import type { Database, Json } from '@/types/database.types';

import type {
  ColumnMapping,
  ImportBatchDTO,
  ImportBatchReportV1,
  ImportIngestionReportV1,
  ImportRowDTO,
  ImportRowStatus,
  StageRowInput,
} from './dtos';

// === Selected Row Types (match what DB queries return) ===

type ImportBatchRow = Database['public']['Tables']['import_batch']['Row'];

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
export function toImportBatchDTO(row: ImportBatchRow): ImportBatchDTO {
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
    storage_path: row.storage_path,
    original_file_name: row.original_file_name,
    claimed_by: row.claimed_by,
    claimed_at: row.claimed_at,
    heartbeat_at: row.heartbeat_at,
    attempt_count: row.attempt_count,
    last_error_at: row.last_error_at,
    last_error_code: row.last_error_code,
  };
}

/** Maps an array of batch rows to ImportBatchDTO[] */
export function toImportBatchDTOList(rows: ImportBatchRow[]): ImportBatchDTO[] {
  return rows.map(toImportBatchDTO);
}

/** Maps a nullable batch row to ImportBatchDTO | null */
export function toImportBatchDTOOrNull(
  row: ImportBatchRow | null,
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

// === Report Mappers ===

/**
 * Maps a raw ingestion report JSON object to a typed ImportIngestionReportV1.
 *
 * @returns Typed report, or null if input is null/undefined.
 */
export function toImportIngestionReportV1(
  raw: Record<string, unknown> | null,
): ImportIngestionReportV1 | null {
  if (!raw) return null;
  return {
    total_rows: Number(raw.total_rows ?? 0),
    valid_rows: Number(raw.valid_rows ?? 0),
    invalid_rows: Number(raw.invalid_rows ?? 0),
    duplicate_rows: Number(raw.duplicate_rows ?? 0),
    parse_errors: Number(raw.parse_errors ?? 0),
    started_at: String(raw.started_at ?? ''),
    completed_at: String(raw.completed_at ?? ''),
    duration_ms: Number(raw.duration_ms ?? 0),
  };
}

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
