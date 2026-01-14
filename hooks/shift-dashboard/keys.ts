/**
 * Shift Dashboard React Query Key Factories
 *
 * Query keys for shift dashboard data fetching.
 * Uses .scope pattern for surgical cache invalidation.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

import {
  serializeKeyFilters,
  type KeyFilter,
} from "@/services/shared/key-utils";

const ROOT = ["shift-dashboard"] as const;

// Helper to serialize filters - cast to satisfy KeyFilter signature
const serializeFilters = (filters: object = {}): string =>
  serializeKeyFilters(filters as unknown as KeyFilter);

/**
 * Time window filter for shift queries.
 */
export interface ShiftTimeWindow {
  start: string; // ISO timestamp
  end: string; // ISO timestamp
}

export const shiftDashboardKeys = {
  /** Root key for all shift dashboard queries */
  root: ROOT,

  // === BFF Summary Query ===

  /**
   * Dashboard summary (casino + pits + tables in single call).
   * PERF: Replaces 3 separate metrics calls.
   */
  summary: Object.assign(
    (window: ShiftTimeWindow) =>
      [...ROOT, "summary", serializeFilters(window)] as const,
    { scope: [...ROOT, "summary"] as const },
  ),

  // === Shift Metrics Queries ===

  /**
   * Per-table shift metrics for a time window.
   * Includes .scope for surgical invalidation.
   */
  tableMetrics: Object.assign(
    (window: ShiftTimeWindow) =>
      [...ROOT, "metrics", "tables", serializeFilters(window)] as const,
    { scope: [...ROOT, "metrics", "tables"] as const },
  ),

  /**
   * Pit-level shift metrics.
   * Optional pitId for single pit query.
   */
  pitMetrics: Object.assign(
    (window: ShiftTimeWindow, pitId?: string) =>
      [
        ...ROOT,
        "metrics",
        "pits",
        serializeFilters({ ...window, pitId }),
      ] as const,
    { scope: [...ROOT, "metrics", "pits"] as const },
  ),

  /**
   * Casino-level shift metrics summary.
   */
  casinoMetrics: Object.assign(
    (window: ShiftTimeWindow) =>
      [...ROOT, "metrics", "casino", serializeFilters(window)] as const,
    { scope: [...ROOT, "metrics", "casino"] as const },
  ),

  // === Cash Observation Queries (Telemetry) ===

  /**
   * Per-table cash observation rollups.
   * TELEMETRY-ONLY: Observational, not authoritative.
   */
  cashObsTables: Object.assign(
    (window: ShiftTimeWindow, tableId?: string) =>
      [
        ...ROOT,
        "cash-obs",
        "tables",
        serializeFilters({ ...window, tableId }),
      ] as const,
    { scope: [...ROOT, "cash-obs", "tables"] as const },
  ),

  /**
   * Per-pit cash observation rollups.
   */
  cashObsPits: Object.assign(
    (window: ShiftTimeWindow, pit?: string) =>
      [
        ...ROOT,
        "cash-obs",
        "pits",
        serializeFilters({ ...window, pit }),
      ] as const,
    { scope: [...ROOT, "cash-obs", "pits"] as const },
  ),

  /**
   * Casino-level cash observation rollup.
   */
  cashObsCasino: Object.assign(
    (window: ShiftTimeWindow) =>
      [...ROOT, "cash-obs", "casino", serializeFilters(window)] as const,
    { scope: [...ROOT, "cash-obs", "casino"] as const },
  ),

  /**
   * Cash observation spike alerts.
   */
  alerts: Object.assign(
    (window: ShiftTimeWindow) =>
      [...ROOT, "alerts", serializeFilters(window)] as const,
    { scope: [...ROOT, "alerts"] as const },
  ),

  // === Invalidation Helpers ===

  /**
   * Invalidate all shift dashboard data.
   * Use after major state changes.
   */
  all: () => ROOT,

  /**
   * Invalidate all metrics queries.
   */
  allMetrics: () => [...ROOT, "metrics"] as const,

  /**
   * Invalidate all cash observation queries.
   */
  allCashObs: () => [...ROOT, "cash-obs"] as const,
};
