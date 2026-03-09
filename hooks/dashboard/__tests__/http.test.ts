/**
 * Dashboard HTTP Fetch Function Tests
 *
 * Tests for extracted fetch functions with mocked Supabase client.
 * Verifies correct RPC calls, error handling, and return shapes.
 *
 * @see PRD-048 WS1 — Fetch Function Extraction
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  fetchDashboardTables,
  fetchDashboardStats,
  fetchGamingDayServer,
} from '../http';

// === Mock Helpers ===

function createMockRpcSupabase(
  rpcResults: Record<string, { data: unknown; error: unknown }>,
): SupabaseClient<Database> {
  return {
    rpc: jest.fn((fnName: string) => {
      const result = rpcResults[fnName] ?? {
        data: null,
        error: { message: `unknown rpc: ${fnName}` },
      };
      return Promise.resolve(result);
    }),
  } as unknown as SupabaseClient<Database>;
}

// === fetchDashboardTables ===

describe('fetchDashboardTables', () => {
  it('calls rpc_get_dashboard_tables_with_counts and returns tables', async () => {
    const mockTables = [
      { id: 'table-1', name: 'BJ-1', activeSlipsCount: 3, status: 'active' },
      { id: 'table-2', name: 'BJ-2', activeSlipsCount: 0, status: 'inactive' },
    ];
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_tables_with_counts: { data: mockTables, error: null },
    });

    const result = await fetchDashboardTables(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'rpc_get_dashboard_tables_with_counts',
    );
    expect(result).toEqual(mockTables);
  });

  it('throws Error with message on RPC error', async () => {
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_tables_with_counts: {
        data: null,
        error: { message: 'permission denied' },
      },
    });

    await expect(fetchDashboardTables(supabase)).rejects.toThrow(
      'permission denied',
    );
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_tables_with_counts: { data: null, error: null },
    });

    const result = await fetchDashboardTables(supabase);

    expect(result).toEqual([]);
  });
});

// === fetchDashboardStats ===

describe('fetchDashboardStats', () => {
  it('calls rpc_get_dashboard_stats and returns stats with gamingDay: null', async () => {
    const mockStats = {
      activeTablesCount: 5,
      openSlipsCount: 12,
      checkedInPlayersCount: 8,
    };
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_stats: { data: mockStats, error: null },
    });

    const result = await fetchDashboardStats(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_get_dashboard_stats');
    expect(result).toEqual({
      activeTablesCount: 5,
      openSlipsCount: 12,
      checkedInPlayersCount: 8,
      gamingDay: null,
    });
  });

  it('throws Error with prefixed message on RPC error', async () => {
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_stats: {
        data: null,
        error: { message: 'connection timeout' },
      },
    });

    await expect(fetchDashboardStats(supabase)).rejects.toThrow(
      'Failed to fetch dashboard stats: connection timeout',
    );
  });

  it('throws Error when data is null', async () => {
    const supabase = createMockRpcSupabase({
      rpc_get_dashboard_stats: { data: null, error: null },
    });

    await expect(fetchDashboardStats(supabase)).rejects.toThrow(
      'No stats data returned from RPC',
    );
  });
});

// === fetchGamingDayServer ===

describe('fetchGamingDayServer', () => {
  it('calls rpc_current_gaming_day and maps to GamingDayDTO shape', async () => {
    const supabase = createMockRpcSupabase({
      rpc_current_gaming_day: { data: '2026-03-09', error: null },
    });

    const result = await fetchGamingDayServer(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_current_gaming_day');
    expect(result.gaming_day).toBe('2026-03-09');
    expect(result).toHaveProperty('casino_id');
    expect(result).toHaveProperty('computed_at');
    expect(result).toHaveProperty('timezone');
  });

  it('throws Error with prefixed message on RPC error', async () => {
    const supabase = createMockRpcSupabase({
      rpc_current_gaming_day: {
        data: null,
        error: { message: 'function not found' },
      },
    });

    await expect(fetchGamingDayServer(supabase)).rejects.toThrow(
      'Failed to fetch gaming day: function not found',
    );
  });
});
