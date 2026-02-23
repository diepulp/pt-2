/**
 * PlayerImportService HTTP Fetchers
 *
 * Client-side fetch functions for PlayerImport API endpoints.
 * All mutations include Idempotency-Key header (ADR-021).
 *
 * @see PRD-037 CSV Player Import
 * @see ADR-021 Idempotency Header Standardization
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type {
  ImportBatchDTO,
  ImportBatchListFilters,
  ImportRowDTO,
  ImportRowListFilters,
  StageRowInput,
} from './dtos';

const BASE = '/api/v1/player-import/batches';

// === Helper Functions ===

function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

// === Batch Operations ===

/**
 * Create a new import batch (idempotent).
 * Caller must provide their own idempotency key for batch-level dedup.
 */
export async function createBatch(
  input: {
    idempotency_key: string;
    file_name: string;
    vendor_label?: string;
    column_mapping: Record<string, string>;
  },
  idempotencyKey: string,
): Promise<ImportBatchDTO> {
  return fetchJSON<ImportBatchDTO>(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

/** List import batches with optional filters */
export async function listBatches(
  filters: ImportBatchListFilters = {},
): Promise<{ items: ImportBatchDTO[]; cursor: string | null }> {
  const params = buildParams(filters);
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: ImportBatchDTO[]; cursor: string | null }>(url);
}

/** Get a single batch by ID */
export async function getBatch(batchId: string): Promise<ImportBatchDTO> {
  return fetchJSON<ImportBatchDTO>(`${BASE}/${batchId}`);
}

// === Row Operations ===

/**
 * Stage rows into a batch (idempotent per row_number).
 * Max 2000 rows per chunk.
 */
export async function stageRows(
  batchId: string,
  rows: StageRowInput[],
  idempotencyKey: string,
): Promise<ImportBatchDTO> {
  return fetchJSON<ImportBatchDTO>(`${BASE}/${batchId}/rows`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify({ rows }),
  });
}

/** List rows within a batch with optional filters */
export async function listRows(
  batchId: string,
  filters: ImportRowListFilters = {},
): Promise<{ items: ImportRowDTO[]; cursor: string | null }> {
  const params = buildParams(filters);
  const url = params.toString()
    ? `${BASE}/${batchId}/rows?${params}`
    : `${BASE}/${batchId}/rows`;
  return fetchJSON<{ items: ImportRowDTO[]; cursor: string | null }>(url);
}

// === Execute ===

/**
 * Execute batch merge (idempotent — re-execution returns same report).
 */
export async function executeBatch(
  batchId: string,
  idempotencyKey: string,
): Promise<ImportBatchDTO> {
  return fetchJSON<ImportBatchDTO>(`${BASE}/${batchId}/execute`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
  });
}
