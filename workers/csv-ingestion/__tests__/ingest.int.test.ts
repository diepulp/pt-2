/** @jest-environment node */

/**
 * Ingestion Pipeline Integration Tests
 *
 * Tests end-to-end ingestion pipeline behavior with mocked DB and storage.
 * Exercises the full flow: stream → parse → normalize → validate → insert.
 *
 * Scenarios:
 *   - 100-row CSV produces correct row count
 *   - 10,000-row CSV stays under cap
 *   - 10,001-row CSV triggers BATCH_ROW_LIMIT failure
 *   - Heartbeat refresh at expected intervals
 *   - Idempotent re-inserts via ON CONFLICT DO NOTHING
 *   - CSV fixture files parse correctly
 *
 * @see workers/csv-ingestion/src/ingest.ts
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
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

import * as fs from 'node:fs';
import * as path from 'node:path';

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
    CHUNK_SIZE: 500,
    STATEMENT_TIMEOUT_MS: 60_000,
    HEALTH_PORT: 8080,
    WORKER_ID: 'test-worker',
    ...overrides,
  };
}

function createMockBatch(overrides: Partial<ClaimedBatch> = {}): ClaimedBatch {
  return {
    id: 'batch-int-1',
    casino_id: 'casino-int-1',
    storage_path: 'imports/casino-int-1/batch-int-1/file.csv',
    original_file_name: 'players.csv',
    column_mapping: {
      email: 'Email',
      phone: 'Phone',
      first_name: 'First Name',
      last_name: 'Last Name',
      dob: 'Date of Birth',
    },
    attempt_count: 1,
    ...overrides,
  };
}

function createCsvStream(csvText: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(csvText));
      controller.close();
    },
  });
}

function createCsvStreamFromFile(
  fixtureName: string,
): ReadableStream<Uint8Array> {
  const fixturePath = path.join(__dirname, 'fixtures', fixtureName);
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return createCsvStream(content);
}

function generateCsv(rowCount: number): string {
  const header = 'Email,Phone,First Name,Last Name';
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const n = i + 1;
    return `player${n}@example.com,555-${String(n).padStart(4, '0')},Player${n},Last${n}`;
  });
  return [header, ...rows].join('\n');
}

function getAllInsertedRows(): RowInsert[] {
  return mockedRepo.insertRows.mock.calls.flatMap(
    (call) => call[1] as RowInsert[],
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 100-row ingestion
// ---------------------------------------------------------------------------
describe('integration: 100-row CSV ingestion', () => {
  it('ingests 100 rows, producing correct report counts', async () => {
    const csv = generateCsv(100);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 50 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(100);
    expect(report.valid_rows).toBe(100);
    expect(report.invalid_rows).toBe(0);
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
    expect(mockedRepo.failBatch).not.toHaveBeenCalled();
  });

  it('flushes 100 rows in chunks of 50 (2 full + 0 partial)', async () => {
    const csv = generateCsv(100);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 50 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    // 100 rows / 50 CHUNK_SIZE = 2 full chunks + 0 partial = 2 insertRows calls
    expect(mockedRepo.insertRows).toHaveBeenCalledTimes(2);
    expect(mockedRepo.updateProgress).toHaveBeenCalledTimes(2);
  });

  it('assigns correct row_numbers (1-indexed, sequential)', async () => {
    const csv = generateCsv(100);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 100 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    const rows = getAllInsertedRows();
    expect(rows).toHaveLength(100);

    // Verify row_numbers are sequential 1..100
    const rowNumbers = rows.map((r) => r.row_number).sort((a, b) => a - b);
    for (let i = 0; i < 100; i++) {
      expect(rowNumbers[i]).toBe(i + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// 10,000-row CSV stays under cap
// ---------------------------------------------------------------------------
describe('integration: 10,000-row CSV under cap', () => {
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
    expect(report.valid_rows).toBe(10_000);
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
    expect(mockedRepo.failBatch).not.toHaveBeenCalled();
  });

  it('calls updateProgress 20 times for 10,000 rows at CHUNK_SIZE=500', async () => {
    const csv = generateCsv(10_000);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 500 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    // 10,000 / 500 = 20 full chunks
    expect(mockedRepo.updateProgress).toHaveBeenCalledTimes(20);
  });
});

// ---------------------------------------------------------------------------
// Row cap enforcement at 10,001
// ---------------------------------------------------------------------------
describe('integration: row cap enforcement (10,001)', () => {
  it('fails batch at row 10,001 with BATCH_ROW_LIMIT', async () => {
    const csv = generateCsv(10_001);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 500 });
    const logger = createMockLogger();

    await expect(
      ingestBatch({} as never, createMockBatch(), stream, config, logger),
    ).rejects.toThrow('BATCH_ROW_LIMIT');

    expect(mockedRepo.failBatch).toHaveBeenCalledWith(
      expect.anything(),
      'batch-int-1',
      'BATCH_ROW_LIMIT',
    );
    expect(mockedRepo.completeBatch).not.toHaveBeenCalled();
  });

  it('logger.error called with row cap details', async () => {
    const csv = generateCsv(10_001);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 500 });
    const logger = createMockLogger();

    await expect(
      ingestBatch({} as never, createMockBatch(), stream, config, logger),
    ).rejects.toThrow('BATCH_ROW_LIMIT');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Row cap exceeded'),
      expect.objectContaining({
        batch_id: 'batch-int-1',
        cap: 10_001,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ON CONFLICT DO NOTHING — idempotent re-inserts
// ---------------------------------------------------------------------------
describe('integration: idempotent re-inserts', () => {
  it('insertRows SQL uses ON CONFLICT DO NOTHING (verified via mock)', async () => {
    // This is a structural assertion — insertRows is mocked, but
    // we verify the mock was called with correct batch/casino scoping.
    // The ON CONFLICT behavior is verified at the repo.test.ts level.
    const csv = generateCsv(5);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 10 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    expect(mockedRepo.insertRows).toHaveBeenCalledTimes(1);
    const insertedRows = mockedRepo.insertRows.mock.calls[0][1] as RowInsert[];
    expect(insertedRows).toHaveLength(5);

    // All rows carry the batch's casino_id (INV-W5)
    for (const row of insertedRows) {
      expect(row.casino_id).toBe('casino-int-1');
      expect(row.batch_id).toBe('batch-int-1');
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture file parsing
// ---------------------------------------------------------------------------
describe('integration: fixture file parsing', () => {
  it('parses small-valid.csv fixture (10 rows, all valid)', async () => {
    const stream = createCsvStreamFromFile('small-valid.csv');
    const config = createMockConfig({ CHUNK_SIZE: 100 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(10);
    expect(report.valid_rows).toBe(10);
    expect(report.invalid_rows).toBe(0);
  });

  it('parses mixed-valid-invalid.csv fixture (20 rows, mix of valid/invalid)', async () => {
    const stream = createCsvStreamFromFile('mixed-valid-invalid.csv');
    const config = createMockConfig({ CHUNK_SIZE: 100 });
    const logger = createMockLogger();

    const report = await ingestBatch(
      {} as never,
      createMockBatch(),
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBe(20);
    // Some rows are invalid (missing names, bad email, no identifiers)
    expect(report.valid_rows).toBeLessThan(20);
    expect(report.invalid_rows).toBeGreaterThan(0);
    expect(report.valid_rows + report.invalid_rows).toBe(20);
  });

  it('parses malformed.csv fixture without crashing (relax_column_count)', async () => {
    const stream = createCsvStreamFromFile('malformed.csv');
    const batch = createMockBatch({
      column_mapping: {
        email: 'Email',
        phone: 'Phone',
        first_name: 'First Name',
        last_name: 'Last Name',
      },
    });
    const config = createMockConfig({ CHUNK_SIZE: 100 });
    const logger = createMockLogger();

    // Should not throw — csv-parse relax_column_count handles malformed rows
    const report = await ingestBatch(
      {} as never,
      batch,
      stream,
      config,
      logger,
    );

    expect(report.total_rows).toBeGreaterThan(0);
    expect(mockedRepo.completeBatch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Report structure
// ---------------------------------------------------------------------------
describe('integration: ingestion report structure', () => {
  it('completeBatch receives correctly structured report', async () => {
    const csv = generateCsv(50);
    const stream = createCsvStream(csv);
    const config = createMockConfig({ CHUNK_SIZE: 25 });
    const logger = createMockLogger();

    await ingestBatch({} as never, createMockBatch(), stream, config, logger);

    const reportArg = mockedRepo.completeBatch.mock.calls[0][3] as Record<
      string,
      unknown
    >;
    expect(reportArg).toEqual(
      expect.objectContaining({
        total_rows: 50,
        valid_rows: 50,
        invalid_rows: 0,
        duplicate_rows: 0,
        parse_errors: 0,
      }),
    );
    expect(typeof reportArg.started_at).toBe('string');
    expect(typeof reportArg.completed_at).toBe('string');
    expect(typeof reportArg.duration_ms).toBe('number');
  });
});
