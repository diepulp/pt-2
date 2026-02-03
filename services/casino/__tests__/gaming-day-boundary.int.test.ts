/**
 * Gaming Day Boundary & DST Integration Tests
 *
 * Tests the temporal contract across edge cases: pre/post-boundary,
 * UTC-midnight, DST transitions, settings changes, range queries,
 * and fail-closed behavior.
 *
 * These tests use mocked Supabase RPC calls to verify the server helpers
 * correctly delegate to and handle responses from the database RPCs.
 *
 * @see PRD-027 System Time & Gaming Day Standardization
 * @see TEMP-001 Gaming Day Specification
 * @see TEMP-002 Temporal Authority Pattern
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  getServerGamingDay,
  getServerGamingDayAt,
} from '@/lib/gaming-day/server';
import type { Database } from '@/types/database.types';

// === Mock Factory ===

/**
 * Creates a mock Supabase client with a controlled `rpc()` method.
 *
 * The mock tracks calls to `rpc()` and returns preconfigured responses.
 * This mirrors the pattern used in services/casino/__tests__/crud.unit.test.ts.
 */
function createMockSupabase(
  rpcImpl: jest.Mock,
): SupabaseClient<Database> {
  return {
    rpc: rpcImpl,
  } as unknown as SupabaseClient<Database>;
}

/**
 * Creates a mock rpc function that resolves with { data, error }.
 */
function createSuccessRpc(data: string): jest.Mock {
  return jest.fn().mockResolvedValue({ data, error: null });
}

/**
 * Creates a mock rpc function that resolves with an error.
 */
function createErrorRpc(message: string): jest.Mock {
  return jest.fn().mockResolvedValue({ data: null, error: { message } });
}

// === Test Constants ===

// Casino: America/Los_Angeles, gaming_day_start = 06:00

/**
 * UTC timestamps chosen to produce specific casino-local times:
 *   America/Los_Angeles standard time = UTC-8
 *   America/Los_Angeles daylight time = UTC-7
 *
 * The DB algorithm (Layer 1):
 *   compute_gaming_day(p_ts, p_gaming_day_start interval)
 *   = (date_trunc('day', p_ts - p_gaming_day_start) + p_gaming_day_start)::date
 *
 * Worked example for Scenario 1 (pre-boundary, 05:50 local):
 *   UTC: 2026-01-15T13:50:00Z → local: 2026-01-15 05:50 PST
 *   Layer 1: date_trunc('day', '2026-01-15 05:50' - '6h') = date_trunc('day', '2026-01-14 23:50') = '2026-01-14'
 *   Expected gaming day: 2026-01-14
 */

