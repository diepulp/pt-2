/**
 * Ingestion Pipeline
 *
 * Streams, parses, normalizes, validates, and inserts a single CSV batch.
 * This is the hot path: every row in every uploaded CSV flows through here.
 *
 * Pipeline stages:
 * 1. Convert Web ReadableStream → Node.js Readable
 * 2. Pipe through csv-parse (raw string arrays, no auto-column detection)
 * 3. First record → extract and normalize headers
 * 4. Each subsequent record → normalizeRow → validateRow → accumulate in chunk
 * 5. Every CHUNK_SIZE rows → insertRows + progress update + conditional heartbeat
 * 6. Remaining rows → final insertRows flush
 * 7. completeBatch (status = 'staging') with final report
 *
 * Row cap:
 * Batches exceeding ROW_CAP rows are immediately failed with 'BATCH_ROW_LIMIT'.
 * This protects the worker from unbounded memory growth and long-running
 * transactions. The cap is 10,001 rows (cap check fires at row 10,001).
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import { Readable } from 'node:stream';

import { parse } from 'csv-parse';
import pg from 'pg';

import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { normalizeHeaders, normalizeRow } from './normalize.js';
import type { ClaimedBatch, RowInsert } from './repo.js';
import * as repo from './repo.js';
import { validateRow } from './validate.js';
import type { ValidationResult } from './validate.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard row limit per batch.
 * The check fires when rowNumber reaches this value (i.e. the 10,001st data row).
 */
const ROW_CAP = 10_001;

/**
 * Minimum interval between heartbeat refreshes (milliseconds).
 * Heartbeats also occur after every chunk flush, but no more frequently
 * than this to avoid redundant writes.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Final ingestion report written to `import_batch.report_summary`.
 * Shape is `ImportIngestionReportV1` (services/player-import/dtos.ts).
 */
export interface IngestionReport {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  parse_errors: number;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full ingestion pipeline for a claimed batch.
 *
 * @param pool - Active pg.Pool for all DB writes.
 * @param batch - The claimed batch (source of truth for casino_id and column_mapping).
 * @param csvStream - Web ReadableStream of raw CSV bytes from Storage.
 * @param config - Validated worker configuration (CHUNK_SIZE, etc.).
 * @param logger - Structured logger bound to this worker instance.
 * @returns Final ingestion report.
 * @throws Error with code 'BATCH_ROW_LIMIT' if the row cap is exceeded.
 *         The batch is failed in the DB before the error is thrown.
 * @throws Any csv-parse or pg error propagates to the caller (poll loop).
 */
export async function ingestBatch(
  pool: pg.Pool,
  batch: ClaimedBatch,
  csvStream: ReadableStream<Uint8Array>,
  config: Config,
  logger: Logger,
): Promise<IngestionReport> {
  const startedAt = new Date();

  let rowNumber = 0;
  let validRows = 0;
  let invalidRows = 0;
  const parseErrors = 0; // csv-parse with relax_column_count rarely throws; kept for completeness
  let headerRow: string[] | null = null;
  let normalizedHeaders: string[] = [];

  const chunk: ValidationResult[] = [];
  let lastHeartbeatMs = Date.now();

  // Source metadata for the ImportPlayerV1 payload.
  const sourceMeta = {
    file_name: batch.original_file_name ?? undefined,
  };

  // Convert Web ReadableStream → Node.js Readable so csv-parse can consume it.
  // `Readable.fromWeb` is available in Node 18+.
  const nodeStream = Readable.fromWeb(
    csvStream as Parameters<typeof Readable.fromWeb>[0],
  );

  const parser = nodeStream.pipe(
    parse({
      // Receive each row as a raw string array (columns: false).
      // We derive column names from the first row ourselves using normalizeHeaders.
      columns: false,
      skip_empty_lines: true,
      // Tolerate rows with more or fewer fields than the header row.
      relax_column_count: true,
      trim: true,
    }),
  );

  for await (const record of parser) {
    const fields = record as string[];

    // --- Header row ---
    if (headerRow === null) {
      headerRow = fields;
      normalizedHeaders = normalizeHeaders(headerRow);
      logger.info('CSV headers normalized', {
        batch_id: batch.id,
        header_count: normalizedHeaders.length,
      });
      continue;
    }

    // --- Row cap check (fires at ROW_CAP, i.e. the 10,001st data row) ---
    rowNumber++;
    if (rowNumber >= ROW_CAP) {
      await repo.failBatch(pool, batch.id, 'BATCH_ROW_LIMIT');
      logger.error('Row cap exceeded — batch failed', {
        batch_id: batch.id,
        row_count: rowNumber,
        cap: ROW_CAP,
      });
      // Signal to the poll loop that this was an expected cap failure, not a
      // transient error — so the poll loop does not retry the same batch.
      throw new Error('BATCH_ROW_LIMIT');
    }

    // --- Build raw row object keyed by normalized header names ---
    const rawRow: Record<string, string | null> = {};
    for (let i = 0; i < normalizedHeaders.length; i++) {
      // Fields beyond the header count are discarded (relax_column_count may
      // produce extra columns for malformed rows — ignore them).
      rawRow[normalizedHeaders[i]!] =
        fields[i] !== undefined ? fields[i]! : null;
    }

    // --- Normalize and validate ---
    const normalized = normalizeRow(
      rawRow,
      normalizedHeaders,
      batch.column_mapping,
      rowNumber,
      sourceMeta,
    );
    const result = validateRow(normalized);

    if (result.valid) {
      validRows++;
    } else {
      invalidRows++;
    }

    chunk.push(result);

    // --- Flush chunk ---
    if (chunk.length >= config.CHUNK_SIZE) {
      await flushChunk(pool, batch, chunk, logger);
      chunk.length = 0;

      // Heartbeat after each flush, but throttled to HEARTBEAT_INTERVAL_MS.
      const now = Date.now();
      if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        await repo.updateHeartbeat(pool, batch.id);
        lastHeartbeatMs = now;
      }

      await repo.updateProgress(pool, batch.id, rowNumber);
    }
  }

