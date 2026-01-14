/**
 * Cash Observations Hooks
 *
 * Fetches cash observation rollups for shift dashboard.
 * TELEMETRY-ONLY: These are observational, NOT authoritative metrics.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsTableRollupDTO,
} from "@/services/table-context/dtos";

import {
  fetchCashObsCasino,
  fetchCashObsPits,
  fetchCashObsTables,
} from "./http";
import { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

export interface UseCashObsTablesOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Optional table ID filter */
  tableId?: string;
  /** Whether the query is enabled */
  enabled?: boolean;
}

export interface UseCashObsPitsOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Optional pit name filter */
  pit?: string;
  /** Whether the query is enabled */
  enabled?: boolean;
}

export interface UseCashObsCasinoOptions {
  /** Time window for the query */
  window: ShiftTimeWindow;
  /** Whether the query is enabled */
  enabled?: boolean;
}

/**
 * Fetches per-table cash observation rollups.
 * TELEMETRY-ONLY: Observational, not authoritative.
 *
 * @example
 * ```tsx
 * const { data: cashObs } = useCashObsTables({
 *   window: { start, end },
 * });
 *
 * return (
 *   <CashObservationsPanel
 *     data={cashObs ?? []}
 *     isTelemetry // Always show telemetry label
 *   />
 * );
 * ```
 */
export function useCashObsTables(options: UseCashObsTablesOptions) {
  const { window, tableId, enabled = true } = options;

  return useQuery<CashObsTableRollupDTO[]>({
    queryKey: shiftDashboardKeys.cashObsTables(window, tableId),
    queryFn: () => fetchCashObsTables(window.start, window.end, tableId),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches per-pit cash observation rollups.
 */
export function useCashObsPits(options: UseCashObsPitsOptions) {
  const { window, pit, enabled = true } = options;

  return useQuery<CashObsPitRollupDTO[]>({
    queryKey: shiftDashboardKeys.cashObsPits(window, pit),
    queryFn: () => fetchCashObsPits(window.start, window.end, pit),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches casino-level cash observation rollup.
 */
export function useCashObsCasino(options: UseCashObsCasinoOptions) {
  const { window, enabled = true } = options;

  return useQuery<CashObsCasinoRollupDTO>({
    queryKey: shiftDashboardKeys.cashObsCasino(window),
    queryFn: () => fetchCashObsCasino(window.start, window.end),
    enabled: enabled && !!window.start && !!window.end,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
