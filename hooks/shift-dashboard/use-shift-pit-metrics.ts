/**
 * Shift Pit Metrics Hook
 *
 * Fetches pit-level aggregated shift metrics.
 * Returns all pits or a single pit if pitId is provided.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { ShiftPitMetricsDTO } from "@/services/table-context/shift-metrics/dtos";

import { fetchShiftPitMetrics } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseShiftPitMetricsOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Optional pit ID to filter to single pit */
  pitId?: string;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches pit-level shift metrics.
 *
 * @example
 * ```tsx
 * // All pits
 * const { data: pits } = useShiftPitMetrics({
 *   window: { start, end },
 * });
 *
 * // Single pit
 * const { data: pit } = useShiftPitMetrics({
 *   window: { start, end },
 *   pitId: 'pit-a',
 * });
 * ```
 */
export function useShiftPitMetrics(options: UseShiftPitMetricsOptions) {
  const { window, pitId, enabled = true } = options;

  return useQuery<ShiftPitMetricsDTO[]>({
    queryKey: shiftDashboardKeys.pitMetrics(window, pitId),
    queryFn: () => fetchShiftPitMetrics(window.start, window.end, pitId),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}
