/**
 * Shift Alerts Hook
 *
 * Fetches cash observation spike alerts for shift dashboard.
 * TELEMETRY-ONLY: These are observational alerts, NOT authoritative.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { CashObsSpikeAlertDTO } from "@/services/table-context/dtos";

import { fetchCashObsAlerts } from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseShiftAlertsOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches cash observation spike alerts.
 * Alerts trigger when observed totals exceed configured thresholds.
 *
 * @example
 * ```tsx
 * const { data: alerts } = useShiftAlerts({
 *   window: { start, end },
 * });
 *
 * return (
 *   <AlertsPanel
 *     alerts={alerts ?? []}
 *     isTelemetry // Always show telemetry label
 *   />
 * );
 * ```
 */
export function useShiftAlerts(options: UseShiftAlertsOptions) {
  const { window, enabled = true } = options;

  return useQuery<CashObsSpikeAlertDTO[]>({
    queryKey: shiftDashboardKeys.alerts(window),
    queryFn: () => fetchCashObsAlerts(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 30_000, // 30 seconds - alerts should update more frequently
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // Auto-refresh every minute for alerts
  });
}
