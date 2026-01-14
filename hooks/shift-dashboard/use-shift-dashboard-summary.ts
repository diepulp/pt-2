/**
 * Shift Dashboard Summary Hook
 *
 * TanStack Query hook for fetching all shift metrics in a single call.
 * PERF: Replaces 3 separate useQuery hooks (casino, pits, tables).
 *
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md
 * @see PRD-Shift-Dashboards-v0.2
 */

import { useQuery } from "@tanstack/react-query";

import type { ShiftDashboardSummaryDTO } from "@/services/table-context/shift-metrics/dtos";

import { fetchShiftDashboardSummary } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseShiftDashboardSummaryOptions {
  /** Time window for metrics query */
  window: ShiftTimeWindow;
  /** Enable/disable the query (defaults to true) */
  enabled?: boolean;
}

/**
 * Fetches all shift metrics (casino, pits, tables) in a single HTTP call.
 *
 * Returns combined data structure:
 * - `casino`: Casino-level metrics
 * - `pits`: Array of pit-level metrics
 * - `tables`: Array of table-level metrics
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useShiftDashboardSummary({ window });
 *
 * // Access individual levels
 * const casinoMetrics = data?.casino;
 * const pitMetrics = data?.pits;
 * const tableMetrics = data?.tables;
 * ```
 */
export function useShiftDashboardSummary(
  options: UseShiftDashboardSummaryOptions,
) {
  const { window, enabled = true } = options;

  return useQuery<ShiftDashboardSummaryDTO>({
    queryKey: shiftDashboardKeys.summary(window),
    queryFn: () => fetchShiftDashboardSummary(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000, // 1 minute - matches existing hooks
    refetchOnWindowFocus: true,
  });
}
