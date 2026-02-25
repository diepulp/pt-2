/** @jest-environment node */

/**
 * Crash Recovery Integration Tests
 *
 * Verifies the reaper + re-ingestion recovery path:
 * - Mid-parse abort → batch stuck in 'parsing' with stale heartbeat
 * - Reaper resets to 'uploaded' when attempt_count < MAX_ATTEMPTS
 * - Re-ingest produces semantically equivalent output (ON CONFLICT DO NOTHING)
 * - After MAX_ATTEMPTS, reaper transitions to 'failed'
 *
 * @see workers/csv-ingestion/src/repo.ts (reapStaleBatches)
 * @see workers/csv-ingestion/src/claim.ts (reapAndClaim)
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import type { Pool, QueryResult } from 'pg';
import { reapStaleBatches, insertRows, completeBatch } from '../src/repo';
import type { RowInsert } from '../src/repo';
import { reapAndClaim } from '../src/claim';
import type { Config } from '../src/config';
import type { Logger } from '../src/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPool() {
  const mockQuery = jest.fn<Promise<QueryResult>, [string, unknown[]?]>();
  mockQuery.mockResolvedValue({
    rows: [],
    rowCount: 0,
    command: '',
    oid: 0,
    fields: [],
  });
  return {
    pool: { query: mockQuery } as unknown as Pool,
    mockQuery,
  };
}

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

function getSql(mockQuery: jest.Mock, callIndex = 0): string {
  return mockQuery.mock.calls[callIndex][0] as string;
}

function getParams(mockQuery: jest.Mock, callIndex = 0): unknown[] {
  return (mockQuery.mock.calls[callIndex][1] ?? []) as unknown[];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Reaper recovery: attempt_count < MAX_ATTEMPTS → reset to 'uploaded'
// ---------------------------------------------------------------------------
describe('crash recovery: reaper resets stale batches', () => {
  it('resets stale parsing batch to uploaded when attempt_count < max', async () => {
    const { pool, mockQuery } = createMockPool();
    // Reset branch returns 1 row affected
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

    const result = await reapStaleBatches(pool, 300_000, 3);

    expect(result.reset).toBe(1);
    expect(result.failed).toBe(0);

    // Verify reset SQL sets status = 'uploaded' and clears claim fields
    const resetSql = getSql(mockQuery, 0);
    expect(resetSql).toMatch(/status\s*=\s*'uploaded'/);
    expect(resetSql).toMatch(/claimed_by\s*=\s*NULL/);
    expect(resetSql).toMatch(/claimed_at\s*=\s*NULL/);
    expect(resetSql).toMatch(/heartbeat_at\s*=\s*NULL/);
  });

  it('INV-W2: reset predicate includes heartbeat threshold AND attempt_count < max', async () => {
    const { pool, mockQuery } = createMockPool();
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

    await reapStaleBatches(pool, 300_000, 3);

    const resetSql = getSql(mockQuery, 0);
    expect(resetSql).toMatch(/status\s*=\s*'parsing'/);
    expect(resetSql).toContain('heartbeat_at <');
    expect(resetSql).toContain('attempt_count < $2');

    const params = getParams(mockQuery, 0);
    expect(params).toEqual([300_000, 3]);
  });
});

// ---------------------------------------------------------------------------
// Reaper: attempt_count >= MAX_ATTEMPTS → permanently fail
// ---------------------------------------------------------------------------
describe('crash recovery: reaper fails exhausted batches', () => {
  it('transitions to failed when attempt_count >= max', async () => {
    const { pool, mockQuery } = createMockPool();
    // Reset returns 0, fail returns 1
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

    const result = await reapStaleBatches(pool, 300_000, 3);

    expect(result.reset).toBe(0);
    expect(result.failed).toBe(1);

    // Verify fail SQL
    const failSql = getSql(mockQuery, 1);
    expect(failSql).toMatch(/status\s*=\s*'failed'/);
    expect(failSql).toContain('MAX_ATTEMPTS_EXCEEDED');
    expect(failSql).toContain('attempt_count >= $2');
  });

  it('reaper handles both reset and fail in same pass', async () => {
    const { pool, mockQuery } = createMockPool();
    // 2 reset, 1 failed in same pass
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

    const result = await reapStaleBatches(pool, 300_000, 3);

    expect(result.reset).toBe(2);
    expect(result.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// reapAndClaim orchestration
// ---------------------------------------------------------------------------
describe('crash recovery: reapAndClaim orchestration', () => {
  it('reaps then claims — recovered batch is immediately claimable', async () => {
    const { pool, mockQuery } = createMockPool();
    const config = createMockConfig();
    const logger = createMockLogger();

    // reap reset returns 1 (recovered batch), fail returns 0
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      })
      // claimBatch returns the recovered batch
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'recovered-batch',
            casino_id: 'casino-1',
            storage_path: 'imports/casino-1/recovered-batch/file.csv',
            original_file_name: 'players.csv',
            column_mapping: { email: 'Email' },
            attempt_count: 2, // second attempt
          },
        ],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

    const claimed = await reapAndClaim(pool, config, logger);

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe('recovered-batch');
    expect(claimed!.attempt_count).toBe(2);

    // Verify reap was called before claim
    expect(mockQuery).toHaveBeenCalledTimes(3); // 2 reap queries + 1 claim
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Reaped stale batches'),
      expect.objectContaining({ count: 1 }),
    );
  });

  it('logs warning for permanently failed batches', async () => {
    const { pool, mockQuery } = createMockPool();
    const config = createMockConfig();
    const logger = createMockLogger();

    // 0 reset, 2 failed
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      })
      // No batch to claim
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

    const claimed = await reapAndClaim(pool, config, logger);

    expect(claimed).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('permanently failed'),
      expect.objectContaining({ count: 2 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Re-ingest idempotency: ON CONFLICT DO NOTHING
// ---------------------------------------------------------------------------
describe('crash recovery: re-ingest idempotency', () => {
  it('insertRows uses ON CONFLICT to handle duplicate row_numbers on re-ingest', async () => {
    const { pool, mockQuery } = createMockPool();

    const rows: RowInsert[] = Array.from({ length: 5 }, (_, i) => ({
      batch_id: 'recovered-batch',
      casino_id: 'casino-1',
      row_number: i + 1,
      raw_row: { email: `player${i + 1}@example.com` },
      normalized_payload: { contract_version: 'v1' },
      status: 'staged' as const,
      reason_code: null,
      reason_detail: null,
    }));

    await insertRows(pool, rows);

    const sql = getSql(mockQuery);
    expect(sql).toContain('ON CONFLICT (batch_id, row_number) DO NOTHING');
    // If rows were already inserted during a prior (crashed) attempt,
    // the ON CONFLICT ensures they are silently skipped on re-insert.
  });

  it('re-insert of identical rows produces no errors (mocked)', async () => {
    const { pool } = createMockPool();

    const rows: RowInsert[] = [
      {
        batch_id: 'recovered-batch',
        casino_id: 'casino-1',
        row_number: 1,
        raw_row: { email: 'alice@example.com' },
        normalized_payload: { contract_version: 'v1' },
        status: 'staged',
        reason_code: null,
        reason_detail: null,
      },
    ];

    // First insert (simulating initial partial processing)
    await expect(insertRows(pool, rows)).resolves.toBeUndefined();

    // Second insert (simulating re-ingest after crash recovery)
    await expect(insertRows(pool, rows)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// completeBatch after recovery
// ---------------------------------------------------------------------------
describe('crash recovery: completeBatch after recovery', () => {
  it('completeBatch transitions recovered batch to staging', async () => {
    const { pool, mockQuery } = createMockPool();

    await completeBatch(pool, 'recovered-batch', 100, {
      total_rows: 100,
      valid_rows: 95,
      invalid_rows: 5,
    });

    const sql = getSql(mockQuery);
    expect(sql).toMatch(/status\s*=\s*'staging'/);
    expect(sql).toContain('WHERE id = $1');

    const params = getParams(mockQuery);
    expect(params[0]).toBe('recovered-batch');
    expect(params[1]).toBe(100);
  });
});
