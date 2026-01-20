/**
 * Dashboard Stats Hook
 *
 * Fetches aggregate statistics for the pit dashboard:
 * - Active tables count
 * - Open slips count
 * - Checked-in players count
 * - Current gaming day
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { listRatingSlips } from '@/services/rating-slip/http';
import { fetchTables } from '@/services/table-context/http';
import { getVisits } from '@/services/visit/http';

import { dashboardKeys } from './keys';
import type { DashboardStats } from './types';

/**
 * Fetches aggregate dashboard statistics for a casino.
 *
 * Aggregates:
 * - activeTablesCount: Tables with status = 'active'
 * - openSlipsCount: Rating slips with status = 'open' or 'paused'
 * - checkedInPlayersCount: Visits that are currently open (ended_at = null)
 * - gamingDay: Current gaming day from casino settings (null if not available)
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
      // Fetch all data in parallel for efficiency
      const [tables, openSlips, pausedSlips, visits] = await Promise.all([
        // Get all tables (we'll filter for active count)
        fetchTables({}),

        // Get open rating slips count (max 100 per schema limit)
        listRatingSlips({ status: 'open', limit: 100 }),

        // Get paused rating slips count (max 100 per schema limit)
        listRatingSlips({ status: 'paused', limit: 100 }),

        // Get active visits (active = ended_at is null)
        // Note: The API filters for active visits (not closed)
        // and returns visits for the current casino via RLS (max 100 per schema limit)
        getVisits({ status: 'active', limit: 100 }),
      ]);

      // Count active tables
      const activeTablesCount = tables.filter(
        (table) => table.status === 'active',
      ).length;

      // Count open + paused slips
      const openSlipsCount = openSlips.items.length + pausedSlips.items.length;

      // Count unique players with active visits
      // Use Set to dedupe player_id (in case of duplicate visit records)
      const activeVisitPlayerIds = new Set(
        visits.items
          .filter((visit) => visit.ended_at === null)
          .map((visit) => visit.player_id)
          .filter((id): id is string => id !== null),
      );
      const checkedInPlayersCount = activeVisitPlayerIds.size;

      // Gaming day - would come from CasinoService, but for now return null
      // The UI can fetch this separately via useGamingDay hook
      const gamingDay: string | null = null;

      return {
        activeTablesCount,
        openSlipsCount,
        checkedInPlayersCount,
        gamingDay,
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
