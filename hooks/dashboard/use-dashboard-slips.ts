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
import type { RatingSlipWithPlayerDTO } from "@/services/rating-slip/dtos";

import { dashboardKeys } from "./keys";

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
