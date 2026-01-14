/**
 * Shift Table Metrics Hook
 *
 * Fetches per-table shift metrics for a time window.
 * Returns inventory snapshots, fills, credits, telemetry, and win/loss.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { ShiftTableMetricsDTO } from "@/services/table-context/shift-metrics/dtos";

import { fetchShiftTableMetrics } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseShiftTableMetricsOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches per-table shift metrics for a time window.
 *
 * @example
 * ```tsx
 * const { data: tables, isLoading } = useShiftTableMetrics({
 *   window: { start: startTs, end: endTs },
 * });
 *
 * return (
 *   <TableMetricsTable
 *     data={tables ?? []}
 *     isLoading={isLoading}
 *   />
 * );
 * ```
 */
export function useShiftTableMetrics(options: UseShiftTableMetricsOptions) {
  const { window, enabled = true } = options;

  return useQuery<ShiftTableMetricsDTO[]>({
    queryKey: shiftDashboardKeys.tableMetrics(window),
    queryFn: () => fetchShiftTableMetrics(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000, // 1 minute - shift metrics update moderately
    refetchOnWindowFocus: true,
  });
}
