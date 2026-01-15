/**
 * Shift Dashboard HTTP Fetchers
 *
 * Client-side fetch functions for Shift Dashboard API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

import { fetchJSON } from "@/lib/http/fetch-json";
import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsSpikeAlertDTO,
  CashObsSummaryDTO,
  CashObsTableRollupDTO,
} from "@/services/table-context/dtos";
import type {
  ShiftCasinoMetricsDTO,
  ShiftDashboardSummaryDTO,
  ShiftPitMetricsDTO,
  ShiftTableMetricsDTO,
} from "@/services/table-context/shift-metrics/dtos";

const BASE = "/api/v1/shift-dashboards";
const BASE_METRICS = `${BASE}/metrics`;
const BASE_CASH_OBS = "/api/v1/shift-dashboards/cash-observations";

/**
 * Builds URLSearchParams from filter object.
 */
function buildParams(
  filters: Record<string, string | undefined>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string][];
  return new URLSearchParams(entries);
}

// === BFF Summary Fetcher ===

/**
 * Fetches all shift metrics (casino, pits, tables) in a single call.
 * PERF: Reduces dashboard initialization from 3 HTTP calls to 1.
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md
 */
export async function fetchShiftDashboardSummary(
  start: string,
  end: string,
): Promise<ShiftDashboardSummaryDTO> {
  const params = buildParams({ start, end });
  return fetchJSON<ShiftDashboardSummaryDTO>(`${BASE}/summary?${params}`);
}

// === Shift Metrics Fetchers ===

/**
 * Fetches per-table shift metrics for a time window.
 */
export async function fetchShiftTableMetrics(
  start: string,
  end: string,
): Promise<ShiftTableMetricsDTO[]> {
  const params = buildParams({ start, end });
  return fetchJSON<ShiftTableMetricsDTO[]>(`${BASE_METRICS}/tables?${params}`);
}

/**
 * Fetches pit-level shift metrics.
 * Returns all pits if pitId is not provided.
 */
export async function fetchShiftPitMetrics(
  start: string,
  end: string,
  pitId?: string,
): Promise<ShiftPitMetricsDTO[]> {
  const params = buildParams({ start, end, pit_id: pitId });
  return fetchJSON<ShiftPitMetricsDTO[]>(`${BASE_METRICS}/pits?${params}`);
}

/**
 * Fetches casino-level shift metrics summary.
 */
export async function fetchShiftCasinoMetrics(
  start: string,
  end: string,
): Promise<ShiftCasinoMetricsDTO> {
  const params = buildParams({ start, end });
  return fetchJSON<ShiftCasinoMetricsDTO>(`${BASE_METRICS}/casino?${params}`);
}

// === Cash Observation Fetchers (Telemetry) ===

/**
 * Fetches per-table cash observation rollups.
 * TELEMETRY-ONLY: Observational, not authoritative.
 */
export async function fetchCashObsTables(
  start: string,
  end: string,
  tableId?: string,
): Promise<CashObsTableRollupDTO[]> {
  const params = buildParams({ start, end, table_id: tableId });
  return fetchJSON<CashObsTableRollupDTO[]>(
    `${BASE_CASH_OBS}/tables?${params}`,
  );
}

/**
 * Fetches per-pit cash observation rollups.
 */
export async function fetchCashObsPits(
  start: string,
  end: string,
  pit?: string,
): Promise<CashObsPitRollupDTO[]> {
  const params = buildParams({ start, end, pit });
  return fetchJSON<CashObsPitRollupDTO[]>(`${BASE_CASH_OBS}/pits?${params}`);
}

/**
 * Fetches casino-level cash observation rollup.
 */
export async function fetchCashObsCasino(
  start: string,
  end: string,
): Promise<CashObsCasinoRollupDTO> {
  const params = buildParams({ start, end });
  return fetchJSON<CashObsCasinoRollupDTO>(`${BASE_CASH_OBS}/casino?${params}`);
}

/**
 * Fetches cash observation spike alerts.
 */
export async function fetchCashObsAlerts(
  start: string,
  end: string,
): Promise<CashObsSpikeAlertDTO[]> {
  const params = buildParams({ start, end });
  return fetchJSON<CashObsSpikeAlertDTO[]>(`${BASE_CASH_OBS}/alerts?${params}`);
}

// === BFF Consolidated Fetcher (PERF-001) ===

/**
 * Fetches all cash observation data in a single call.
 * PERF: Reduces 4 HTTP calls to 1.
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
 */
export async function fetchCashObsSummary(
  start: string,
  end: string,
): Promise<CashObsSummaryDTO> {
  const params = buildParams({ start, end });
  return fetchJSON<CashObsSummaryDTO>(`${BASE_CASH_OBS}/summary?${params}`);
}
