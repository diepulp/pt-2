/**
 * Dashboard HTTP Fetch Functions
 *
 * Standalone fetch functions for pit dashboard data.
 * Importable from both client hooks and RSC server components.
 *
 * NO 'use client' directive — must work in server context.
 * NO createBrowserComponentClient() — accepts SupabaseClient parameter.
 *
 * @see PRD-048 Pit Dashboard RSC Refactor (WS1)
 * @see EXEC-048 WS1 — Fetch Function Extraction
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GamingDayDTO } from '@/services/casino/dtos';
import type { Database } from '@/types/database.types';

import type { DashboardTableDTO, DashboardStats } from './types';

/**
 * Response shape from rpc_get_dashboard_stats RPC.
 * @internal
 */
interface DashboardStatsRpcResponse {
  activeTablesCount: number;
  openSlipsCount: number;
  checkedInPlayersCount: number;
}

/**
 * Fetches all gaming tables with active slips count via single RPC.
 * Does NOT apply client-side filters — those stay in the hook.
 *
 * Casino scope derived from authenticated RLS/session context
 * (RPCs call set_rls_context_from_staff per ADR-024).
 */
export async function fetchDashboardTables(
  supabase: SupabaseClient<Database>,
): Promise<DashboardTableDTO[]> {
  const { data, error } = await supabase.rpc(
    'rpc_get_dashboard_tables_with_counts',
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as DashboardTableDTO[]) ?? [];
}

/**
 * Fetches aggregate dashboard statistics via single RPC.
 *
 * Casino scope derived from authenticated RLS/session context
 * (RPCs call set_rls_context_from_staff per ADR-024).
 */
export async function fetchDashboardStats(
  supabase: SupabaseClient<Database>,
): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('rpc_get_dashboard_stats');

  if (error) {
    throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
  }

  if (!data) {
    throw new Error('No stats data returned from RPC');
  }

  const stats = data as unknown as DashboardStatsRpcResponse;

  return {
    activeTablesCount: stats.activeTablesCount,
    openSlipsCount: stats.openSlipsCount,
    checkedInPlayersCount: stats.checkedInPlayersCount,
    gamingDay: null,
  };
}

/**
 * Fetches current gaming day via direct RPC call.
 * Bypasses the HTTP API endpoint to avoid server-to-self loopback in RSC.
 *
 * Uses rpc_current_gaming_day (Layer 3 — ADR-024 compliant, no p_casino_id parameter).
 *
 * @see TEMP-001/002/003 Temporal patterns
 */
export async function fetchGamingDayServer(
  supabase: SupabaseClient<Database>,
): Promise<GamingDayDTO> {
  const { data, error } = await supabase.rpc('rpc_current_gaming_day');

  if (error) {
    throw new Error(`Failed to fetch gaming day: ${error.message}`);
  }

  return {
    gaming_day: data,
    casino_id: '',
    computed_at: new Date().toISOString(),
    timezone: '',
  };
}
