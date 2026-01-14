/**
 * Shift Metrics DTOs
 *
 * Pattern A (Contract-First): Manual interfaces for RPC aggregate responses.
 * These DTOs represent computed metrics from shift-level RPCs.
 *
 * AUTHORITATIVE METRICS: These are based on inventory snapshots and custody events,
 * distinct from telemetry-only cash observations.
 *
 * @see PRD-Shift-Dashboards-v0.2
 * @see SHIFT_METRICS_CATALOG §2-3
 * @see rpc_shift_table_metrics, rpc_shift_pit_metrics, rpc_shift_casino_metrics
 */

// === Input Parameter Types ===

/**
 * Base time window parameters for all shift metrics queries.
 */
export interface ShiftMetricsTimeWindow {
  casinoId: string; // Cache scoping only; RPC derives casino scope from RLS context
  startTs: string; // ISO timestamp
  endTs: string; // ISO timestamp
}

/**
 * Parameters for pit-level metrics query.
 */
export interface ShiftPitMetricsParams extends ShiftMetricsTimeWindow {
  pitId: string; // Required pit identifier
}

// === Table Metrics DTO ===

/**
 * Per-table shift metrics from rpc_shift_table_metrics.
 * Contains opening/closing snapshots, fills/credits, telemetry, and win/loss.
 *
 * @see rpc_shift_table_metrics in 20260114004336_rpc_shift_table_metrics.sql
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response with computed fields
export interface ShiftTableMetricsDTO {
  // Identity
  table_id: string;
  table_label: string;
  pit_id: string | null;

  // Time window
  window_start: string;
  window_end: string;

  // Opening snapshot
  opening_snapshot_id: string | null;
  opening_snapshot_at: string | null;
  opening_bankroll_total_cents: number;

  // Closing snapshot
  closing_snapshot_id: string | null;
  closing_snapshot_at: string | null;
  closing_bankroll_total_cents: number;

  // Fills and credits
  fills_total_cents: number;
  credits_total_cents: number;

  // Drop custody
  drop_custody_present: boolean;

  // Telemetry (estimated drop)
  estimated_drop_rated_cents: number;
  estimated_drop_grind_cents: number;
  estimated_drop_buyins_cents: number;
  telemetry_quality: "GOOD_COVERAGE" | "LOW_COVERAGE" | "NONE";
  telemetry_notes: string;

  // Win/Loss
  win_loss_inventory_cents: number | null;
  win_loss_estimated_cents: number | null;
  metric_grade: "ESTIMATE" | "AUTHORITATIVE";

  // Exception flags
  missing_opening_snapshot: boolean;
  missing_closing_snapshot: boolean;
}

// === Pit Metrics DTO ===

/**
 * Pit-level aggregated shift metrics from rpc_shift_pit_metrics.
 * Rolls up all tables in a specific pit.
 *
 * @see rpc_shift_pit_metrics in 20260114004455_rpc_shift_rollups.sql
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response
export interface ShiftPitMetricsDTO {
  // Identity
  pit_id: string;

  // Time window
  window_start: string;
  window_end: string;

  // Table counts
  tables_count: number;
  tables_with_opening_snapshot: number;
  tables_with_closing_snapshot: number;
  tables_with_telemetry_count: number;
  tables_good_coverage_count: number;
  tables_grade_estimate: number;

  // Fills and credits
  fills_total_cents: number;
  credits_total_cents: number;

  // Telemetry (estimated drop totals)
  estimated_drop_rated_total_cents: number;
  estimated_drop_grind_total_cents: number;
  estimated_drop_buyins_total_cents: number;

  // Win/Loss totals
  win_loss_inventory_total_cents: number;
  win_loss_estimated_total_cents: number;
}

// === Dashboard Summary DTO (BFF) ===

/**
 * Combined dashboard summary for single-call initialization.
 * Returns all three metric levels in one response to reduce HTTP round-trips.
 *
 * PERF: Reduces dashboard load from 7 HTTP calls to 1.
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md - Medium Severity: Redundant RPC Computation
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: BFF aggregate response
export interface ShiftDashboardSummaryDTO {
  casino: ShiftCasinoMetricsDTO;
  pits: ShiftPitMetricsDTO[];
  tables: ShiftTableMetricsDTO[];
}

// === Casino Metrics DTO ===

/**
 * Casino-level aggregated shift metrics from rpc_shift_casino_metrics.
 * Rolls up all tables in the entire casino.
 *
 * @see rpc_shift_casino_metrics in 20260114004455_rpc_shift_rollups.sql
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC aggregate response
export interface ShiftCasinoMetricsDTO {
  // Time window
  window_start: string;
  window_end: string;

  // Counts
  tables_count: number;
  pits_count: number;
  tables_with_opening_snapshot: number;
  tables_with_closing_snapshot: number;
  tables_with_telemetry_count: number;
  tables_good_coverage_count: number;
  tables_grade_estimate: number;

  // Fills and credits
  fills_total_cents: number;
  credits_total_cents: number;

  // Telemetry (estimated drop totals)
  estimated_drop_rated_total_cents: number;
  estimated_drop_grind_total_cents: number;
  estimated_drop_buyins_total_cents: number;

  // Win/Loss totals
  win_loss_inventory_total_cents: number;
  win_loss_estimated_total_cents: number;
}
