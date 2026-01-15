/**
 * Cash Observations Summary Hook
 *
 * Fetches consolidated cash observation data in a single call.
 * PERF: Reduces 4 HTTP calls to 1.
 * TELEMETRY-ONLY: All data is observational, NOT authoritative.
 *
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { CashObsSummaryDTO } from "@/services/table-context/dtos";

import { fetchCashObsSummary } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseCashObsSummaryOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches all cash observation data in a single call.
 * PERF: Reduces 4 HTTP calls to 1 by using BFF endpoint.
 * TELEMETRY-ONLY: All data is observational, NOT authoritative.
 *
 * @example
 * ```tsx
 * const { data: cashObs } = useCashObsSummary({
 *   window: { start, end },
 * });
 *
 * return (
 *   <>
 *     <CashObservationsPanel
 *       casinoData={cashObs?.casino}
 *       pitsData={cashObs?.pits}
 *       tablesData={cashObs?.tables}
 *     />
 *     <AlertsPanel alerts={cashObs?.alerts} />
 *   </>
 * );
 * ```
 */
export function useCashObsSummary(options: UseCashObsSummaryOptions) {
  const { window, enabled = true } = options;

  return useQuery<CashObsSummaryDTO>({
    queryKey: shiftDashboardKeys.cashObsSummary(window),
    queryFn: () => fetchCashObsSummary(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 30_000, // 30 seconds - matches alerts refresh
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}
