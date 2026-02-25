/** @jest-environment node */

/**
 * Repository Security Invariant Tests (INV-W1 through INV-W7)
 *
 * These tests verify that the SQL emitted by ImportBatchRepo functions
 * contains the required WHERE clauses, status restrictions, and scoping
 * guarantees mandated by the security invariants.
 *
 * Approach: Mock pg.Pool, call each function, and inspect the SQL string
 * passed to pool.query.
 *
 * @see workers/csv-ingestion/src/repo.ts
 * @see PRD-039 Security Posture table
 */

import type { Pool, QueryResult } from 'pg';
import {
  claimBatch,
  reapStaleBatches,
  updateHeartbeat,
  updateProgress,
  completeBatch,
  failBatch,
  insertRows,
} from '../src/repo';
import type { RowInsert } from '../src/repo';

// ---------------------------------------------------------------------------
// Mock pool
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

// Helpers for extracting SQL from mock calls
function getSql(mockQuery: jest.Mock, callIndex = 0): string {
  return mockQuery.mock.calls[callIndex][0] as string;
}

function getParams(mockQuery: jest.Mock, callIndex = 0): unknown[] {
  return (mockQuery.mock.calls[callIndex][1] ?? []) as unknown[];
}

// ---------------------------------------------------------------------------
// claimBatch
// ---------------------------------------------------------------------------
describe('claimBatch', () => {
  it('INV-W6: subquery restricts to status = uploaded only', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain("WHERE status = 'uploaded'");
  });

  it('INV-W7: sets status to parsing', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toMatch(/SET[\s\S]*status\s*=\s*'parsing'/);
  });

  it('INV-W1: outer UPDATE scoped to claimed id via subquery', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    // Outer WHERE id = (SELECT id ...)
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\(\s*SELECT\s+id/);
  });

  it('uses FOR UPDATE SKIP LOCKED for safe concurrency', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('binds workerId as parameter (no interpolation)', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-abc');
    const params = getParams(mockQuery);
    expect(params).toEqual(['worker-abc']);
  });

  it('only queries import_batch (INV-W4)', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('public.import_batch');
    expect(sql).not.toContain('public.import_row');
    // Should not reference any other table
    expect(sql).not.toMatch(/public\.(?!import_batch\b)\w+/);
  });

  it('returns null when no rows available', async () => {
    const { pool } = createMockPool();
    const result = await claimBatch(pool, 'worker-1');
    expect(result).toBeNull();
  });

  it('returns claimed batch when row available', async () => {
    const { pool, mockQuery } = createMockPool();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'batch-1',
          casino_id: 'casino-1',
          storage_path: 'imports/casino-1/batch-1/file.csv',
          original_file_name: 'players.csv',
          column_mapping: { email: 'Email' },
          attempt_count: 1,
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await claimBatch(pool, 'worker-1');

    expect(result).toEqual({
      id: 'batch-1',
      casino_id: 'casino-1',
      storage_path: 'imports/casino-1/batch-1/file.csv',
      original_file_name: 'players.csv',
      column_mapping: { email: 'Email' },
      attempt_count: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// reapStaleBatches
// ---------------------------------------------------------------------------
describe('reapStaleBatches', () => {
  it('INV-W2: reset branch includes attempt_count < max', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    // First query is the reset branch
    const resetSql = getSql(mockQuery, 0);
    expect(resetSql).toContain('attempt_count < $2');
  });

  it('INV-W2: fail branch includes attempt_count >= max', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    // Second query is the fail branch
    const failSql = getSql(mockQuery, 1);
    expect(failSql).toContain('attempt_count >= $2');
  });

  it('reset branch sets status to uploaded (INV-W7 exception)', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    const resetSql = getSql(mockQuery, 0);
    expect(resetSql).toMatch(/status\s*=\s*'uploaded'/);
  });

  it('fail branch sets status to failed (INV-W7)', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    const failSql = getSql(mockQuery, 1);
    expect(failSql).toMatch(/status\s*=\s*'failed'/);
  });

  it('both branches filter on status = parsing', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    expect(getSql(mockQuery, 0)).toContain("status = 'parsing'");
    expect(getSql(mockQuery, 1)).toContain("status = 'parsing'");
  });

  it('both branches include heartbeat threshold check', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    expect(getSql(mockQuery, 0)).toContain('heartbeat_at <');
    expect(getSql(mockQuery, 1)).toContain('heartbeat_at <');
  });

  it('passes threshold and maxAttempts as parameters', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    expect(getParams(mockQuery, 0)).toEqual([300_000, 3]);
    expect(getParams(mockQuery, 1)).toEqual([300_000, 3]);
  });

  it('fail branch sets last_error_code to MAX_ATTEMPTS_EXCEEDED', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    const failSql = getSql(mockQuery, 1);
    expect(failSql).toContain('MAX_ATTEMPTS_EXCEEDED');
  });

  it('returns reset and failed counts', async () => {
    const { pool, mockQuery } = createMockPool();
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
    expect(result).toEqual({ reset: 2, failed: 1 });
  });
});

