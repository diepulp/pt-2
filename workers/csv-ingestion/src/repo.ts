/**
 * ImportBatchRepo — THE SECURITY BOUNDARY
 *
 * ALL database access for the CSV ingestion worker flows through this module.
 * No other module in the worker may issue SQL queries directly.
 *
 * Security invariants enforced here:
 *
 * | ID    | Invariant                                                               |
 * |-------|-------------------------------------------------------------------------|
 * | INV-W1| Every UPDATE import_batch includes WHERE id = $batch_id              |
 * | INV-W2| Reaper: reset includes AND attempt_count < $max; fail includes >=      |
 * | INV-W3| Every INSERT import_row binds batch_id AND casino_id from claimed batch |
 * | INV-W4| Only import_batch and import_row tables are ever queried               |
 * | INV-W5| casino_id for inserts comes ONLY from the claimed batch row            |
 * | INV-W6| Claim CTE selects WHERE status = 'uploaded' only                      |
 * | INV-W7| Worker may only set status to 'parsing', 'staging', or 'failed'       |
 *
 * All queries use parameterized placeholders ($1, $2, …). String interpolation
 * into SQL is strictly forbidden in this file.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 * @see ADR-037 Server CSV Ingestion Worker
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A batch row returned after a successful claim CTE.
 * Contains only the fields the worker needs — no sensitive columns are fetched
 * beyond what is required to process and identify the batch.
 */
export interface ClaimedBatch {
  /** Primary key of the import_batch row. */
  id: string;
  /** Casino that owns this batch. Sourced ONLY from the DB row (INV-W5). */
  casino_id: string;
  /** Path in Supabase Storage (e.g. `imports/<casino_id>/<batch_id>.csv`). */
  storage_path: string | null;
  /** Original file name supplied by the uploader. */
  original_file_name: string | null;
  /**
   * Maps canonical field names → original CSV header names.
   * Stored as JSONB in the DB; parsed to a plain object here.
   */
  column_mapping: Record<string, string>;
  /** Number of prior claim attempts (1-indexed after this claim increments it). */
  attempt_count: number;
}

/**
 * A single row ready to be bulk-inserted into import_row.
 * `batch_id` and `casino_id` MUST come from the claimed batch (INV-W3, INV-W5).
 */
export interface RowInsert {
  /** FK to import_batch.id — from claimed batch only. */
  batch_id: string;
  /** FK to casino.id — from claimed batch only (INV-W5). */
  casino_id: string;
  /** 1-indexed position in the CSV file. */
  row_number: number;
  /** Raw key-value pairs from the original CSV row. */
  raw_row: Record<string, string | null>;
  /**
   * Structured ImportPlayerV1 payload produced by the normalize + validate
   * pipeline. Stored as JSONB. The execute RPC reads nested paths like
   * `normalized_payload -> 'identifiers' ->> 'email'`.
   */
  normalized_payload: Record<string, unknown>;
  /** 'staged' for valid rows, 'error' for rows that failed validation. */
  status: 'staged' | 'error';
  /** Short machine-readable error code, or null for staged rows. */
  reason_code: string | null;
  /** Human-readable error detail, or null for staged rows. */
  reason_detail: string | null;
}

/**
 * Counts of batches affected by the reaper on a single run.
 */
