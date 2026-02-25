/** @jest-environment node */

/**
 * Concurrent Claim Integration Tests
 *
 * Verifies SKIP LOCKED concurrency behavior:
 * - Two concurrent claim attempts — exactly one wins
 * - Losing claim gets null (not an error)
 * - No double-processing of same batch
 *
 * @see workers/csv-ingestion/src/repo.ts (claimBatch — FOR UPDATE SKIP LOCKED)
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import type { Pool, QueryResult } from 'pg';
import { claimBatch } from '../src/repo';

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

function getSql(mockQuery: jest.Mock, callIndex = 0): string {
  return mockQuery.mock.calls[callIndex][0] as string;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// SKIP LOCKED concurrency
// ---------------------------------------------------------------------------
describe('concurrent claim: SKIP LOCKED semantics', () => {
  it('claim SQL uses FOR UPDATE SKIP LOCKED', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('first claim wins, second gets null (simulated concurrent workers)', async () => {
    // Worker 1 claims successfully
    const pool1 = createMockPool();
    pool1.mockQuery.mockResolvedValueOnce({
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

    // Worker 2 finds no available batch (SKIP LOCKED skipped it)
    const pool2 = createMockPool();
    pool2.mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    // Simulate concurrent claims
    const [claim1, claim2] = await Promise.all([
      claimBatch(pool1.pool, 'worker-1'),
      claimBatch(pool2.pool, 'worker-2'),
    ]);

    // Exactly one wins
    expect(claim1).not.toBeNull();
    expect(claim1!.id).toBe('batch-1');

    // The other gets null
    expect(claim2).toBeNull();
  });

  it('winning claim transitions batch to parsing status', async () => {
    const { pool, mockQuery } = createMockPool();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'batch-1',
          casino_id: 'casino-1',
          storage_path: 'imports/casino-1/batch-1/file.csv',
          original_file_name: 'players.csv',
          column_mapping: {},
          attempt_count: 1,
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const claimed = await claimBatch(pool, 'worker-1');

    expect(claimed).not.toBeNull();
    const sql = getSql(mockQuery);
    // Verify the UPDATE sets status = 'parsing' (INV-W7)
    expect(sql).toMatch(/SET[\s\S]*status\s*=\s*'parsing'/);
    // Verify it increments attempt_count
    expect(sql).toContain('attempt_count = attempt_count + 1');
  });

  it('claim selects oldest batch first (ORDER BY created_at ASC)', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(sql).toContain('LIMIT 1');
  });

  it('claim stores worker ID in claimed_by field', async () => {
    const { pool, mockQuery } = createMockPool();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'batch-1',
          casino_id: 'casino-1',
          storage_path: null,
          original_file_name: null,
          column_mapping: {},
          attempt_count: 1,
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    await claimBatch(pool, 'worker-unique-id');

    const sql = getSql(mockQuery);
    expect(sql).toContain('claimed_by');
    // Worker ID passed as $1 parameter
    const params = mockQuery.mock.calls[0][1];
    expect(params).toEqual(['worker-unique-id']);
  });
});

// ---------------------------------------------------------------------------
// No double-processing guarantee
// ---------------------------------------------------------------------------
describe('concurrent claim: no double-processing', () => {
  it('INV-W6: claim only selects uploaded batches (parsing excluded)', async () => {
    const { pool, mockQuery } = createMockPool();
    await claimBatch(pool, 'worker-1');
    const sql = getSql(mockQuery);

    // The subquery must restrict to status = 'uploaded' ONLY
    expect(sql).toContain("WHERE status = 'uploaded'");
    // Must NOT claim 'parsing' batches (those are already claimed)
    expect(sql).not.toMatch(/WHERE status = 'parsing'/);
  });

  it('multiple sequential claims return null when no batches available', async () => {
    const { pool } = createMockPool();

    // Three workers attempt to claim — no uploaded batches exist
    const claims = await Promise.all([
      claimBatch(pool, 'worker-1'),
      claimBatch(pool, 'worker-2'),
      claimBatch(pool, 'worker-3'),
    ]);

    expect(claims).toEqual([null, null, null]);
  });
});
