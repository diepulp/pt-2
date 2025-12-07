/**
 * RatingSlipService Published Queries Unit Tests
 *
 * Tests the published queries that are consumed by other bounded contexts.
 * These queries return minimal data (booleans, counts) for cross-context use.
 *
 * @see services/rating-slip/queries.ts
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { countOpenSlipsForTable, hasOpenSlipsForTable } from '../queries';

// === Test Data ===

const CASINO_ID = 'casino-123';
const TABLE_ID = 'table-456';

// === Mock Helpers ===

type MockChain = {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  from: jest.Mock;
};

function createMockChain(): MockChain {
  const chain: MockChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn(),
    from: jest.fn().mockReturnThis(),
  };

  // Make methods chainable
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);

  return chain;
}

function createMockSupabase(chain: MockChain): SupabaseClient<Database> {
  return {
    from: jest.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient<Database>;
}

// === Tests ===

describe('Rating Slip Queries', () => {
  let mockChain: MockChain;
  let mockSupabase: SupabaseClient<Database>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChain = createMockChain();
    mockSupabase = createMockSupabase(mockChain);
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ===========================================================================
  // hasOpenSlipsForTable
  // ===========================================================================

  describe('hasOpenSlipsForTable', () => {
    it('should return true when open slips exist', async () => {
      mockChain.in.mockResolvedValue({
        count: 3,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('rating_slip');
      expect(mockChain.select).toHaveBeenCalledWith('id', {
        count: 'exact',
        head: true,
      });
      expect(mockChain.eq).toHaveBeenCalledWith('table_id', TABLE_ID);
      expect(mockChain.eq).toHaveBeenCalledWith('casino_id', CASINO_ID);
      expect(mockChain.in).toHaveBeenCalledWith('status', ['open', 'paused']);
    });

    it('should return true when paused slips exist', async () => {
      mockChain.in.mockResolvedValue({
        count: 1,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(true);
    });

    it('should return false when no open/paused slips', async () => {
      mockChain.in.mockResolvedValue({
        count: 0,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(false);
    });

    it('should return false when count is null', async () => {
      mockChain.in.mockResolvedValue({
        count: null,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(false);
    });

    it('should filter by casino_id correctly', async () => {
      mockChain.in.mockResolvedValue({
        count: 2,
        error: null,
      });

      await hasOpenSlipsForTable(mockSupabase, TABLE_ID, CASINO_ID);

      // Verify both eq calls were made with correct parameters
      expect(mockChain.eq).toHaveBeenNthCalledWith(1, 'table_id', TABLE_ID);
      expect(mockChain.eq).toHaveBeenNthCalledWith(2, 'casino_id', CASINO_ID);
    });

    it('should return false on error (graceful degradation)', async () => {
      mockChain.in.mockResolvedValue({
        count: null,
        error: { message: 'Database error', code: '42000' },
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      // Graceful degradation: returns false on error without logging
      expect(result).toBe(false);
    });

    it('should handle exactly one open slip', async () => {
      mockChain.in.mockResolvedValue({
        count: 1,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(true);
    });

    it('should handle large count values', async () => {
      mockChain.in.mockResolvedValue({
        count: 1000,
        error: null,
      });

      const result = await hasOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // countOpenSlipsForTable
  // ===========================================================================

  describe('countOpenSlipsForTable', () => {
    it('should return count when slips exist', async () => {
      mockChain.in.mockResolvedValue({
        count: 5,
        error: null,
      });

      const result = await countOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(5);
    });

    it('should return zero when no slips exist', async () => {
      mockChain.in.mockResolvedValue({
        count: 0,
        error: null,
      });

      const result = await countOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(0);
    });

    it('should return zero when count is null', async () => {
      mockChain.in.mockResolvedValue({
        count: null,
        error: null,
      });

      const result = await countOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(0);
    });

    it('should filter by casino_id correctly', async () => {
      mockChain.in.mockResolvedValue({
        count: 3,
        error: null,
      });

      await countOpenSlipsForTable(mockSupabase, TABLE_ID, CASINO_ID);

      expect(mockChain.eq).toHaveBeenNthCalledWith(1, 'table_id', TABLE_ID);
      expect(mockChain.eq).toHaveBeenNthCalledWith(2, 'casino_id', CASINO_ID);
    });

    it('should return zero on error (graceful degradation)', async () => {
      process.env.NODE_ENV = 'test';

      mockChain.in.mockResolvedValue({
        count: null,
        error: { message: 'Database error', code: '42000' },
      });

      const result = await countOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(0);
    });

    it('should handle large count values', async () => {
      mockChain.in.mockResolvedValue({
        count: 999,
        error: null,
      });

      const result = await countOpenSlipsForTable(
        mockSupabase,
        TABLE_ID,
        CASINO_ID,
      );

      expect(result).toBe(999);
    });

    it('should use correct select options for count', async () => {
      mockChain.in.mockResolvedValue({
        count: 10,
        error: null,
      });

      await countOpenSlipsForTable(mockSupabase, TABLE_ID, CASINO_ID);

      expect(mockChain.select).toHaveBeenCalledWith('id', {
        count: 'exact',
        head: true,
      });
    });

    it('should filter for open and paused status only', async () => {
      mockChain.in.mockResolvedValue({
        count: 2,
        error: null,
      });

      await countOpenSlipsForTable(mockSupabase, TABLE_ID, CASINO_ID);

      expect(mockChain.in).toHaveBeenCalledWith('status', ['open', 'paused']);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty string tableId', async () => {
      mockChain.in.mockResolvedValue({
        count: 0,
        error: null,
      });

      const result = await hasOpenSlipsForTable(mockSupabase, '', CASINO_ID);

      expect(result).toBe(false);
      expect(mockChain.eq).toHaveBeenCalledWith('table_id', '');
    });

    it('should handle empty string casinoId', async () => {
      mockChain.in.mockResolvedValue({
        count: 0,
        error: null,
      });

      const result = await hasOpenSlipsForTable(mockSupabase, TABLE_ID, '');

      expect(result).toBe(false);
      expect(mockChain.eq).toHaveBeenCalledWith('casino_id', '');
    });

    it('should handle UUID-formatted IDs', async () => {
      const uuidTableId = '550e8400-e29b-41d4-a716-446655440000';
      const uuidCasinoId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      mockChain.in.mockResolvedValue({
        count: 1,
        error: null,
      });

      await hasOpenSlipsForTable(mockSupabase, uuidTableId, uuidCasinoId);

      expect(mockChain.eq).toHaveBeenCalledWith('table_id', uuidTableId);
      expect(mockChain.eq).toHaveBeenCalledWith('casino_id', uuidCasinoId);
    });

    it('should handle different casino IDs (RLS scoping)', async () => {
      const casino1 = 'casino-001';
      const casino2 = 'casino-002';

      mockChain.in.mockResolvedValue({
        count: 3,
        error: null,
      });

      await hasOpenSlipsForTable(mockSupabase, TABLE_ID, casino1);
      expect(mockChain.eq).toHaveBeenLastCalledWith('casino_id', casino1);

      jest.clearAllMocks();
      mockChain.in.mockResolvedValue({
        count: 0,
        error: null,
      });

      await hasOpenSlipsForTable(mockSupabase, TABLE_ID, casino2);
      expect(mockChain.eq).toHaveBeenLastCalledWith('casino_id', casino2);
    });
  });
});
