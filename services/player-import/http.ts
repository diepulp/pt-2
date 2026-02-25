/**
 * PlayerImportService HTTP Fetchers
 *
 * Client-side fetch functions for PlayerImport API endpoints.
 * All mutations include Idempotency-Key header (ADR-021).
 *
 * @see PRD-037 CSV Player Import
 * @see ADR-021 Idempotency Header Standardization
 */

import { FetchError, fetchJSON } from '@/lib/http/fetch-json';
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
 *
 * Pass `initial_status: 'created'` for the server-side upload flow where the
 * file has not been uploaded yet. Omit for the legacy client-side staging flow.
 */
export async function createBatch(
  input: {
    idempotency_key: string;
    file_name: string;
    vendor_label?: string;
    column_mapping: Record<string, string>;
    initial_status?: 'staging' | 'created';
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

// === Upload ===

/**
 * Upload a CSV file for an existing import batch (PRD-039 server ingestion flow).
 *
 * Sends the file as multipart/form-data. The browser (or environment) sets the
 * Content-Type header with the correct boundary — do NOT set it manually.
 *
 * The route handler stores the file in Supabase Storage and transitions the
 * batch to 'uploaded' status before returning the updated DTO.
 *
 * @param batchId       - UUID of the import batch (must be in 'created' status)
 * @param file          - CSV file to upload
 * @param idempotencyKey - Caller-supplied idempotency key (ADR-021)
 * @returns Updated ImportBatchDTO with storage_path and 'uploaded' status
 */
export async function uploadFile(
  batchId: string,
  file: File,
  idempotencyKey: string,
): Promise<ImportBatchDTO> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE}/${batchId}/upload`, {
    method: 'POST',
    headers: {
      // NOTE: Do NOT set Content-Type — browser sets multipart/form-data + boundary
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: formData,
  });

  if (!response.ok) {
    let code = 'INTERNAL_ERROR';
    let message = `Upload failed with status ${response.status}`;
    try {
      const body: Record<string, unknown> = await response.json();
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Body was not JSON — keep the default message
    }
    throw new FetchError(message, response.status, code);
  }

  const body: Record<string, unknown> = await response.json();
  const data = body.data as ImportBatchDTO | undefined;
  if (!body.ok || !data) {
    const errMsg =
      typeof body.error === 'string'
        ? body.error
        : 'Upload response missing data';
    const errCode =
      typeof body.code === 'string' ? body.code : 'INTERNAL_ERROR';
    const errStatus =
      typeof body.status === 'number' ? body.status : response.status;
    throw new FetchError(errMsg, errStatus, errCode);
  }

  return data;
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
