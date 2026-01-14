/**
 * Shift Metrics Service
 *
 * AUTHORITATIVE METRICS: These functions return computed shift metrics
 * based on inventory snapshots, fills, credits, and telemetry.
 *
 * @see PRD-Shift-Dashboards-v0.2
 * @see SHIFT_METRICS_CATALOG §2-3
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  ShiftCasinoMetricsDTO,
  ShiftMetricsTimeWindow,
  ShiftPitMetricsDTO,
  ShiftPitMetricsParams,
  ShiftTableMetricsDTO,
} from "./dtos";

// Type helper for RPC calls until remote types are regenerated
type SupabaseRpc = SupabaseClient<Database>["rpc"];
type RpcFn = ReturnType<SupabaseRpc>;

/**
 * Get per-table shift metrics for a time window.
 * Returns all active tables in the caller's casino with their metrics.
 */
export async function getShiftTableMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftTableMetricsDTO[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, custom-rules/no-dto-type-assertions -- RPCs not in remote types yet
  const { data, error } = (await (supabase.rpc as any)(
    "rpc_shift_table_metrics",
    {
      p_window_start: params.startTs,
      p_window_end: params.endTs,
    },
  )) as RpcFn;

  if (error) {
    throw new DomainError(
      "INTERNAL_ERROR",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, custom-rules/no-dto-type-assertions -- RPCs not in remote types yet
  const { data, error } = (await (supabase.rpc as any)(
    "rpc_shift_pit_metrics",
    {
      p_window_start: params.startTs,
      p_window_end: params.endTs,
      p_pit_id: params.pitId,
    },
  )) as RpcFn;

  if (error) {
    throw new DomainError(
      "INTERNAL_ERROR",
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
 */
export async function getShiftAllPitsMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftPitMetricsDTO[]> {
  // First get all unique pits from table metrics
  const tableMetrics = await getShiftTableMetrics(supabase, params);

  // Extract unique pit IDs (excluding null)
  const pitIds = [
    ...new Set(
      tableMetrics.map((t) => t.pit_id).filter((p): p is string => p !== null),
    ),
  ];

  // Fetch metrics for each pit
  const pitMetrics: ShiftPitMetricsDTO[] = [];
  for (const pitId of pitIds) {
    const metrics = await getShiftPitMetrics(supabase, {
      ...params,
      pitId,
    });
    if (metrics) {
      pitMetrics.push(metrics);
    }
  }

  return pitMetrics;
}

/**
 * Get casino-level aggregated shift metrics.
 * Rolls up all tables in the entire casino.
 */
export async function getShiftCasinoMetrics(
  supabase: SupabaseClient<Database>,
  params: ShiftMetricsTimeWindow,
): Promise<ShiftCasinoMetricsDTO> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, custom-rules/no-dto-type-assertions -- RPCs not in remote types yet
  const { data, error } = (await (supabase.rpc as any)(
    "rpc_shift_casino_metrics",
    {
      p_window_start: params.startTs,
      p_window_end: params.endTs,
    },
  )) as RpcFn;

  if (error) {
    throw new DomainError(
      "INTERNAL_ERROR",
      `Failed to fetch casino shift metrics: ${error.message}`,
      { details: error },
    );
  }

  // RPC returns single row; default if no tables
  const dataArray = data as unknown[];
  const row = Array.isArray(dataArray) ? dataArray[0] : data;
  return toShiftCasinoMetrics(row);
}

// === Mappers ===

function toShiftTableMetrics(row: unknown): ShiftTableMetricsDTO {
  const r = row as Record<string, unknown>;
  return {
    table_id: r.table_id as string,
    table_label: r.table_label as string,
    pit_id: (r.pit_id as string) ?? null,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    opening_snapshot_id: (r.opening_snapshot_id as string) ?? null,
    opening_snapshot_at: (r.opening_snapshot_at as string) ?? null,
    opening_bankroll_total_cents: Number(r.opening_bankroll_total_cents ?? 0),
    closing_snapshot_id: (r.closing_snapshot_id as string) ?? null,
    closing_snapshot_at: (r.closing_snapshot_at as string) ?? null,
    closing_bankroll_total_cents: Number(r.closing_bankroll_total_cents ?? 0),
    fills_total_cents: Number(r.fills_total_cents ?? 0),
    credits_total_cents: Number(r.credits_total_cents ?? 0),
    drop_custody_present: Boolean(r.drop_custody_present),
    estimated_drop_rated_cents: Number(r.estimated_drop_rated_cents ?? 0),
    estimated_drop_grind_cents: Number(r.estimated_drop_grind_cents ?? 0),
    estimated_drop_buyins_cents: Number(r.estimated_drop_buyins_cents ?? 0),
    telemetry_quality:
      (r.telemetry_quality as "GOOD_COVERAGE" | "LOW_COVERAGE" | "NONE") ??
      "NONE",
    telemetry_notes: (r.telemetry_notes as string) ?? "",
    win_loss_inventory_cents:
      r.win_loss_inventory_cents != null
        ? Number(r.win_loss_inventory_cents)
        : null,
    win_loss_estimated_cents:
      r.win_loss_estimated_cents != null
        ? Number(r.win_loss_estimated_cents)
        : null,
    metric_grade:
      (r.metric_grade as "ESTIMATE" | "AUTHORITATIVE") ?? "ESTIMATE",
    missing_opening_snapshot: Boolean(r.missing_opening_snapshot),
    missing_closing_snapshot: Boolean(r.missing_closing_snapshot),
  };
}

function toShiftPitMetrics(row: unknown): ShiftPitMetricsDTO {
  const r = row as Record<string, unknown>;
  return {
    pit_id: r.pit_id as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    tables_count: Number(r.tables_count ?? 0),
    tables_with_opening_snapshot: Number(r.tables_with_opening_snapshot ?? 0),
    tables_with_closing_snapshot: Number(r.tables_with_closing_snapshot ?? 0),
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
    win_loss_inventory_total_cents: Number(
      r.win_loss_inventory_total_cents ?? 0,
    ),
    win_loss_estimated_total_cents: Number(
      r.win_loss_estimated_total_cents ?? 0,
    ),
  };
}

function toShiftCasinoMetrics(row: unknown): ShiftCasinoMetricsDTO {
  if (!row) {
    return {
      window_start: "",
      window_end: "",
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
      win_loss_inventory_total_cents: 0,
      win_loss_estimated_total_cents: 0,
    };
  }
  const r = row as Record<string, unknown>;
  return {
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    tables_count: Number(r.tables_count ?? 0),
    pits_count: Number(r.pits_count ?? 0),
    tables_with_opening_snapshot: Number(r.tables_with_opening_snapshot ?? 0),
    tables_with_closing_snapshot: Number(r.tables_with_closing_snapshot ?? 0),
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
    win_loss_inventory_total_cents: Number(
      r.win_loss_inventory_total_cents ?? 0,
    ),
    win_loss_estimated_total_cents: Number(
      r.win_loss_estimated_total_cents ?? 0,
    ),
  };
}
