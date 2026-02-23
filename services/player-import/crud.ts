/**
 * PlayerImportService CRUD Operations
 *
 * Database operations via SECURITY DEFINER RPCs.
 * No direct table inserts for import_batch/import_row — all writes go through RPCs.
 * Reads use direct Supabase queries (RLS-protected).
 *
 * @see PRD-037 CSV Player Import
 * @see docs/21-exec-spec/EXEC-037-csv-player-import.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  ColumnMapping,
  ImportBatchDTO,
  ImportBatchListFilters,
  ImportRowDTO,
  ImportRowListFilters,
  StageRowInput,
} from './dtos';
import {
  toImportBatchDTO,
  toImportBatchDTOList,
  toImportBatchDTOOrNull,
  toImportRowDTOList,
  toRpcColumnMapping,
  toRpcStageRows,
} from './mappers';

// === Batch Operations ===

/**
 * Create a new import batch via RPC (idempotent).
 * Returns existing batch if idempotency_key matches.
 */
export async function createBatch(
  supabase: SupabaseClient<Database>,
  input: {
    idempotency_key: string;
    file_name: string;
    vendor_label?: string;
    column_mapping: ColumnMapping;
  },
): Promise<ImportBatchDTO> {
  const { data, error } = await supabase.rpc('rpc_import_create_batch', {
    p_idempotency_key: input.idempotency_key,
    p_file_name: input.file_name,
    p_vendor_label: input.vendor_label ?? undefined,
    p_column_mapping: toRpcColumnMapping(input.column_mapping),
  });

  if (error) {
    throw mapRpcError(error);
  }

  if (!data) {
    throw new DomainError('IMPORT_BATCH_NOT_FOUND', 'Failed to create batch');
  }

  return toImportBatchDTO(data);
}

/**
 * Stage rows into a batch via RPC (idempotent per row_number).
 * Returns updated batch with new total_rows.
 */
export async function stageRows(
  supabase: SupabaseClient<Database>,
  batchId: string,
  rows: StageRowInput[],
): Promise<ImportBatchDTO> {
  const { data, error } = await supabase.rpc('rpc_import_stage_rows', {
    p_batch_id: batchId,
    p_rows: toRpcStageRows(rows),
  });

  if (error) {
    throw mapRpcError(error);
  }

  if (!data) {
    throw new DomainError('IMPORT_BATCH_NOT_FOUND', 'Batch not found');
  }

  return toImportBatchDTO(data);
}

/**
 * Execute batch merge via RPC (idempotent — re-execution returns same report).
 */
export async function executeBatch(
  supabase: SupabaseClient<Database>,
  batchId: string,
): Promise<ImportBatchDTO> {
  const { data, error } = await supabase.rpc('rpc_import_execute', {
    p_batch_id: batchId,
  });

  if (error) {
    throw mapRpcError(error);
  }

  if (!data) {
    throw new DomainError('IMPORT_BATCH_NOT_FOUND', 'Batch not found');
  }

  return toImportBatchDTO(data);
}

/**
 * Get a single batch by ID (RLS-protected read).
 */
export async function getBatch(
  supabase: SupabaseClient<Database>,
  batchId: string,
): Promise<ImportBatchDTO | null> {
  const { data, error } = await supabase
    .from('import_batch')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message);
  }

  return toImportBatchDTOOrNull(data);
}

/**
 * List batches with optional filters and cursor pagination (RLS-protected).
 */
export async function listBatches(
  supabase: SupabaseClient<Database>,
  filters: ImportBatchListFilters = {},
): Promise<{ items: ImportBatchDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('import_batch')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.cursor) {
    query = query.lt('created_at', filters.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = toImportBatchDTOList(hasMore ? rows.slice(0, limit) : rows);
  const cursor = hasMore ? items[items.length - 1].created_at : null;

  return { items, cursor };
}

/**
 * List rows within a batch with optional filters and cursor pagination (RLS-protected).
 */
export async function listRows(
  supabase: SupabaseClient<Database>,
  batchId: string,
  filters: ImportRowListFilters = {},
): Promise<{ items: ImportRowDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 50;

  let query = supabase
    .from('import_row')
    .select('*')
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.cursor) {
    query = query.gt('row_number', Number(filters.cursor));
  }

  const { data, error } = await query;

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = toImportRowDTOList(hasMore ? rows.slice(0, limit) : rows);
  const cursor = hasMore ? String(items[items.length - 1].row_number) : null;

  return { items, cursor };
}

// === Error Mapping ===

function mapRpcError(error: { code?: string; message: string }): DomainError {
  const msg = error.message;

  if (msg.includes('IMPORT_BATCH_NOT_FOUND')) {
    return new DomainError('IMPORT_BATCH_NOT_FOUND');
  }
  if (msg.includes('IMPORT_BATCH_NOT_STAGING')) {
    return new DomainError('IMPORT_BATCH_NOT_STAGING');
  }
  if (msg.includes('IMPORT_BATCH_ALREADY_EXECUTING')) {
    return new DomainError('IMPORT_BATCH_ALREADY_EXECUTING');
  }
  if (msg.includes('IMPORT_ROW_NO_IDENTIFIER')) {
    return new DomainError('IMPORT_ROW_NO_IDENTIFIER');
  }
  if (msg.includes('IMPORT_ROW_VALIDATION_FAILED')) {
    return new DomainError('IMPORT_ROW_VALIDATION_FAILED');
  }
  if (msg.includes('IMPORT_IDEMPOTENCY_CONFLICT')) {
    return new DomainError('IMPORT_IDEMPOTENCY_CONFLICT');
  }
  if (msg.includes('IMPORT_SIZE_LIMIT_EXCEEDED')) {
    return new DomainError('IMPORT_SIZE_LIMIT_EXCEEDED');
  }
  if (msg.includes('FORBIDDEN')) {
    return new DomainError('FORBIDDEN', msg);
  }
  if (msg.includes('unauthenticated') || error.code === '28000') {
    return new DomainError('UNAUTHORIZED');
  }

  return new DomainError('INTERNAL_ERROR', msg);
}
