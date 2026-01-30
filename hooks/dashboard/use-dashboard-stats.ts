/**
 * Dashboard Stats Hook
 *
 * Fetches aggregate statistics for the pit dashboard:
 * - Active tables count
 * - Open slips count
 * - Checked-in players count
 * - Current gaming day
 *
 * PERF-002: Refactored to use single rpc_get_dashboard_stats RPC
 * instead of 4 separate HTTP calls (fetchTables, listRatingSlips×2, getVisits).
 *
 * @see PRD-006 Pit Dashboard UI
 * @see PERF-002 Pit Dashboard Data Flow Optimization
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';

import { dashboardKeys } from './keys';
import type { DashboardStats } from './types';

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
 * Fetches aggregate dashboard statistics for a casino.
 *
 * PERF-002: Uses single RPC call instead of 4 HTTP requests.
 * The RPC derives casino_id from set_rls_context_from_staff() per ADR-024.
 *
 * Aggregates:
 * - activeTablesCount: Tables with status = 'active'
 * - openSlipsCount: Rating slips with status = 'open' or 'paused'
 * - checkedInPlayersCount: Unique players with active visits (ended_at = null)
 * - gamingDay: Current gaming day (fetched separately via useGamingDay)
 *
 * @param casinoId - Casino UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading } = useDashboardStats(casinoId);
 *
 * return (
 *   <StatsBar>
 *     <Stat label="Active Tables" value={stats?.activeTablesCount ?? 0} />
 *     <Stat label="Open Slips" value={stats?.openSlipsCount ?? 0} />
 *     <Stat label="Players" value={stats?.checkedInPlayersCount ?? 0} />
 *   </StatsBar>
 * );
 * ```
 */
export function useDashboardStats(casinoId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.stats(casinoId!),
    queryFn: async (): Promise<DashboardStats> => {
      const supabase = createBrowserComponentClient();

      // PERF-002: Single RPC call replaces 4 HTTP requests
      // ADR-024 compliant: RPC derives casino_id from set_rls_context_from_staff()
      // Note: RPC not yet in database.types.ts until migration runs on remote
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        'rpc_get_dashboard_stats',
      );

      if (error) {
        throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
      }

      if (!data) {
        throw new Error('No stats data returned from RPC');
      }

      // Type assertion for JSONB response (RPC returns unknown when not in types)
      const stats = data as DashboardStatsRpcResponse;

      return {
        activeTablesCount: stats.activeTablesCount,
        openSlipsCount: stats.openSlipsCount,
        checkedInPlayersCount: stats.checkedInPlayersCount,
        // Gaming day fetched separately via useGamingDay hook
        gamingDay: null,
      };
    },
    enabled: !!casinoId,
    staleTime: 30_000, // 30 seconds - stats are aggregates, don't need instant updates
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    refetchInterval: 60_000, // Auto-refresh every minute for stats
  });
}

/**
 * Hook that combines dashboard stats with gaming day from casino settings.
 * This is a convenience hook for the complete stats bar display.
 *
 * @param casinoId - Casino UUID
 */
export function useDashboardStatsWithGamingDay(casinoId: string | undefined) {
  const statsQuery = useDashboardStats(casinoId);

  // Note: useGamingDay would be imported from hooks/casino
  // For now, we return stats without gaming day enrichment
  // The UI can compose these hooks directly

  return statsQuery;
}