export interface ReaperResult {
  /** Batches reset to 'uploaded' for retry (attempt_count < max). */
  reset: number;
  /** Batches permanently failed because attempt_count >= max. */
  failed: number;
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

/**
 * Atomically claim the oldest 'uploaded' batch using a CTE with
 * `FOR UPDATE SKIP LOCKED`. Only one worker instance wins the lock;
 * concurrent workers skip it and move on.
 *
 * INV-W1: WHERE id = (subquery) ensures we update only the locked row.
 * INV-W6: Subquery WHERE status = 'uploaded' only.
 * INV-W7: Sets status to 'parsing' only.
 *
 * @param pool - Active pg.Pool.
 * @param workerId - Identifier of this worker instance, stored in claimed_by.
 * @returns The claimed batch, or null if no 'uploaded' batch is available.
 */
export async function claimBatch(
  pool: pg.Pool,
  workerId: string,
): Promise<ClaimedBatch | null> {
  // INV-W6: subquery restricts to status = 'uploaded'
  // INV-W7: sets status = 'parsing'
  // INV-W1: outer WHERE id = (subquery result)
  const sql = `
    UPDATE public.import_batch
    SET
      status       = 'parsing',
      claimed_by   = $1,
      claimed_at   = NOW(),
      heartbeat_at = NOW(),
      attempt_count = attempt_count + 1
    WHERE id = (
      SELECT id
      FROM public.import_batch
      WHERE status = 'uploaded'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      casino_id,
      storage_path,
      original_file_name,
      column_mapping,
      attempt_count
  `;

  const result = await pool.query<{
    id: string;
    casino_id: string;
    storage_path: string | null;
    original_file_name: string | null;
    column_mapping: Record<string, string>;
    attempt_count: number;
  }>(sql, [workerId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    casino_id: row.casino_id,
    storage_path: row.storage_path,
    original_file_name: row.original_file_name,
    // pg returns JSONB as a parsed object; ensure it's the right shape.
    column_mapping: (row.column_mapping ?? {}) as Record<string, string>,
    attempt_count: row.attempt_count,
  };
}

// ---------------------------------------------------------------------------
// Reaper
// ---------------------------------------------------------------------------

/**
 * Detect and recover stale batches that were claimed but not completed.
 *
 * Runs two queries in sequence:
 * 1. Reset: batches where `attempt_count < maxAttempts` are set back to
 *    'uploaded' so another worker can claim them.
 * 2. Fail: batches where `attempt_count >= maxAttempts` are permanently
 *    failed with error code 'MAX_ATTEMPTS_EXCEEDED'.
 *
 * INV-W2: reset predicate includes `AND attempt_count < $2`;
 *         fail predicate includes `AND attempt_count >= $2`.
 * INV-W1: Both queries include `WHERE status = 'parsing'` — the heartbeat
 *         filter is additional; there is no bare unscoped UPDATE.
 *
 * @param pool - Active pg.Pool.
 * @param thresholdMs - Milliseconds of missed heartbeat before a batch is stale.
 * @param maxAttempts - Maximum attempts before a batch is permanently failed.
 * @returns Counts of batches reset and failed.
 */
export async function reapStaleBatches(
  pool: pg.Pool,
  thresholdMs: number,
  maxAttempts: number,
): Promise<ReaperResult> {
  // INV-W2 reset branch: attempt_count < maxAttempts
  // INV-W7 exception: reaper may set 'uploaded' for retry (documented)
  const resetSql = `
    UPDATE public.import_batch
    SET
      status       = 'uploaded',
      claimed_by   = NULL,
      claimed_at   = NULL,
      heartbeat_at = NULL
    WHERE
      status = 'parsing'
      AND heartbeat_at < NOW() - ($1 || ' milliseconds')::interval
      AND attempt_count < $2
  `;

  // INV-W2 fail branch: attempt_count >= maxAttempts
  // INV-W1: WHERE status = 'parsing' + heartbeat filter
  // INV-W7: sets status to 'failed'
  const failSql = `
    UPDATE public.import_batch
    SET
      status         = 'failed',
      last_error_code = 'MAX_ATTEMPTS_EXCEEDED',
      last_error_at  = NOW()
    WHERE
      status = 'parsing'
      AND heartbeat_at < NOW() - ($1 || ' milliseconds')::interval
      AND attempt_count >= $2
  `;

  const [resetResult, failResult] = await Promise.all([
    pool.query(resetSql, [thresholdMs, maxAttempts]),
    pool.query(failSql, [thresholdMs, maxAttempts]),
  ]);

  return {
    reset: resetResult.rowCount ?? 0,
    failed: failResult.rowCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Heartbeat / Progress
// ---------------------------------------------------------------------------

/**
 * Refresh the heartbeat timestamp on a claimed batch.
 *
 * INV-W1: WHERE id = $1 is always present.
 *
 * @param pool - Active pg.Pool.
 * @param batchId - ID of the batch currently being processed.
 */
export async function updateHeartbeat(
  pool: pg.Pool,
  batchId: string,
): Promise<void> {
  const sql = `
    UPDATE public.import_batch
    SET heartbeat_at = NOW()
    WHERE id = $1
  `;
  await pool.query(sql, [batchId]);
}

/**
 * Update the running row count and refresh the heartbeat.
 * Called after each chunk flush so progress is visible in the dashboard.
 *
 * INV-W1: WHERE id = $2 is always present.
 *
 * @param pool - Active pg.Pool.
 * @param batchId - ID of the batch being processed.
 * @param rowCount - Total rows processed so far (not the chunk count).
 */
export async function updateProgress(
  pool: pg.Pool,
  batchId: string,
  rowCount: number,
): Promise<void> {
  const sql = `
    UPDATE public.import_batch
    SET
      total_rows   = $2,
      heartbeat_at = NOW()
    WHERE id = $1
  `;
  await pool.query(sql, [batchId, rowCount]);
}

// ---------------------------------------------------------------------------
// Terminal Transitions
// ---------------------------------------------------------------------------

/**
 * Mark a batch as 'staging' (ready for the execute RPC) and record the final
 * ingestion report in `report_summary`.
 *
 * INV-W1: WHERE id = $1.
 * INV-W7: Sets status to 'staging'.
 *
 * @param pool - Active pg.Pool.
 * @param batchId - ID of the completed batch.
 * @param totalRows - Final row count written.
 * @param reportSummary - Ingestion report object to persist as JSONB.
 */
export async function completeBatch(
  pool: pg.Pool,
  batchId: string,
  totalRows: number,
  reportSummary: Record<string, unknown>,
): Promise<void> {
  const sql = `
    UPDATE public.import_batch
    SET
      status         = 'staging',
      total_rows     = $2,
      report_summary = $3,
      heartbeat_at   = NOW()
    WHERE id = $1
  `;
  await pool.query(sql, [batchId, totalRows, JSON.stringify(reportSummary)]);
}

/**
 * Mark a batch as 'failed' and record the error code.
 *
 * INV-W1: WHERE id = $1.
 * INV-W7: Sets status to 'failed'.
 *
 * @param pool - Active pg.Pool.
 * @param batchId - ID of the failed batch.
 * @param errorCode - Short machine-readable code (e.g. 'BATCH_ROW_LIMIT').
 */
export async function failBatch(
  pool: pg.Pool,
  batchId: string,
  errorCode: string,
): Promise<void> {
  const sql = `
    UPDATE public.import_batch
    SET
      status         = 'failed',
      last_error_code = $2,
      last_error_at  = NOW()
    WHERE id = $1
  `;
  await pool.query(sql, [batchId, errorCode]);
}

// ---------------------------------------------------------------------------
// Row Insertion
// ---------------------------------------------------------------------------

/**
 * Bulk-insert a chunk of processed rows into `import_row`.
 *
 * Uses `ON CONFLICT (batch_id, row_number) DO NOTHING` to make re-runs
 * idempotent. The unique constraint `uq_import_row_batch_row` is required;
 * the migration 20260225145407 asserts its existence at deploy time.
 *
 * INV-W3: Every row receives `batch_id` and `casino_id` from the caller,
 *         which sources them exclusively from the claimed batch (INV-W5).
 * INV-W4: Only `import_row` is written here.
 *
 * @param pool - Active pg.Pool.
 * @param rows - Array of row inserts. Must be non-empty.
 */
export async function insertRows(
  pool: pg.Pool,
  rows: RowInsert[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  // Build a multi-row VALUES clause with numbered placeholders.
  // Each row occupies 7 parameters:
  //   $N+0 batch_id
  //   $N+1 casino_id
  //   $N+2 row_number
  //   $N+3 raw_row (JSONB)
  //   $N+4 normalized_payload (JSONB)
  //   $N+5 status
  //   $N+6 reason_code
  //   $N+7 reason_detail
  const COLS_PER_ROW = 8;
  const valuePlaceholders = rows
    .map((_, i) => {
      const base = i * COLS_PER_ROW + 1;
      return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    })
    .join(', ');

  const sql = `
    INSERT INTO public.import_row
      (batch_id, casino_id, row_number, raw_row, normalized_payload, status, reason_code, reason_detail)
    VALUES
      ${valuePlaceholders}
    ON CONFLICT (batch_id, row_number) DO NOTHING
  `;

  const params: unknown[] = [];
  for (const row of rows) {
    params.push(
      row.batch_id, // $N+0 INV-W3: from claimed batch
      row.casino_id, // $N+1 INV-W5: from claimed batch only
      row.row_number,
      JSON.stringify(row.raw_row),
      JSON.stringify(row.normalized_payload),
      row.status,
      row.reason_code,
      row.reason_detail,
    );
  }

  await pool.query(sql, params);
}
