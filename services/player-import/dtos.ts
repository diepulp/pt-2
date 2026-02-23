/**
 * PlayerImportService DTOs
 *
 * Pattern C (Hybrid): Pattern A for canonical contracts (ImportPlayerV1,
 * ImportBatchReportV1, ColumnMapping), Pattern B for CRUD DTOs (Pick from Database types).
 *
 * @see PRD-037 CSV Player Import
 * @see docs/21-exec-spec/EXEC-037-csv-player-import.md
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §PlayerImportService
 */

import type { Database } from '@/types/database.types';

// === Base Row Types (for Pick derivation) ===

type ImportBatchRow = Database['public']['Tables']['import_batch']['Row'];
type ImportRowRow = Database['public']['Tables']['import_row']['Row'];

// === Enum Re-exports ===

export type ImportBatchStatus =
  Database['public']['Enums']['import_batch_status'];
export type ImportRowStatus = Database['public']['Enums']['import_row_status'];

// === Pattern A: Canonical Contracts ===

/**
 * ImportPlayerV1 — canonical import payload contract (ADR-036 D2).
 * Represents one normalized row from a vendor CSV.
 *
 * Rule: at least one of identifiers.email or identifiers.phone must be present.
 */
export interface ImportPlayerV1 {
  contract_version: 'v1';
  source: { vendor?: string; file_name?: string };
  row_ref: { row_number: number };
  identifiers: { email?: string; phone?: string; external_id?: string };
  profile: {
    first_name?: string;
    last_name?: string;
    dob?: string | null;
  };
  notes?: string;
}

/**
 * Column mapping from vendor CSV headers to canonical fields.
 * Keys are canonical field names, values are the vendor CSV header names.
 */
export interface ColumnMapping {
  [canonicalField: string]: string | undefined;
}

/**
 * Batch import report summary — returned after execute completes.
 */
export interface ImportBatchReportV1 {
  total_rows: number;
  created: number;
  linked: number;
  skipped: number;
  conflict: number;
  error: number;
  completed_at?: string;
  /** Present only on failure */
  error_message?: string;
  error_code?: string;
  failed_at?: string;
}

// === Pattern B: CRUD DTOs (Pick from Database types) ===

/** Import batch DTO for API responses */
export type ImportBatchDTO = Pick<
  ImportBatchRow,
  | 'id'
  | 'casino_id'
  | 'created_by_staff_id'
  | 'idempotency_key'
  | 'status'
  | 'file_name'
  | 'vendor_label'
  | 'column_mapping'
  | 'total_rows'
  | 'report_summary'
  | 'created_at'
  | 'updated_at'
>;

/** Import row DTO for API responses */
export type ImportRowDTO = Pick<
  ImportRowRow,
  | 'id'
  | 'batch_id'
  | 'row_number'
  | 'raw_row'
  | 'normalized_payload'
  | 'status'
  | 'reason_code'
  | 'reason_detail'
  | 'matched_player_id'
  | 'created_at'
>;

// === Filter Types ===

/** Filters for batch list queries */
export type ImportBatchListFilters = {
  /** Filter by batch status */
  status?: ImportBatchStatus;
  /** Cursor for pagination (created_at timestamp) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

/** Filters for row list queries within a batch */
export type ImportRowListFilters = {
  /** Filter by row status */
  status?: ImportRowStatus;
  /** Cursor for pagination (row_number) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

// === Input Types ===

/** Input for creating a new import batch */
export type CreateBatchInput = {
  idempotency_key: string;
  file_name: string;
  vendor_label?: string;
  column_mapping: ColumnMapping;
};

/** A single row to stage */
export type StageRowInput = {
  row_number: number;
  raw_row: Record<string, unknown>;
  normalized_payload: ImportPlayerV1;
};
