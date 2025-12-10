/**
 * Dashboard Tables Hook
 *
 * Fetches all gaming tables for a casino with dashboard-specific metadata
 * including active slips count per table.
 *
 * Uses TableContextService for table data and RatingSlipService for slip counts.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { listRatingSlips } from "@/services/rating-slip/http";
import { fetchTables } from "@/services/table-context/http";

import { dashboardKeys } from "./keys";
import type { DashboardTableDTO, DashboardTablesFilters } from "./types";

/**
 * Fetches all tables for a casino with active slips count.
 *
 * This hook:
 * 1. Fetches all tables (or filtered by status/type/pit)
 * 2. For each table, counts active (open + paused) rating slips
 * 3. Returns enriched DashboardTableDTO array
 *
 * @param casinoId - Casino UUID (required)
 * @param filters - Optional filters for status, type, pit
 *
 * @example
 * ```tsx
 * const { data: tables, isLoading, error } = useDashboardTables(casinoId);
 *
 * // With filters
 * const { data } = useDashboardTables(casinoId, { status: 'active' });
 * ```
 */
export function useDashboardTables(
  casinoId: string | undefined,
  filters: DashboardTablesFilters = {},
) {
  return useQuery({
    queryKey: dashboardKeys.tables(casinoId!, filters),
    queryFn: async (): Promise<DashboardTableDTO[]> => {
      // Fetch tables with optional filters
      const tables = await fetchTables({
        status: filters.status,
        type: filters.type,
        pit: filters.pit,
        // No limit for dashboard - show all tables
      });

      // Fetch active slip counts for each table in parallel
      const tablesWithSlipCounts = await Promise.all(
        tables.map(async (table) => {
          // Fetch open and paused slips for this table
          const [openResult, pausedResult] = await Promise.all([
            listRatingSlips({ table_id: table.id, status: "open", limit: 100 }),
            listRatingSlips({
              table_id: table.id,
              status: "paused",
              limit: 100,
            }),
          ]);

          const activeSlipsCount =
            openResult.items.length + pausedResult.items.length;

          // Return enriched DTO
          const dashboardTable: DashboardTableDTO = {
            ...table,
            // GamingTableDTO fields are spread above
            // Add current_dealer as null since fetchTables doesn't include dealer
            current_dealer: null,
            activeSlipsCount,
          };

          return dashboardTable;
        }),
      );

      return tablesWithSlipCounts;
    },
    enabled: !!casinoId,
    staleTime: 30_000, // 30 seconds - tables don't change frequently
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });
}

/**
 * Fetches only active tables for a casino (status = 'active').
 * Convenience wrapper for the common dashboard use case.
 *
 * @param casinoId - Casino UUID (required)
 */
export function useDashboardActiveTables(casinoId: string | undefined) {
  return useDashboardTables(casinoId, { status: "active" });
}
