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
  ColumnMapping,
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

// === Service Interface ===

/**
 * PlayerImportService interface — explicit, no ReturnType inference.
 */
export interface PlayerImportServiceInterface {
  /**
   * Create a new import batch (idempotent via idempotency_key).
   * Returns existing batch if key matches.
   */
  createBatch(input: {
    idempotency_key: string;
    file_name: string;
    vendor_label?: string;
    column_mapping: ColumnMapping;
  }): Promise<ImportBatchDTO>;

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
  };
}