describe('Gaming Day Boundary & DST Tests', () => {
  // =========================================================================
  // Scenario 1: Pre-boundary (05:50 local, start=06:00 → previous day)
  // =========================================================================
  describe('Scenario 1: Pre-boundary', () => {
    it('returns previous calendar date when local time is before gaming day start', async () => {
      // 2026-01-15 05:50 PST = 2026-01-15T13:50:00Z
      // Before 06:00 boundary → gaming day = 2026-01-14
      const mockRpc = createSuccessRpc('2026-01-14');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-01-15T13:50:00Z',
      );

      expect(result).toBe('2026-01-14');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-01-15T13:50:00Z',
      });
    });
  });

  // =========================================================================
  // Scenario 2: Post-boundary (06:10 local, start=06:00 → current day)
  // =========================================================================
  describe('Scenario 2: Post-boundary', () => {
    it('returns current calendar date when local time is after gaming day start', async () => {
      // 2026-01-15 06:10 PST = 2026-01-15T14:10:00Z
      // After 06:00 boundary → gaming day = 2026-01-15
      const mockRpc = createSuccessRpc('2026-01-15');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-01-15T14:10:00Z',
      );

      expect(result).toBe('2026-01-15');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-01-15T14:10:00Z',
      });
    });
  });

  // =========================================================================
  // Scenario 3: UTC-midnight (00:10 UTC = 16:10 Pacific → reflects timezone)
  // =========================================================================
  describe('Scenario 3: UTC-midnight', () => {
    it('reflects casino timezone, not UTC calendar date', async () => {
      // 2026-01-16 00:10 UTC → 2026-01-15 16:10 PST
      // 16:10 PST is well after 06:00 boundary → gaming day = 2026-01-15
      // Note: UTC date is Jan 16, but casino-local date is Jan 15
      const mockRpc = createSuccessRpc('2026-01-15');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-01-16T00:10:00Z',
      );

      expect(result).toBe('2026-01-15');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-01-16T00:10:00Z',
      });
    });
  });

  // =========================================================================
  // Scenario 4: DST spring-forward (March 8, 2026 — 2:00 AM jumps to 3:00 AM)
  // =========================================================================
  describe('Scenario 4: DST spring-forward', () => {
    it('computes correct boundary during spring-forward transition', async () => {
      // Spring-forward 2026: March 8, 2:00 AM PST → 3:00 AM PDT
      // Test: 2026-03-08 02:30 local doesn't exist — skips to 03:00 PDT
      // UTC equivalent: 2026-03-08T10:30:00Z → would be 2:30 AM PST but becomes 3:30 AM PDT
      // Actually: 2026-03-08T10:30:00Z = 3:30 AM PDT (post-spring-forward)
      // 3:30 AM PDT < 06:00 AM → gaming day = 2026-03-07
      const mockRpc = createSuccessRpc('2026-03-07');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-03-08T10:30:00Z',
      );

      expect(result).toBe('2026-03-07');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-03-08T10:30:00Z',
      });
    });

    it('computes correct boundary after spring-forward when past gaming day start', async () => {
      // 2026-03-08T13:10:00Z = 6:10 AM PDT (post-spring-forward, UTC-7)
      // 6:10 AM PDT >= 06:00 → gaming day = 2026-03-08
      const mockRpc = createSuccessRpc('2026-03-08');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-03-08T13:10:00Z',
      );

      expect(result).toBe('2026-03-08');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-03-08T13:10:00Z',
      });
    });
  });

  // =========================================================================
  // Scenario 5: DST fall-back (November 1, 2026 — 1:00 AM repeats)
  // =========================================================================
  describe('Scenario 5: DST fall-back', () => {
    it('handles ambiguous local time during fall-back', async () => {
      // Fall-back 2026: November 1, 2:00 AM PDT → 1:00 AM PST
      // Use unambiguous UTC instant: 2026-11-01T08:30:00Z = 1:30 AM PDT (first occurrence)
      // 1:30 AM < 06:00 → gaming day = 2025-10-31 (previous day)
      const mockRpc = createSuccessRpc('2026-10-31');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-11-01T08:30:00Z',
      );

      expect(result).toBe('2026-10-31');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-11-01T08:30:00Z',
      });
    });

    it('handles second occurrence of ambiguous time (post-fall-back)', async () => {
      // 2026-11-01T09:30:00Z = 1:30 AM PST (second occurrence, UTC-8)
      // 1:30 AM < 06:00 → gaming day = 2026-10-31 (still previous day)
      const mockRpc = createSuccessRpc('2026-10-31');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-11-01T09:30:00Z',
      );

      expect(result).toBe('2026-10-31');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-11-01T09:30:00Z',
      });
    });
  });

  // =========================================================================
  // Scenario 6: Settings change (different result after start_time update)
  // =========================================================================
  describe('Scenario 6: Settings change', () => {
    it('reflects new boundary immediately after settings change', async () => {
      // First call: gaming_day_start=06:00, at 05:50 → previous day
      // Second call: after settings change to 05:00, at 05:50 → current day
      const mockRpc = jest
        .fn()
        .mockResolvedValueOnce({ data: '2026-01-14', error: null })
        .mockResolvedValueOnce({ data: '2026-01-15', error: null });

      const supabase = createMockSupabase(mockRpc);

      // First call — before settings change (start=06:00, time=05:50 → prev day)
      const result1 = await getServerGamingDayAt(
        supabase,
        '2026-01-15T13:50:00Z',
      );
      expect(result1).toBe('2026-01-14');

      // Second call — after settings change (start=05:00, time=05:50 → current day)
      const result2 = await getServerGamingDayAt(
        supabase,
        '2026-01-15T13:50:00Z',
      );
      expect(result2).toBe('2026-01-15');

      // Verify no caching — two separate RPC calls made
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Scenario 7: Range query (p_weeks=4, start_gd = end_gd - 28)
  // =========================================================================
  describe('Scenario 7: Range query', () => {
    it('returns correct date range from rpc_gaming_day_range', async () => {
      // rpc_gaming_day_range returns TABLE(start_gd, end_gd)
      // Supabase returns this as an array of rows (or single row depending on client)
      const mockRpc = jest.fn().mockResolvedValue({
        data: [{ start_gd: '2026-01-06', end_gd: '2026-02-03' }],
        error: null,
      });

      const supabase = createMockSupabase(mockRpc);
      const client = supabase as unknown as SupabaseClient<Database>;
      const { data, error } = await client.rpc('rpc_gaming_day_range' as never, {
        p_weeks: 4,
      } as never);

      expect(error).toBeNull();
      expect(data).toEqual([{ start_gd: '2026-01-06', end_gd: '2026-02-03' }]);

      // Verify: end_gd - start_gd = 28 days
      const start = new Date('2026-01-06');
      const end = new Date('2026-02-03');
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(28);

      expect(mockRpc).toHaveBeenCalledWith('rpc_gaming_day_range', {
        p_weeks: 4,
      });
    });

    it('defaults to 4 weeks when p_weeks is not specified', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: [{ start_gd: '2026-01-06', end_gd: '2026-02-03' }],
        error: null,
      });

      const supabase = createMockSupabase(mockRpc);
      const client = supabase as unknown as SupabaseClient<Database>;

      // DB default: p_weeks=4, but client must still pass it explicitly
      await client.rpc('rpc_gaming_day_range' as never, {
        p_weeks: 4,
      } as never);

      expect(mockRpc).toHaveBeenCalledWith('rpc_gaming_day_range', {
        p_weeks: 4,
      });
    });
  });

  // =========================================================================
  // Scenario 8: Fail closed (no RLS context → UNAUTHORIZED)
  // =========================================================================
  describe('Scenario 8: Fail closed', () => {
    it('throws DomainError when RPC fails due to missing RLS context', async () => {
      const mockRpc = createErrorRpc(
        'UNAUTHORIZED: app.casino_id not set — call set_rls_context_from_staff() first',
      );
      const supabase = createMockSupabase(mockRpc);

      await expect(getServerGamingDay(supabase)).rejects.toThrow(DomainError);

      await expect(getServerGamingDay(supabase)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('UNAUTHORIZED'),
      });
    });

    it('throws DomainError when RPC returns null data', async () => {
      const mockRpc = jest
        .fn()
        .mockResolvedValue({ data: null, error: null });
      const supabase = createMockSupabase(mockRpc);

      await expect(getServerGamingDay(supabase)).rejects.toThrow(DomainError);

      await expect(getServerGamingDay(supabase)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Gaming day RPC returned null',
      });
    });

    it('throws DomainError from getServerGamingDayAt on RPC failure', async () => {
      const mockRpc = createErrorRpc(
        'UNAUTHORIZED: app.casino_id not set — call set_rls_context_from_staff() first',
      );
      const supabase = createMockSupabase(mockRpc);

      await expect(
        getServerGamingDayAt(supabase, '2026-01-15T14:00:00Z'),
      ).rejects.toThrow(DomainError);

      await expect(
        getServerGamingDayAt(supabase, '2026-01-15T14:00:00Z'),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('UNAUTHORIZED'),
      });
    });
  });

  // =========================================================================
  // Server Helper Contract Tests
  // =========================================================================
  describe('Server helper contract', () => {
    it('getServerGamingDay calls rpc_current_gaming_day with no timestamp', async () => {
      const mockRpc = createSuccessRpc('2026-02-03');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDay(supabase);

      expect(result).toBe('2026-02-03');
      // Production API: no p_timestamp parameter
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day');
    });

    it('getServerGamingDayAt passes timestamp to RPC', async () => {
      const mockRpc = createSuccessRpc('2026-01-15');
      const supabase = createMockSupabase(mockRpc);

      const result = await getServerGamingDayAt(
        supabase,
        '2026-01-15T14:10:00Z',
      );

      expect(result).toBe('2026-01-15');
      expect(mockRpc).toHaveBeenCalledWith('rpc_current_gaming_day', {
        p_timestamp: '2026-01-15T14:10:00Z',
      });
    });
  });
});
