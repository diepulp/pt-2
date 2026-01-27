/**
 * Dashboard Slips Hook
 *
 * Fetches active rating slips for a selected gaming table.
 * Used by the pit dashboard to show players at a specific table.
 *
 * PERF-002: Refactored to include player names via join.
 * useActiveSlipsForDashboard now returns RatingSlipWithPlayerDTO[]
 * with player names included, eliminating the need for separate
 * useCasinoActivePlayers() call.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see PERF-002 Pit Dashboard Data Flow Optimization
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import { listActiveForTableWithPlayer } from "@/services/rating-slip/crud";
import type {
  RatingSlipDTO,
  RatingSlipWithPlayerDTO,
} from "@/services/rating-slip/dtos";
import { listRatingSlips } from "@/services/rating-slip/http";

import { dashboardKeys } from "./keys";
import type { DashboardSlipsFilters } from "./types";

/**
 * Fetches rating slips for a specific table.
 *
 * By default, fetches active slips (open + paused).
 * Can filter to show only open, only paused, or all statuses.
 *
 * @param tableId - Gaming table UUID (required, undefined disables query)
 * @param filters - Optional filters (status)
 *
 * @example
 * ```tsx
 * // Get active slips for selected table
 * const { data: slips, isLoading } = useDashboardSlips(selectedTableId);
 *
 * // Get only open slips
 * const { data } = useDashboardSlips(tableId, { status: 'open' });
 * ```
 */
export function useDashboardSlips(
  tableId: string | undefined,
  filters: DashboardSlipsFilters = {},
) {
  return useQuery({
    queryKey: dashboardKeys.slips(tableId!, filters),
    queryFn: async (): Promise<RatingSlipDTO[]> => {
      // If specific status filter is provided, fetch only that status
      if (filters.status) {
        const result = await listRatingSlips({
          table_id: tableId,
          status: filters.status,
          limit: 100, // Reasonable limit for a single table
        });
        return result.items;
      }

      // Default: fetch both open and paused slips (active slips)
      const [openResult, pausedResult] = await Promise.all([
        listRatingSlips({ table_id: tableId, status: "open", limit: 100 }),
        listRatingSlips({ table_id: tableId, status: "paused", limit: 100 }),
      ]);

      // Combine and sort by start_time (most recent first)
      const allSlips = [...openResult.items, ...pausedResult.items];
      allSlips.sort(
        (a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
      );

      return allSlips;
    },
    enabled: !!tableId,
    staleTime: 15_000, // 15 seconds - slips change more frequently
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });
}

/**
 * Fetches active (open + paused) slips for a table with player names.
 *
 * PERF-002: Refactored to include player names via join, eliminating
 * the need for separate useCasinoActivePlayers() call.
 *
 * @param tableId - Gaming table UUID (required, undefined disables query)
 * @returns UseQueryResult with RatingSlipWithPlayerDTO[] including player names
 *
 * @see PERF-002 Pit Dashboard Data Flow Optimization
 */
export function useActiveSlipsForDashboard(tableId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.activeSlips(tableId!),
    queryFn: async (): Promise<RatingSlipWithPlayerDTO[]> => {
      const supabase = createBrowserComponentClient();

      // PERF-002: Single query with player join replaces
      // separate listRatingSlips + useCasinoActivePlayers calls
      return listActiveForTableWithPlayer(supabase, tableId!);
    },
    enabled: !!tableId,
    staleTime: 15_000, // 15 seconds - slips change frequently
    refetchOnWindowFocus: true,
  });
}
