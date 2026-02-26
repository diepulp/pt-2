/**
 * Shift Metrics Service
 *
 * AUTHORITATIVE METRICS: These functions return computed shift metrics
 * based on inventory snapshots, fills, credits, and telemetry.
 *
 * @see PRD-Shift-Dashboards-v0.2
 * @see SHIFT_METRICS_CATALOG §2-3
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  ShiftCasinoMetricsDTO,
  ShiftDashboardSummaryDTO,
  ShiftMetricsTimeWindow,
  ShiftPitMetricsDTO,
  ShiftPitMetricsParams,
  ShiftTableMetricsDTO,
} from './dtos';
import type { CoverageType, OpeningSource } from './provenance';
import {
  deriveTableProvenance,
  rollupCasinoProvenance,
  rollupPitProvenance,
} from './provenance';
import {
  computeAggregatedCoverageRatio,
  getCoverageTier,
} from './snapshot-rules';

/**
 * Get per-table shift metrics for a time window.
 * Returns all active tables in the caller's casino with their metrics.
 */
export async function getShiftTableMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftTableMetricsDTO[]> {
  const { data, error } = await supabase.rpc('rpc_shift_table_metrics', {
    p_window_start: params.startTs,
    p_window_end: params.endTs,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch table shift metrics: ${error.message}`,
      { details: error },
    );
  }

  return ((data as unknown[]) ?? []).map(toShiftTableMetrics);
}

/**
 * Get pit-level aggregated shift metrics.
 * Rolls up all tables in the specified pit.
 */
export async function getShiftPitMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftPitMetricsParams,
): Promise<ShiftPitMetricsDTO | null> {
  const { data, error } = await supabase.rpc('rpc_shift_pit_metrics', {
    p_window_start: params.startTs,
    p_window_end: params.endTs,
    p_pit_id: params.pitId,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch pit shift metrics: ${error.message}`,
      { details: error },
    );
  }

  // RPC returns single row; null if no tables in pit
  const dataArray = data as unknown[];
  const row =
    Array.isArray(dataArray) && dataArray.length > 0 ? dataArray[0] : null;

  if (!row) {
    return null;
  }

  return toShiftPitMetrics(row);
}

/**
 * Get all pits' shift metrics for a time window.
 * Returns aggregated metrics for each pit in the casino.
 *
 * PERF: Uses client-side aggregation from table metrics to avoid N+1 pattern.
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md - Critical Finding: N+1 Query Pattern
 */
export async function getShiftAllPitsMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftPitMetricsDTO[]> {
  // Single DB call - avoids N+1 pattern (was: 1 + N calls for N pits)
  const tableMetrics = await getShiftTableMetrics(supabase, params);

  // Client-side aggregation by pit_id
  const pitTablesMap = new Map<string, ShiftTableMetricsDTO[]>();
  for (const table of tableMetrics) {
    if (!table.pit_id) continue;
    const arr = pitTablesMap.get(table.pit_id) ?? [];
    arr.push(table);
    pitTablesMap.set(table.pit_id, arr);
  }

  const pits: ShiftPitMetricsDTO[] = [];
  for (const [pitId, pitTables] of pitTablesMap) {
    pits.push(aggregatePitMetrics(pitId, pitTables));
  }

  return pits;
}

/**
 * Get casino-level aggregated shift metrics.
 * Rolls up all tables in the entire casino.
 */
