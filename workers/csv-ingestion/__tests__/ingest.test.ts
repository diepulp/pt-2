/** @jest-environment node */

/**
 * Ingestion Pipeline Tests
 *
 * Tests the ingestBatch orchestration with mocked repo functions.
 * Verifies: chunk insertion, row cap (10,001), heartbeat updates,
 * progress reporting, and final report generation.
 *
 * @see workers/csv-ingestion/src/ingest.ts
 */

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------
jest.mock('../src/repo', () => ({
  failBatch: jest.fn().mockResolvedValue(undefined),
  updateHeartbeat: jest.fn().mockResolvedValue(undefined),
  updateProgress: jest.fn().mockResolvedValue(undefined),
  completeBatch: jest.fn().mockResolvedValue(undefined),
  insertRows: jest.fn().mockResolvedValue(undefined),
}));

import { ingestBatch } from '../src/ingest';
import * as repo from '../src/repo';
import type { ClaimedBatch, RowInsert } from '../src/repo';
import type { Config } from '../src/config';
import type { Logger } from '../src/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedRepo = repo as jest.Mocked<typeof repo>;

function createMockLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    DATABASE_URL: 'postgres://localhost/test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    POLL_INTERVAL_MS: 5000,
    REAPER_HEARTBEAT_THRESHOLD_MS: 300_000,
    STORAGE_SIGNED_URL_EXPIRY_SECONDS: 600,
    MAX_ATTEMPTS: 3,
    CHUNK_SIZE: 5, // Small chunk size for testing
    STATEMENT_TIMEOUT_MS: 60_000,
    HEALTH_PORT: 8080,
    WORKER_ID: 'test-worker',
    ...overrides,
  };
}

function createMockBatch(overrides: Partial<ClaimedBatch> = {}): ClaimedBatch {
  return {
    id: 'batch-1',
    casino_id: 'casino-1',
    storage_path: 'imports/casino-1/batch-1/file.csv',
    original_file_name: 'players.csv',
    column_mapping: {
      email: 'Email',
      phone: 'Phone',
      first_name: 'First Name',
      last_name: 'Last Name',
    },
    attempt_count: 1,
    ...overrides,
  };
}

/**
 * Create a Web ReadableStream from CSV text.
 * Uses the Web Streams API available in Node 18+.
 */
function createCsvStream(csvText: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(csvText));
      controller.close();
    },
  });
}

/**
 * Generate CSV text with a header row and N data rows.
 * Each row has valid player data.
 */
function generateCsv(rowCount: number): string {
  const header = 'Email,Phone,First Name,Last Name';
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const n = i + 1;
    return `player${n}@example.com,555-${String(n).padStart(4, '0')},Player${n},Last${n}`;
  });
  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic ingestion
// ---------------------------------------------------------------------------
describe('ingestBatch — basic flow', () => {
  it('ingests a small CSV and calls completeBatch', async () => {
    const csv = generateCsv(3);
    const stream = createCsvStream(csv);
    const batch = createMockBatch();
    const config = createMockConfig();
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never, // pool not used (repo is mocked)
      batch,
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(3);
    expect(report.valid_rows).toBe(3);
    expect(report.invalid_rows).toBe(0);
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
    expect(mockedRepo.failBatch).not.toHaveBeenCalled();
  });

  it('returns an IngestionReport with timing info', async () => {
    const csv = generateCsv(2);
    const stream = createCsvStream(csv);
    const config = createMockConfig();
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.started_at).toBeDefined();
    expect(report.completed_at).toBeDefined();
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof report.started_at).toBe('string');
  });

  it('sets duplicate_rows to 0 (ON CONFLICT DO NOTHING counted at DB level)', async () => {
    const csv = generateCsv(2);
    const stream = createCsvStream(csv);
    const config = createMockConfig();
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.duplicate_rows).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Chunk flushing
// ---------------------------------------------------------------------------
describe('ingestBatch — chunk flushing', () => {
  it('flushes rows in chunks of CHUNK_SIZE', async () => {
    const csv = generateCsv(12);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 5 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    // 12 rows with CHUNK_SIZE=5: 2 full chunks (5+5) + 1 partial (2) = 3 insertRows calls
    expect(mockedRepo.insertRows).toHaveBeenCalledTimes(3);

    // First chunk: 5 rows
    const firstChunkRows = mockedRepo.insertRows.mock
      .calls[0][1] as RowInsert[];
    expect(firstChunkRows).toHaveLength(5);

    // Second chunk: 5 rows
    const secondChunkRows = mockedRepo.insertRows.mock
      .calls[1][1] as RowInsert[];
    expect(secondChunkRows).toHaveLength(5);

    // Final flush: 2 rows
    const finalChunkRows = mockedRepo.insertRows.mock
      .calls[2][1] as RowInsert[];
    expect(finalChunkRows).toHaveLength(2);
  });

  it('calls updateProgress after each chunk flush', async () => {
    const csv = generateCsv(12);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 5 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    // updateProgress called after each full chunk (not after final partial flush)
    expect(mockedRepo.updateProgress).toHaveBeenCalledTimes(2);

    // First progress update: 5 rows processed
    expect(mockedRepo.updateProgress).toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      5,
    );

    // Second progress update: 10 rows processed
    expect(mockedRepo.updateProgress).toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      10,
    );
  });

  it('passes batch_id and casino_id from claimed batch to every inserted row (INV-W3, INV-W5)', async () => {
    const csv = generateCsv(3);
    const stream = createCsvStream(csv);
    const batch = createMockBatch({ id: 'b-100', casino_id: 'c-200' });
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    await ingestBatch({} as never, batch, stream, config, logger);

    const insertedRows = mockedRepo.insertRows.mock.calls[0][1] as RowInsert[];
    for (const row of insertedRows) {
      expect(row.batch_id).toBe('b-100');
      expect(row.casino_id).toBe('c-200');
    }
  });
});

