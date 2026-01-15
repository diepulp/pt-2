/**
 * Shift Dashboard Hooks
 *
 * TanStack Query hooks for shift dashboard data fetching.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

// Query Keys
export { shiftDashboardKeys, type ShiftTimeWindow } from "./keys";

// BFF Summary Hook (PERF: Single call for all metrics)
export {
  useShiftDashboardSummary,
  type UseShiftDashboardSummaryOptions,
} from "./use-shift-dashboard-summary";

// Shift Metrics Hooks
export {
  useShiftTableMetrics,
  type UseShiftTableMetricsOptions,
} from "./use-shift-table-metrics";

export {
  useShiftPitMetrics,
  type UseShiftPitMetricsOptions,
} from "./use-shift-pit-metrics";

export {
  useShiftCasinoMetrics,
  type UseShiftCasinoMetricsOptions,
} from "./use-shift-casino-metrics";

// Cash Observation Hooks (Telemetry)
export {
  useCashObsCasino,
  useCashObsPits,
  useCashObsTables,
  type UseCashObsCasinoOptions,
  type UseCashObsPitsOptions,
  type UseCashObsTablesOptions,
} from "./use-cash-observations";

// Cash Observations BFF Summary Hook (PERF-001: 4 calls -> 1)
export {
  useCashObsSummary,
  type UseCashObsSummaryOptions,
} from "./use-cash-obs-summary";

// Alerts Hook
export { useShiftAlerts, type UseShiftAlertsOptions } from "./use-shift-alerts";

// HTTP Fetchers (for direct use if needed)
export {
  fetchCashObsAlerts,
  fetchCashObsCasino,
  fetchCashObsPits,
  fetchCashObsSummary,
  fetchCashObsTables,
  fetchShiftCasinoMetrics,
  fetchShiftDashboardSummary,
  fetchShiftPitMetrics,
  fetchShiftTableMetrics,
} from "./http";
