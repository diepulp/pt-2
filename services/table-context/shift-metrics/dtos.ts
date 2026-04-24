/**
 * Shift Metrics DTOs
 *
 * Pattern A (Contract-First): Manual interfaces for RPC aggregate responses.
 * These DTOs represent computed metrics from shift-level RPCs.
 *
 * AUTHORITATIVE METRICS: These are based on inventory snapshots and custody events,
 * distinct from telemetry-only cash observations.
 *
 * Financial envelope wrapping (PRD-070 WS2 — DEFERRED):
 * All `_cents` fields here (`opening_bankroll_total_cents`,
 * `closing_bankroll_total_cents`, `fills_total_cents`, `credits_total_cents`,
 * `estimated_drop_rated_cents`, `estimated_drop_grind_cents`,
 * `estimated_drop_buyins_cents`, `win_loss_inventory_cents`,
 * `win_loss_estimated_cents`, `opening_bankroll_cents`) cascade into
 * `components/shift-dashboard-v3/*` (heavy metric table + telemetry rail
 * consumption). Blanket Phase 1.2 deferral — see `../dtos.ts` top-of-file
 * block for classification targets (CLASSIFICATION-RULES §3.5).
 *
 * Derived metrics (estimated_drop_*, win_loss_*) are Pattern B envelopes per
 * §C3: declare input sources and surface worst-of completeness when wrapped.
 * The existing `provenance` sibling module already models source/coverage —
 * when the deferral lifts, Phase 1.2 must reconcile `provenance` with the
 * `FinancialValue.completeness.coverage` slot to avoid duplicate semantics.
 *
 * @see PRD-Shift-Dashboards-v0.2
 * @see PRD-070 Financial Telemetry Wave 1 Phase 1.1
 * @see SHIFT_METRICS_CATALOG §2-3
 * @see rpc_shift_table_metrics, rpc_shift_pit_metrics, rpc_shift_casino_metrics
 */

import type {
  CoverageType,
  OpeningSource,
  ProvenanceMetadata,
} from './provenance';
import type { CoverageTier } from './snapshot-rules';

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
  /** Opening bankroll total in cents (sum of all chip denominations at shift start) */
  opening_bankroll_total_cents: number;

  // Closing snapshot
  closing_snapshot_id: string | null;
  closing_snapshot_at: string | null;
  /** Closing bankroll total in cents (sum of all chip denominations at shift end) */
  closing_bankroll_total_cents: number;

  // Fills and credits
  /** Total chip fills brought to the table in cents */
  fills_total_cents: number;
  /** Total chip credits removed from the table in cents */
  credits_total_cents: number;

  // Drop custody
  drop_custody_present: boolean;

  // Telemetry (estimated drop)
  /** Estimated drop from rated buy-ins only, in cents (subset of buyins_cents) */
  estimated_drop_rated_cents: number;
  /** Estimated drop from grind buy-ins only, in cents (subset of buyins_cents) */
  estimated_drop_grind_cents: number;
  /** Estimated drop total in cents — superset: equals rated_cents + grind_cents */
  estimated_drop_buyins_cents: number;
  telemetry_quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
  telemetry_notes: string;

  // Win/Loss
  /** Win/loss from inventory method in cents (opening + fills - credits - closing). Null if snapshots missing. */
  win_loss_inventory_cents: number | null;
  /** Win/loss from estimated drop method in cents (drop - closing + opening - fills + credits). Null if drop unavailable. */
  win_loss_estimated_cents: number | null;
  metric_grade: 'ESTIMATE' | 'AUTHORITATIVE';

  // Exception flags
  missing_opening_snapshot: boolean;
  missing_closing_snapshot: boolean;

  // PRD-036: Opening baseline provenance
  /** Which source was used for the opening baseline (ranked cascade) */
  opening_source: OpeningSource | null;
  /** The resolved opening bankroll value in cents (nullable) */
  opening_bankroll_cents: number | null;
  /** Timestamp of the source used for opening baseline (nullable) */
  opening_at: string | null;
  /** Coverage type: 'full', 'partial', or 'unknown' */
  coverage_type: CoverageType | null;

  // Trust metadata (WS1: provenance propagation)
  provenance: ProvenanceMetadata;
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
  /** Total chip fills across all tables in the pit, in cents */
  fills_total_cents: number;
  /** Total chip credits across all tables in the pit, in cents */
  credits_total_cents: number;

  // Telemetry (estimated drop totals)
  /** Estimated drop from rated buy-ins across all tables, in cents (subset of buyins_total_cents) */
  estimated_drop_rated_total_cents: number;
  /** Estimated drop from grind buy-ins across all tables, in cents (subset of buyins_total_cents) */
  estimated_drop_grind_total_cents: number;
  /** Estimated drop total across all tables, in cents — superset: equals rated + grind */
  estimated_drop_buyins_total_cents: number;

  // Win/Loss totals (PRD-036: nullable — null when all tables have null win/loss)
  /** Aggregated win/loss from inventory method across all tables, in cents */
  win_loss_inventory_total_cents: number | null;
  /** Aggregated win/loss from estimated drop method across all tables, in cents */
  win_loss_estimated_total_cents: number | null;

  // PRD-036: Baseline missing count
  /** Number of tables with no opening baseline (opening_source = 'none') */
  tables_missing_baseline_count: number;

  // Coverage (WS2: snapshot preconditions)
  snapshot_coverage_ratio: number;
  coverage_tier: CoverageTier;

  // Trust metadata (WS1: provenance propagation)
  provenance: ProvenanceMetadata;
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
  /** Total chip fills across all tables in the casino, in cents */
  fills_total_cents: number;
  /** Total chip credits across all tables in the casino, in cents */
  credits_total_cents: number;

  // Telemetry (estimated drop totals)
  /** Estimated drop from rated buy-ins across all tables, in cents (subset of buyins_total_cents) */
  estimated_drop_rated_total_cents: number;
  /** Estimated drop from grind buy-ins across all tables, in cents (subset of buyins_total_cents) */
  estimated_drop_grind_total_cents: number;
  /** Estimated drop total across all tables, in cents — superset: equals rated + grind */
  estimated_drop_buyins_total_cents: number;

  // Win/Loss totals (PRD-036: nullable — null when all tables have null win/loss)
  /** Aggregated win/loss from inventory method across all tables, in cents */
  win_loss_inventory_total_cents: number | null;
  /** Aggregated win/loss from estimated drop method across all tables, in cents */
  win_loss_estimated_total_cents: number | null;

  // PRD-036: Baseline missing count
  /** Number of tables with no opening baseline (opening_source = 'none') */
  tables_missing_baseline_count: number;

  // Coverage (WS2: snapshot preconditions)
  snapshot_coverage_ratio: number;
  coverage_tier: CoverageTier;

  // Trust metadata (WS1: provenance propagation)
  provenance: ProvenanceMetadata;
}