// ---------------------------------------------------------------------------
// Row cap enforcement
// ---------------------------------------------------------------------------
describe('ingestBatch — row cap (10,001)', () => {
  it('fails batch and throws when row cap is reached', async () => {
    // Generate exactly 10,001 data rows (row cap fires at row 10,001)
    const csv = generateCsv(10_001);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 500 });
    const logger = createMockLogger();

    await expect(
      ingestBatch({} as never, createMockBatch(), stream, config, logger),
    ).rejects.toThrow('BATCH_ROW_LIMIT');

    expect(mockedRepo.failBatch).toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      'BATCH_ROW_LIMIT',
    );

    // completeBatch should NOT be called
    expect(mockedRepo.completeBatch).not.toHaveBeenCalled();
  });

  it('processes 10,000 rows without hitting row cap', async () => {
    const csv = generateCsv(10_000);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 500 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(10_000);
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
    expect(mockedRepo.failBatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invalid rows
// ---------------------------------------------------------------------------
describe('ingestBatch — validation errors', () => {
  it('counts invalid rows (missing required fields)', async () => {
    // Rows missing first_name and last_name will fail validation
    const csv = [
      'Email,Phone,First Name,Last Name',
      'alice@example.com,555-0001,Alice,Johnson', // valid
      'bob@example.com,555-0002,,', // invalid: no first/last name
      'carol@example.com,555-0003,Carol,Williams', // valid
    ].join('\n');
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(3);
    expect(report.valid_rows).toBe(2);
    expect(report.invalid_rows).toBe(1);
  });

  it('inserts invalid rows with status=error', async () => {
    const csv = [
      'Email,Phone,First Name,Last Name',
      'noname@test.com,555-0001,,', // missing first_name and last_name
    ].join('\n');
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    const insertedRows = mockedRepo.insertRows.mock.calls[0][1] as RowInsert[];
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].status).toBe('error');
    expect(insertedRows[0].reason_code).toBe('VALIDATION_FAILED');
  });
});

// ---------------------------------------------------------------------------
// Header normalization
// ---------------------------------------------------------------------------
describe('ingestBatch — header handling', () => {
  it('normalizes headers from CSV before processing rows', async () => {
    // Headers with whitespace and BOM should be normalized
    const csv = [
      '  Email , Phone , First Name , Last Name ',
      'test@test.com,555-0001,Test,User',
    ].join('\n');
    const stream = createCsvStream(csv);
    const batch = createMockBatch({
      column_mapping: {
        email: 'Email',
        phone: 'Phone',
        first_name: 'First Name',
        last_name: 'Last Name',
      },
    });
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      batch,
      stream,
      config,
      logger,
    );

    // csv-parse with trim:true handles whitespace in field values,
    // but normalizeHeaders handles header name normalization.
    // The row should be processed successfully.
    expect(report.total_rows).toBe(1);
    expect(report.valid_rows).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// completeBatch call
// ---------------------------------------------------------------------------
describe('ingestBatch — completion', () => {
  it('calls completeBatch with final row count and report', async () => {
    const csv = generateCsv(5);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    expect(mockedRepo.completeBatch).toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      5,
      expect.objectContaining({
        total_rows: 5,
        valid_rows: 5,
        invalid_rows: 0,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Empty CSV (header only)
// ---------------------------------------------------------------------------
describe('ingestBatch — edge cases', () => {
  it('handles CSV with only a header row (0 data rows)', async () => {
    const csv = 'Email,Phone,First Name,Last Name\n';
    const stream = createCsvStream(csv);
    const config = createMockConfig();
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(0);
    expect(report.valid_rows).toBe(0);
    expect(report.invalid_rows).toBe(0);
    expect(mockedRepo.insertRows).not.toHaveBeenCalled();
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
  });
});
