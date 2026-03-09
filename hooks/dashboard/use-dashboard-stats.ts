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

import { fetchDashboardStats } from './http';
import { dashboardKeys } from './keys';
import type { DashboardStats } from './types';

/**
 * Fetches aggregate dashboard statistics for a casino.
 *
 * PERF-002: Uses single RPC call instead of 4 HTTP requests.
 * The RPC derives casino_id from set_rls_context_from_staff() per ADR-024.
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

      // Extracted to http.ts for RSC prefetch reuse (PRD-048 WS1)
      return fetchDashboardStats(supabase);
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