// ---------------------------------------------------------------------------
// updateHeartbeat
// ---------------------------------------------------------------------------
describe('updateHeartbeat', () => {
  it('INV-W1: includes WHERE id = $1', async () => {
    const { pool, mockQuery } = createMockPool();
    await updateHeartbeat(pool, 'batch-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('WHERE id = $1');
  });

  it('only touches import_batch (INV-W4)', async () => {
    const { pool, mockQuery } = createMockPool();
    await updateHeartbeat(pool, 'batch-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('public.import_batch');
    expect(sql).not.toContain('import_row');
  });

  it('binds batchId as parameter', async () => {
    const { pool, mockQuery } = createMockPool();
    await updateHeartbeat(pool, 'batch-42');
    expect(getParams(mockQuery)).toEqual(['batch-42']);
  });
});

// ---------------------------------------------------------------------------
// updateProgress
// ---------------------------------------------------------------------------
describe('updateProgress', () => {
  it('INV-W1: includes WHERE id = $1', async () => {
    const { pool, mockQuery } = createMockPool();
    await updateProgress(pool, 'batch-1', 500);
    const sql = getSql(mockQuery);
    expect(sql).toContain('WHERE id = $1');
  });

  it('binds batchId and rowCount as parameters', async () => {
    const { pool, mockQuery } = createMockPool();
    await updateProgress(pool, 'batch-1', 1500);
    expect(getParams(mockQuery)).toEqual(['batch-1', 1500]);
  });
});

// ---------------------------------------------------------------------------
// completeBatch
// ---------------------------------------------------------------------------
describe('completeBatch', () => {
  it('INV-W1: includes WHERE id = $1', async () => {
    const { pool, mockQuery } = createMockPool();
    await completeBatch(pool, 'batch-1', 100, { total: 100 });
    const sql = getSql(mockQuery);
    expect(sql).toContain('WHERE id = $1');
  });

  it('INV-W7: sets status to staging', async () => {
    const { pool, mockQuery } = createMockPool();
    await completeBatch(pool, 'batch-1', 100, { total: 100 });
    const sql = getSql(mockQuery);
    expect(sql).toMatch(/status\s*=\s*'staging'/);
  });

  it('only touches import_batch (INV-W4)', async () => {
    const { pool, mockQuery } = createMockPool();
    await completeBatch(pool, 'batch-1', 100, {});
    const sql = getSql(mockQuery);
    expect(sql).toContain('public.import_batch');
    expect(sql).not.toContain('import_row');
  });

  it('serializes report_summary as JSON', async () => {
    const { pool, mockQuery } = createMockPool();
    const report = { total_rows: 100, valid_rows: 95 };
    await completeBatch(pool, 'batch-1', 100, report);
    const params = getParams(mockQuery);
    expect(params[2]).toBe(JSON.stringify(report));
  });
});

// ---------------------------------------------------------------------------
// failBatch
// ---------------------------------------------------------------------------
describe('failBatch', () => {
  it('INV-W1: includes WHERE id = $1', async () => {
    const { pool, mockQuery } = createMockPool();
    await failBatch(pool, 'batch-1', 'BATCH_ROW_LIMIT');
    const sql = getSql(mockQuery);
    expect(sql).toContain('WHERE id = $1');
  });

  it('INV-W7: sets status to failed', async () => {
    const { pool, mockQuery } = createMockPool();
    await failBatch(pool, 'batch-1', 'BATCH_ROW_LIMIT');
    const sql = getSql(mockQuery);
    expect(sql).toMatch(/status\s*=\s*'failed'/);
  });

  it('binds errorCode as parameter', async () => {
    const { pool, mockQuery } = createMockPool();
    await failBatch(pool, 'batch-1', 'BATCH_ROW_LIMIT');
    const params = getParams(mockQuery);
    expect(params).toEqual(['batch-1', 'BATCH_ROW_LIMIT']);
  });
});

// ---------------------------------------------------------------------------
// insertRows
// ---------------------------------------------------------------------------
describe('insertRows', () => {
  const sampleRow: RowInsert = {
    batch_id: 'batch-1',
    casino_id: 'casino-1',
    row_number: 1,
    raw_row: { email: 'test@test.com' },
    normalized_payload: { contract_version: 'v1' },
    status: 'staged',
    reason_code: null,
    reason_detail: null,
  };

  it('INV-W4: only writes to import_row', async () => {
    const { pool, mockQuery } = createMockPool();
    await insertRows(pool, [sampleRow]);
    const sql = getSql(mockQuery);
    expect(sql).toContain('public.import_row');
    expect(sql).not.toContain('import_batch');
  });

  it('INV-W3: inserts batch_id and casino_id from caller', async () => {
    const { pool, mockQuery } = createMockPool();
    await insertRows(pool, [sampleRow]);
    const params = getParams(mockQuery);
    // First 2 params of each row should be batch_id, casino_id
    expect(params[0]).toBe('batch-1');
    expect(params[1]).toBe('casino-1');
  });

  it('uses ON CONFLICT (batch_id, row_number) DO NOTHING for idempotency', async () => {
    const { pool, mockQuery } = createMockPool();
    await insertRows(pool, [sampleRow]);
    const sql = getSql(mockQuery);
    expect(sql).toContain('ON CONFLICT (batch_id, row_number) DO NOTHING');
  });

  it('builds multi-row VALUES clause for multiple rows', async () => {
    const { pool, mockQuery } = createMockPool();
    const rows: RowInsert[] = [
      { ...sampleRow, row_number: 1 },
      { ...sampleRow, row_number: 2 },
    ];
    await insertRows(pool, rows);
    const sql = getSql(mockQuery);
    // Should have two value groups ($1...$8), ($9...$16)
    expect(sql).toContain('$1');
    expect(sql).toContain('$9');
    const params = getParams(mockQuery);
    expect(params).toHaveLength(16); // 8 columns × 2 rows
  });

  it('serializes raw_row and normalized_payload as JSON strings', async () => {
    const { pool, mockQuery } = createMockPool();
    await insertRows(pool, [sampleRow]);
    const params = getParams(mockQuery);
    // raw_row is at index 3, normalized_payload at index 4
    expect(params[3]).toBe(JSON.stringify(sampleRow.raw_row));
    expect(params[4]).toBe(JSON.stringify(sampleRow.normalized_payload));
  });

  it('does nothing for empty rows array', async () => {
    const { pool, mockQuery } = createMockPool();
    await insertRows(pool, []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('INV-W7: status values in params are only staged or error', async () => {
    const { pool, mockQuery } = createMockPool();
    const rows: RowInsert[] = [
      { ...sampleRow, status: 'staged' },
      {
        ...sampleRow,
        row_number: 2,
        status: 'error',
        reason_code: 'VALIDATION_FAILED',
        reason_detail: 'missing email',
      },
    ];
    await insertRows(pool, rows);
    const params = getParams(mockQuery);
    // status is at index 5 for row 1 and index 13 for row 2
    expect(params[5]).toBe('staged');
    expect(params[13]).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: INV-W4 table denylist
// ---------------------------------------------------------------------------
describe('INV-W4: table denylist', () => {
  it('no function references tables outside import_batch and import_row', async () => {
    const { pool, mockQuery } = createMockPool();

    // Invoke every function
    await claimBatch(pool, 'w');
    await reapStaleBatches(pool, 1, 1);
    await updateHeartbeat(pool, 'b');
    await updateProgress(pool, 'b', 0);
    await completeBatch(pool, 'b', 0, {});
    await failBatch(pool, 'b', 'E');
    await insertRows(pool, [
      {
        batch_id: 'b',
        casino_id: 'c',
        row_number: 1,
        raw_row: {},
        normalized_payload: {},
        status: 'staged',
        reason_code: null,
        reason_detail: null,
      },
    ]);

    // Collect all SQL strings
    const allSql = mockQuery.mock.calls.map((c) => c[0] as string);

    for (const sql of allSql) {
      // Match "public.tablename" patterns — only allow import_batch and import_row
      const tableRefs = sql.match(/public\.(\w+)/g) ?? [];
      for (const ref of tableRefs) {
        expect(['public.import_batch', 'public.import_row']).toContain(ref);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: INV-W7 status values
// ---------------------------------------------------------------------------
describe('INV-W7: status transition restrictions', () => {
  it('worker functions only set parsing, staging, or failed', async () => {
    const { pool, mockQuery } = createMockPool();

    await claimBatch(pool, 'w');
    await completeBatch(pool, 'b', 0, {});
    await failBatch(pool, 'b', 'E');

    const workerSqls = [
      getSql(mockQuery, 0), // claimBatch
      getSql(mockQuery, 1), // completeBatch
      getSql(mockQuery, 2), // failBatch
    ];

    const allowedStatuses = ["'parsing'", "'staging'", "'failed'"];

    for (const sql of workerSqls) {
      // Find all "status = '...'" patterns in SET clauses
      const statusSets = sql.match(/status\s*=\s*'(\w+)'/g) ?? [];
      for (const match of statusSets) {
        const value = match.match(/'(\w+)'/)?.[0];
        // Filter out WHERE clause status checks (like WHERE status = 'uploaded')
        // by checking if the match is in a SET context
        if (value && sql.indexOf(match) < sql.indexOf('WHERE')) {
          expect(allowedStatuses).toContain(value);
        }
      }
    }
  });

  it('reaper additionally sets uploaded for retry (documented exception)', async () => {
    const { pool, mockQuery } = createMockPool();
    await reapStaleBatches(pool, 300_000, 3);
    const resetSql = getSql(mockQuery, 0);
    expect(resetSql).toMatch(/status\s*=\s*'uploaded'/);
  });
});
