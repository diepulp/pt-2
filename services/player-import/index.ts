/**
 * PlayerImportService Factory
 *
 * Functional factory for CSV player import operations.
 * Pattern C (Hybrid): Pattern A canonical contracts + Pattern B CRUD DTOs.
 *
 * @see PRD-037 CSV Player Import
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §PlayerImportService
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  CreateBatchInput,
  ImportBatchDTO,
  ImportBatchListFilters,
  ImportRowDTO,
  ImportRowListFilters,
  StageRowInput,
} from './dtos';

// Re-export DTOs for consumers
export * from './dtos';
export * from './keys';
// Note: HTTP fetchers are NOT re-exported per GOV-PAT-001 - import directly from "./http"

// Re-export toImportIngestionReportV1 for consumers that need to map worker reports
export { toImportIngestionReportV1 } from './mappers';

// === Service Interface ===

/**
 * PlayerImportService interface — explicit, no ReturnType inference.
 */
export interface PlayerImportServiceInterface {
  /**
   * Create a new import batch (idempotent via idempotency_key).
   * Returns existing batch if key matches.
   *
   * Pass `initial_status: 'created'` for the server ingestion flow (PRD-039)
   * where the file upload happens separately after batch creation.
   */
  createBatch(input: CreateBatchInput): Promise<ImportBatchDTO>;

  /**
   * Stage rows into a batch (idempotent per row_number).
   * Max 2000 rows per chunk. Server enforces 10,000 total.
   */
  stageRows(batchId: string, rows: StageRowInput[]): Promise<ImportBatchDTO>;

  /**
   * Execute batch merge (idempotent — re-execution returns same report).
   * Transitions batch: staging → executing → completed/failed.
   */
  executeBatch(batchId: string): Promise<ImportBatchDTO>;

  /**
   * Get batch by ID. Returns null if not found or not visible.
   */
  getBatch(batchId: string): Promise<ImportBatchDTO | null>;

  /**
   * List batches with optional filters and cursor pagination.
   */
  listBatches(filters?: ImportBatchListFilters): Promise<{
    items: ImportBatchDTO[];
    cursor: string | null;
  }>;

  /**
   * List rows within a batch with optional filters and cursor pagination.
   */
  listRows(
    batchId: string,
    filters?: ImportRowListFilters,
  ): Promise<{
    items: ImportRowDTO[];
    cursor: string | null;
  }>;

  /**
   * Update the storage path and original file name on a batch and transition
   * its status to 'uploaded'. Called by the upload route handler (WS4) after
   * a successful Supabase Storage upload.
   *
   * @param batchId          - UUID of the batch to update
   * @param storagePath      - Full storage object path (e.g. imports/casino_id/batch_id.csv)
   * @param originalFileName - Original file name from the multipart upload
   */
  updateBatchStoragePath(
    batchId: string,
    storagePath: string,
    originalFileName: string,
  ): Promise<ImportBatchDTO>;
}

// === Service Factory ===

/**
 * Creates a PlayerImportService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createPlayerImportService(
  supabase: SupabaseClient<Database>,
): PlayerImportServiceInterface {
  return {
    createBatch: (input) => crud.createBatch(supabase, input),

    stageRows: (batchId, rows) => crud.stageRows(supabase, batchId, rows),

    executeBatch: (batchId) => crud.executeBatch(supabase, batchId),

    getBatch: (batchId) => crud.getBatch(supabase, batchId),

    listBatches: (filters) => crud.listBatches(supabase, filters),

    listRows: (batchId, filters) => crud.listRows(supabase, batchId, filters),

    updateBatchStoragePath: (batchId, storagePath, originalFileName) =>
      crud.updateBatchStoragePath(
        supabase,
        batchId,
        storagePath,
        originalFileName,
      ),
  };
}