export async function getShiftCasinoMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftCasinoMetricsDTO> {
  const { data, error } = await supabase.rpc('rpc_shift_casino_metrics', {
    p_window_start: params.startTs,
    p_window_end: params.endTs,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch casino shift metrics: ${error.message}`,
      { details: error },
    );
  }

  // RPC returns single row; default if no tables
  const dataArray = data as unknown[];
  const row = Array.isArray(dataArray) ? dataArray[0] : data;
  return toShiftCasinoMetrics(row);
}

/**
 * Get all dashboard metrics in a single call (BFF endpoint).
 * Returns casino, pits, and tables metrics to reduce HTTP round-trips.
 *
 * PERF: Single DB call + client-side aggregation replaces 7+ HTTP calls.
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md - Medium Severity: Redundant RPC Computation
 */
export async function getShiftDashboardSummary(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftDashboardSummaryDTO> {
  // Single DB call - table metrics are the source of truth
  const tables = await getShiftTableMetrics(supabase, params);

  // Client-side aggregation for pits (reuses shared helper)
  const pitTablesMap = new Map<string, ShiftTableMetricsDTO[]>();
  for (const table of tables) {
    if (!table.pit_id) continue;
    const arr = pitTablesMap.get(table.pit_id) ?? [];
    arr.push(table);
    pitTablesMap.set(table.pit_id, arr);
  }

  const pits: ShiftPitMetricsDTO[] = [];
  for (const [pitId, pitTables] of pitTablesMap) {
    pits.push(aggregatePitMetrics(pitId, pitTables));
  }

  // Client-side aggregation for casino
  const casino = aggregateCasinoMetrics(tables, params);

  return { casino, pits, tables };
}

// === Shared Aggregation Helpers ===

/**
 * PRD-036: Null-aware win/loss summation.
 * Returns null when ALL values are null, otherwise sums non-null values.
 */
function nullAwareSum(
  tables: ShiftTableMetricsDTO[],
  getter: (t: ShiftTableMetricsDTO) => number | null,
): number | null {
  const withValues = tables.filter((t) => getter(t) != null);
  if (withValues.length === 0) return null;
  return withValues.reduce((sum, t) => sum + getter(t)!, 0);
}

/**
 * Aggregate table metrics into a pit-level DTO.
 * PRD-036: Uses null-aware summation for win/loss totals.
 */
function aggregatePitMetrics(
  pitId: string,
  tables: ShiftTableMetricsDTO[],
): ShiftPitMetricsDTO {
  const withOpening = tables.filter((t) => !t.missing_opening_snapshot).length;
  const withClosing = tables.filter((t) => !t.missing_closing_snapshot).length;
  const ratio = computeAggregatedCoverageRatio(
    withOpening,
    withClosing,
    tables.length,
  );

  return {
    pit_id: pitId,
    window_start: tables[0]?.window_start ?? '',
    window_end: tables[0]?.window_end ?? '',
    tables_count: tables.length,
    tables_with_opening_snapshot: withOpening,
    tables_with_closing_snapshot: withClosing,
    tables_with_telemetry_count: tables.filter(
      (t) => t.telemetry_quality !== 'NONE',
    ).length,
    tables_good_coverage_count: tables.filter(
      (t) => t.telemetry_quality === 'GOOD_COVERAGE',
    ).length,
    tables_grade_estimate: tables.length, // Always ESTIMATE for MVP
    fills_total_cents: tables.reduce((sum, t) => sum + t.fills_total_cents, 0),
    credits_total_cents: tables.reduce(
      (sum, t) => sum + t.credits_total_cents,
      0,
    ),
    estimated_drop_rated_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_rated_cents,
      0,
    ),
    estimated_drop_grind_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_grind_cents,
      0,
    ),
    estimated_drop_buyins_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_buyins_cents,
      0,
    ),
    // PRD-036: Null-aware win/loss aggregation
    win_loss_inventory_total_cents: nullAwareSum(
      tables,
      (t) => t.win_loss_inventory_cents,
    ),
    win_loss_estimated_total_cents: nullAwareSum(
      tables,
      (t) => t.win_loss_estimated_cents,
    ),
    tables_missing_baseline_count: tables.filter(
      (t) => t.win_loss_inventory_cents == null,
    ).length,
    snapshot_coverage_ratio: ratio,
    coverage_tier: getCoverageTier(ratio),
    provenance: rollupPitProvenance(tables),
  };
}

/**
 * Aggregate table metrics into a casino-level DTO.
 * PRD-036: Uses null-aware summation for win/loss totals.
 */
function aggregateCasinoMetrics(
  tables: ShiftTableMetricsDTO[],
  params: ShiftMetricsTimeWindow,
): ShiftCasinoMetricsDTO {
  const uniquePitIds = new Set(tables.map((t) => t.pit_id).filter(Boolean));
  const casinoOpeningCount = tables.filter(
    (t) => !t.missing_opening_snapshot,
  ).length;
  const casinoClosingCount = tables.filter(
    (t) => !t.missing_closing_snapshot,
  ).length;
  const casinoCoverageRatio = computeAggregatedCoverageRatio(
    casinoOpeningCount,
    casinoClosingCount,
    tables.length,
  );

  return {
    window_start: tables[0]?.window_start ?? params.startTs,
    window_end: tables[0]?.window_end ?? params.endTs,
    tables_count: tables.length,
    pits_count: uniquePitIds.size,
    tables_with_opening_snapshot: casinoOpeningCount,
    tables_with_closing_snapshot: casinoClosingCount,
    tables_with_telemetry_count: tables.filter(
      (t) => t.telemetry_quality !== 'NONE',
    ).length,
    tables_good_coverage_count: tables.filter(
      (t) => t.telemetry_quality === 'GOOD_COVERAGE',
    ).length,
    tables_grade_estimate: tables.length,
    fills_total_cents: tables.reduce((sum, t) => sum + t.fills_total_cents, 0),
    credits_total_cents: tables.reduce(
      (sum, t) => sum + t.credits_total_cents,
      0,
    ),
    estimated_drop_rated_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_rated_cents,
      0,
    ),
    estimated_drop_grind_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_grind_cents,
      0,
    ),
    estimated_drop_buyins_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_buyins_cents,
      0,
    ),
    // PRD-036: Null-aware win/loss aggregation
    win_loss_inventory_total_cents: nullAwareSum(
      tables,
      (t) => t.win_loss_inventory_cents,
    ),
    win_loss_estimated_total_cents: nullAwareSum(
      tables,
      (t) => t.win_loss_estimated_cents,
    ),
    tables_missing_baseline_count: tables.filter(
      (t) => t.win_loss_inventory_cents == null,
    ).length,
    snapshot_coverage_ratio: casinoCoverageRatio,
    coverage_tier: getCoverageTier(casinoCoverageRatio),
    provenance: rollupCasinoProvenance(tables),
  };
}

// === Mappers ===

function toShiftTableMetrics(row: unknown): ShiftTableMetricsDTO {
  const r = row as Record<string, unknown>;
  const dto: Omit<ShiftTableMetricsDTO, 'provenance'> = {
    table_id: r.table_id as string,
    table_label: r.table_label as string,
    pit_id: (r.pit_id as string) ?? null,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    opening_snapshot_id: (r.opening_snapshot_id as string) ?? null,
    opening_snapshot_at: (r.opening_snapshot_at as string) ?? null,
    opening_bankroll_total_cents:
      r.opening_bankroll_total_cents != null
        ? Number(r.opening_bankroll_total_cents)
        : 0,
    closing_snapshot_id: (r.closing_snapshot_id as string) ?? null,
    closing_snapshot_at: (r.closing_snapshot_at as string) ?? null,
    closing_bankroll_total_cents:
      r.closing_bankroll_total_cents != null
        ? Number(r.closing_bankroll_total_cents)
        : 0,
    fills_total_cents: Number(r.fills_total_cents ?? 0),
    credits_total_cents: Number(r.credits_total_cents ?? 0),
    drop_custody_present: Boolean(r.drop_custody_present),
    estimated_drop_rated_cents: Number(r.estimated_drop_rated_cents ?? 0),
    estimated_drop_grind_cents: Number(r.estimated_drop_grind_cents ?? 0),
    estimated_drop_buyins_cents: Number(r.estimated_drop_buyins_cents ?? 0),
    telemetry_quality:
      (r.telemetry_quality as 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE') ??
      'NONE',
    telemetry_notes: (r.telemetry_notes as string) ?? '',
    win_loss_inventory_cents:
      r.win_loss_inventory_cents != null
        ? Number(r.win_loss_inventory_cents)
        : null,
    win_loss_estimated_cents:
      r.win_loss_estimated_cents != null
        ? Number(r.win_loss_estimated_cents)
        : null,
    metric_grade:
      (r.metric_grade as 'ESTIMATE' | 'AUTHORITATIVE') ?? 'ESTIMATE',
    missing_opening_snapshot: Boolean(r.missing_opening_snapshot),
    missing_closing_snapshot: Boolean(r.missing_closing_snapshot),
    // PRD-036: Opening baseline provenance
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
    opening_source: (r.opening_source as OpeningSource) ?? null,
    opening_bankroll_cents:
      r.opening_bankroll_cents != null
        ? Number(r.opening_bankroll_cents)
        : null,
    opening_at: (r.opening_at as string) ?? null,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
    coverage_type: (r.coverage_type as CoverageType) ?? null,
  };

  // Attach provenance (WS1)
  const provenance = deriveTableProvenance(dto);
  return { ...dto, provenance };
}

function toShiftPitMetrics(row: unknown): ShiftPitMetricsDTO {
  const r = row as Record<string, unknown>;
  const withOpening = Number(r.tables_with_opening_snapshot ?? 0);
  const withClosing = Number(r.tables_with_closing_snapshot ?? 0);
  const total = Number(r.tables_count ?? 0);
  const ratio = computeAggregatedCoverageRatio(withOpening, withClosing, total);

  return {
    pit_id: r.pit_id as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    tables_count: total,
    tables_with_opening_snapshot: withOpening,
    tables_with_closing_snapshot: withClosing,
    tables_with_telemetry_count: Number(r.tables_with_telemetry_count ?? 0),
    tables_good_coverage_count: Number(r.tables_good_coverage_count ?? 0),
    tables_grade_estimate: Number(r.tables_grade_estimate ?? 0),
    fills_total_cents: Number(r.fills_total_cents ?? 0),
    credits_total_cents: Number(r.credits_total_cents ?? 0),
    estimated_drop_rated_total_cents: Number(
      r.estimated_drop_rated_total_cents ?? 0,
    ),
    estimated_drop_grind_total_cents: Number(
      r.estimated_drop_grind_total_cents ?? 0,
    ),
    estimated_drop_buyins_total_cents: Number(
      r.estimated_drop_buyins_total_cents ?? 0,
    ),
    win_loss_inventory_total_cents:
      r.win_loss_inventory_total_cents != null
        ? Number(r.win_loss_inventory_total_cents)
        : null,
    win_loss_estimated_total_cents:
      r.win_loss_estimated_total_cents != null
        ? Number(r.win_loss_estimated_total_cents)
        : null,
    tables_missing_baseline_count: 0, // RPC-based pit metrics don't have this; default 0
    snapshot_coverage_ratio: ratio,
    coverage_tier: getCoverageTier(ratio),
    // RPC-based pit metrics don't have table-level detail; derive minimal provenance
    provenance: {
      source: 'telemetry',
      grade: 'ESTIMATE',
      quality:
        Number(r.tables_good_coverage_count ?? 0) > 0
          ? 'GOOD_COVERAGE'
          : 'NONE',
      coverage_ratio: ratio,
      null_reasons: [],
    },
  };
}

function toShiftCasinoMetrics(row: unknown): ShiftCasinoMetricsDTO {
  const emptyProvenance = {
    source: 'telemetry' as const,
    grade: 'ESTIMATE' as const,
    quality: 'NONE' as const,
    coverage_ratio: 0,
    null_reasons: [] as import('./provenance').NullReason[],
  };

  if (!row) {
    return {
      window_start: '',
      window_end: '',
      tables_count: 0,
      pits_count: 0,
      tables_with_opening_snapshot: 0,
      tables_with_closing_snapshot: 0,
      tables_with_telemetry_count: 0,
      tables_good_coverage_count: 0,
      tables_grade_estimate: 0,
      fills_total_cents: 0,
      credits_total_cents: 0,
      estimated_drop_rated_total_cents: 0,
      estimated_drop_grind_total_cents: 0,
      estimated_drop_buyins_total_cents: 0,
      win_loss_inventory_total_cents: null,
      win_loss_estimated_total_cents: null,
      tables_missing_baseline_count: 0,
      snapshot_coverage_ratio: 0,
      coverage_tier: 'NONE',
      provenance: emptyProvenance,
    };
  }
  const r = row as Record<string, unknown>;
  const withOpening = Number(r.tables_with_opening_snapshot ?? 0);
  const withClosing = Number(r.tables_with_closing_snapshot ?? 0);
  const total = Number(r.tables_count ?? 0);
  const ratio = computeAggregatedCoverageRatio(withOpening, withClosing, total);

  return {
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    tables_count: total,
    pits_count: Number(r.pits_count ?? 0),
    tables_with_opening_snapshot: withOpening,
    tables_with_closing_snapshot: withClosing,
    tables_with_telemetry_count: Number(r.tables_with_telemetry_count ?? 0),
    tables_good_coverage_count: Number(r.tables_good_coverage_count ?? 0),
    tables_grade_estimate: Number(r.tables_grade_estimate ?? 0),
    fills_total_cents: Number(r.fills_total_cents ?? 0),
    credits_total_cents: Number(r.credits_total_cents ?? 0),
    estimated_drop_rated_total_cents: Number(
      r.estimated_drop_rated_total_cents ?? 0,
    ),
    estimated_drop_grind_total_cents: Number(
      r.estimated_drop_grind_total_cents ?? 0,
    ),
    estimated_drop_buyins_total_cents: Number(
      r.estimated_drop_buyins_total_cents ?? 0,
    ),
    win_loss_inventory_total_cents:
      r.win_loss_inventory_total_cents != null
        ? Number(r.win_loss_inventory_total_cents)
        : null,
    win_loss_estimated_total_cents:
      r.win_loss_estimated_total_cents != null
        ? Number(r.win_loss_estimated_total_cents)
        : null,
    tables_missing_baseline_count: 0, // RPC-based casino metrics don't have this; default 0
    snapshot_coverage_ratio: ratio,
    coverage_tier: getCoverageTier(ratio),
    // RPC-based casino metrics don't have table-level detail; derive minimal provenance
    provenance: {
      ...emptyProvenance,
      quality:
        Number(r.tables_good_coverage_count ?? 0) > 0
          ? ('GOOD_COVERAGE' as const)
          : ('NONE' as const),
      coverage_ratio: ratio,
    },
  };
}
