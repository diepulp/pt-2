/** @jest-environment node */

/**
 * Cross-Casino Isolation Integration Tests (INV-W3, INV-W5)
 *
 * Verifies that the ingestion pipeline enforces strict casino isolation:
 * - Casino A batch only writes rows with Casino A's casino_id (INV-W3)
 * - Casino B batch only writes rows with Casino B's casino_id
 * - casino_id always sourced from the claimed batch row, never external input (INV-W5)
 * - No cross-casino writes under any circumstance
 *
 * @see workers/csv-ingestion/src/repo.ts (INV-W3, INV-W5)
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
    CHUNK_SIZE: 100,
    STATEMENT_TIMEOUT_MS: 60_000,
    HEALTH_PORT: 8080,
    WORKER_ID: 'test-worker',
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

function generateCsv(rowCount: number, prefix: string): string {
  const header = 'Email,Phone,First Name,Last Name';
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const n = i + 1;
    return `${prefix}${n}@example.com,555-${String(n).padStart(4, '0')},${prefix}Player${n},Last${n}`;
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
// Two-casino isolation
// ---------------------------------------------------------------------------
describe('cross-casino isolation', () => {
  const CASINO_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CASINO_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const batchA: ClaimedBatch = {
    id: 'batch-casino-a',
    casino_id: CASINO_A_ID,
    storage_path: `imports/${CASINO_A_ID}/batch-casino-a/file.csv`,
    original_file_name: 'casino-a-players.csv',
    column_mapping: {
      email: 'Email',
      phone: 'Phone',
      first_name: 'First Name',
      last_name: 'Last Name',
    },
    attempt_count: 1,
  };

  const batchB: ClaimedBatch = {
    id: 'batch-casino-b',
    casino_id: CASINO_B_ID,
    storage_path: `imports/${CASINO_B_ID}/batch-casino-b/file.csv`,
    original_file_name: 'casino-b-players.csv',
    column_mapping: {
      email: 'Email',
      phone: 'Phone',
      first_name: 'First Name',
      last_name: 'Last Name',
    },
    attempt_count: 1,
  };

  it('INV-W3: Casino A batch writes only Casino A rows', async () => {
    const csv = generateCsv(10, 'casinoA');
    const stream = createCsvStream(csv);
    const config = createMockConfig();
    const logger = createMockLogger();

    await ingestBatch({} as never, batchA, stream, config, logger);

    const rows = getAllInsertedRows();
    expect(rows).toHaveLength(10);

    for (const row of rows) {
      expect(row.casino_id).toBe(CASINO_A_ID);
      expect(row.batch_id).toBe('batch-casino-a');
    }
  });

  it('INV-W3: Casino B batch writes only Casino B rows', async () => {
    const csv = generateCsv(10, 'casinoB');
    const stream = createCsvStream(csv);
    const config = createMockConfig();
    const logger = createMockLogger();

    await ingestBatch({} as never, batchB, stream, config, logger);

    const rows = getAllInsertedRows();
    expect(rows).toHaveLength(10);

    for (const row of rows) {
      expect(row.casino_id).toBe(CASINO_B_ID);
      expect(row.batch_id).toBe('batch-casino-b');
    }
  });

  it('INV-W5: sequential A then B ingestion — zero cross-casino rows', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    // Ingest Casino A
    const csvA = generateCsv(5, 'casinoA');
    await ingestBatch(
      {} as never,
      batchA,
      createCsvStream(csvA),
      config,
      logger,
    );

    const rowsAfterA = getAllInsertedRows();
    const casinoARows = rowsAfterA.filter((r) => r.casino_id === CASINO_A_ID);
    const casinoBRowsAfterA = rowsAfterA.filter(
      (r) => r.casino_id === CASINO_B_ID,
    );
    expect(casinoARows).toHaveLength(5);
    expect(casinoBRowsAfterA).toHaveLength(0);

    // Clear mocks for Casino B ingestion
    jest.clearAllMocks();

    // Ingest Casino B
    const csvB = generateCsv(5, 'casinoB');
    await ingestBatch(
      {} as never,
      batchB,
      createCsvStream(csvB),
      config,
      logger,
    );

    const rowsAfterB = getAllInsertedRows();
    const casinoBRows = rowsAfterB.filter((r) => r.casino_id === CASINO_B_ID);
    const casinoARowsAfterB = rowsAfterB.filter(
      (r) => r.casino_id === CASINO_A_ID,
    );
    expect(casinoBRows).toHaveLength(5);
    expect(casinoARowsAfterB).toHaveLength(0);
  });

  it('INV-W5: casino_id in RowInsert always matches claimed batch casino_id', async () => {
    const config = createMockConfig();
    const logger = createMockLogger();

    // Deliberately use CSV content that mentions a different "casino" in data
    // The casino_id in the insert must still come from the batch, not the CSV content.
    const csv = [
      'Email,Phone,First Name,Last Name',
      `evil@${CASINO_B_ID}.com,555-0001,Evil,Actor`, // email references Casino B
    ].join('\n');

    await ingestBatch(
      {} as never,
      batchA, // batch belongs to Casino A
      createCsvStream(csv),
      config,
      logger,
    );

    const rows = getAllInsertedRows();
    expect(rows).toHaveLength(1);
    // casino_id MUST be Casino A (from batch), not Casino B (from CSV content)
    expect(rows[0].casino_id).toBe(CASINO_A_ID);
    expect(rows[0].batch_id).toBe('batch-casino-a');
  });
});