  // --- Final flush for the remaining partial chunk ---
  if (chunk.length > 0) {
    await flushChunk(pool, batch, chunk, logger);
  }

  // --- Complete the batch ---
  const completedAt = new Date();
  const report: IngestionReport = {
    total_rows: rowNumber,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    duplicate_rows: 0, // ON CONFLICT DO NOTHING — duplicates are silently skipped
    parse_errors: parseErrors,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
  };

  await repo.completeBatch(
    pool,
    batch.id,
    rowNumber,
    report as unknown as Record<string, unknown>,
  );

  logger.info('Batch ingestion complete', {
    batch_id: batch.id,
    casino_id: batch.casino_id,
    total_rows: rowNumber,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    duration_ms: report.duration_ms,
  });

  return report;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Flush accumulated validation results to the database.
 *
 * Builds the `RowInsert` array using `batch.id` and `batch.casino_id`
 * exclusively (INV-W3, INV-W5 enforcement at the call site).
 *
 * @param pool - Active pg.Pool.
 * @param batch - The claimed batch — source of `batch_id` and `casino_id`.
 * @param chunk - Accumulated validation results to insert.
 * @param logger - Logger for diagnostic output.
 */
async function flushChunk(
  pool: pg.Pool,
  batch: ClaimedBatch,
  chunk: ValidationResult[],
  logger: Logger,
): Promise<void> {
  const rows: RowInsert[] = chunk.map((r) => ({
    batch_id: batch.id, // INV-W3: from claimed batch
    casino_id: batch.casino_id, // INV-W5: from claimed batch only
    row_number: r.row_number,
    raw_row: r.raw_row,
    normalized_payload: r.normalized_payload as unknown as Record<
      string,
      unknown
    >,
    status: r.status,
    reason_code: r.reason_code,
    reason_detail: r.reason_detail,
  }));

  await repo.insertRows(pool, rows);

  logger.info('Chunk flushed', {
    batch_id: batch.id,
    chunk_size: rows.length,
  });
}
