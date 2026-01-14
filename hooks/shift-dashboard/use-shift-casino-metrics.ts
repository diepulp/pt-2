/**
 * Shift Casino Metrics Hook
 *
 * Fetches casino-level aggregated shift metrics.
 * Rolls up all tables in the entire casino.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { ShiftCasinoMetricsDTO } from "@/services/table-context/shift-metrics/dtos";

import { fetchShiftCasinoMetrics } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseShiftCasinoMetricsOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches casino-level shift metrics summary.
 *
 * @example
 * ```tsx
 * const { data: casino, isLoading } = useShiftCasinoMetrics({
 *   window: { start, end },
 * });
 *
 * return (
 *   <CasinoSummaryCard
 *     tablesCount={casino?.tables_count ?? 0}
 *     pitsCount={casino?.pits_count ?? 0}
 *     winLoss={casino?.win_loss_estimated_total_cents ?? 0}
 *   />
 * );
 * ```
 */
export function useShiftCasinoMetrics(options: UseShiftCasinoMetricsOptions) {
  const { window, enabled = true } = options;

  return useQuery<ShiftCasinoMetricsDTO>({
    queryKey: shiftDashboardKeys.casinoMetrics(window),
    queryFn: () => fetchShiftCasinoMetrics(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}
