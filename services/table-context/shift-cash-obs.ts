/**
 * Shift Cash Observation Rollup Queries
 *
 * TELEMETRY-ONLY: These functions return observational aggregates,
 * NOT authoritative Drop/Win/Hold metrics.
 *
 * @see PRD-SHIFT-DASHBOARDS-v0.2 PATCH
 * @see SHIFT_METRICS_CATALOG §3.7
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsSpikeAlertDTO,
  CashObsSummaryDTO,
  CashObsTableRollupDTO,
  ShiftCashObsPitParams,
  ShiftCashObsTableParams,
  ShiftCashObsTimeWindow,
} from './dtos';
import {
  computeAlertSeverity,
  getWorstQuality,
  isAllowedAlertKind,
} from './shift-cash-obs/severity';
import type { TelemetryQuality } from './shift-cash-obs/severity';

/**
 * Get table-level cash observation rollups for a shift window.
 * Only includes observations linked to a rating slip (has table context).
 */
export async function getShiftCashObsTable(
  supabase: SupabaseClient<Database>,
  params: ShiftCashObsTableParams,
): Promise<CashObsTableRollupDTO[]> {
  const { data, error } = await supabase.rpc('rpc_shift_cash_obs_table', {
    p_start_ts: params.startTs,
    p_end_ts: params.endTs,
    p_table_id: params.tableId ?? undefined,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch table cash observation rollups: ${error.message}`,
      { details: error },
    );
  }

  return ((data as unknown[]) ?? []).map(toCashObsTableRollup);
}

/**
 * Get pit-level cash observation rollups for a shift window.
 */
export async function getShiftCashObsPit(
  supabase: SupabaseClient<Database>,
  params: ShiftCashObsPitParams,
): Promise<CashObsPitRollupDTO[]> {
  const { data, error } = await supabase.rpc('rpc_shift_cash_obs_pit', {
    p_start_ts: params.startTs,
    p_end_ts: params.endTs,
    p_pit: params.pit ?? undefined,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch pit cash observation rollups: ${error.message}`,
      { details: error },
    );
  }

  return ((data as unknown[]) ?? []).map(toCashObsPitRollup);
}

/**
 * Get casino-level cash observation rollups for a shift window.
 * Includes ALL observations (even those without rating slip link).
 */
export async function getShiftCashObsCasino(
  supabase: SupabaseClient<Database>,
  params: ShiftCashObsTimeWindow,
): Promise<CashObsCasinoRollupDTO> {
  const { data, error } = await supabase.rpc('rpc_shift_cash_obs_casino', {
    p_start_ts: params.startTs,
    p_end_ts: params.endTs,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch casino cash observation rollups: ${error.message}`,
      { details: error },
    );
  }

  // RPC returns single row; default if no observations
  const dataArray = data as unknown[];
  const row = Array.isArray(dataArray) ? dataArray[0] : data;
  return toCashObsCasinoRollup(row);
}

/**
 * Get cash observation spike alerts for a shift window.
 * Returns alerts where observed totals exceed configured thresholds.
 */
export async function getShiftCashObsAlerts(
  supabase: SupabaseClient<Database>,
  params: ShiftCashObsTimeWindow,
): Promise<CashObsSpikeAlertDTO[]> {
  const { data, error } = await supabase.rpc('rpc_shift_cash_obs_alerts', {
    p_start_ts: params.startTs,
    p_end_ts: params.endTs,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch cash observation alerts: ${error.message}`,
      { details: error },
    );
  }

  return ((data as unknown[]) ?? []).map(toCashObsSpikeAlert);
}

// === Mappers ===

function toCashObsTableRollup(row: unknown): CashObsTableRollupDTO {
  const r = row as Record<string, unknown>;
  return {
    table_id: r.table_id as string,
    table_label: r.table_label as string,
    pit: (r.pit as string) ?? null,
    cash_out_observed_estimate_total: Number(
      r.cash_out_observed_estimate_total ?? 0,
    ),
    cash_out_observed_confirmed_total: Number(
      r.cash_out_observed_confirmed_total ?? 0,
    ),
    cash_out_observation_count: Number(r.cash_out_observation_count ?? 0),
    cash_out_last_observed_at: (r.cash_out_last_observed_at as string) ?? null,
  };
}

function toCashObsPitRollup(row: unknown): CashObsPitRollupDTO {
  const r = row as Record<string, unknown>;
  return {
    pit: r.pit as string,
    cash_out_observed_estimate_total: Number(
      r.cash_out_observed_estimate_total ?? 0,
    ),
    cash_out_observed_confirmed_total: Number(
      r.cash_out_observed_confirmed_total ?? 0,
    ),
    cash_out_observation_count: Number(r.cash_out_observation_count ?? 0),
    cash_out_last_observed_at: (r.cash_out_last_observed_at as string) ?? null,
  };
}

function toCashObsCasinoRollup(row: unknown): CashObsCasinoRollupDTO {
  if (!row) {
    return {
      cash_out_observed_estimate_total: 0,
      cash_out_observed_confirmed_total: 0,
      cash_out_observation_count: 0,
      cash_out_last_observed_at: null,
    };
  }
  const r = row as Record<string, unknown>;
  return {
    cash_out_observed_estimate_total: Number(
      r.cash_out_observed_estimate_total ?? 0,
    ),
    cash_out_observed_confirmed_total: Number(
      r.cash_out_observed_confirmed_total ?? 0,
    ),
    cash_out_observation_count: Number(r.cash_out_observation_count ?? 0),
    cash_out_last_observed_at: (r.cash_out_last_observed_at as string) ?? null,
  };
}

function toCashObsSpikeAlert(row: unknown): CashObsSpikeAlertDTO {
  const r = row as Record<string, unknown>;
  return {
    alert_type: 'cash_out_observed_spike_telemetry',
    severity: r.severity as 'info' | 'warn' | 'critical',
    entity_type: r.entity_type as 'table' | 'pit',
    entity_id: r.entity_id as string,
    entity_label: r.entity_label as string,
    observed_value: Number(r.observed_value ?? 0),
    threshold: Number(r.threshold ?? 0),
    message: r.message as string,
    is_telemetry: true,
  };
}

// === BFF Consolidated Function (PERF-001) ===

/**
 * Get consolidated cash observation summary.
 * PERF: Reduces 4 HTTP calls to 1 by fetching all data in parallel.
 *
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
 */
export async function getShiftCashObsSummary(
  supabase: SupabaseClient<Database>,
  params: ShiftCashObsTimeWindow,
): Promise<CashObsSummaryDTO> {
  // Execute all 4 RPC calls in parallel
  const [casino, pits, tables, rawAlerts] = await Promise.all([
    getShiftCashObsCasino(supabase, params),
    getShiftCashObsPit(supabase, params),
    getShiftCashObsTable(supabase, params),
    getShiftCashObsAlerts(supabase, params),
  ]);

  // Apply severity guardrails (WS3: SHIFT_SEVERITY_ALLOWLISTS_v1.md)
  // Build table quality lookup for severity downgrade decisions
  const tableQualityMap = new Map<string, TelemetryQuality>();
  for (const t of tables) {
    // Map telemetry coverage to quality based on observation count
    const quality: TelemetryQuality =
      t.cash_out_observation_count > 0 ? 'GOOD_COVERAGE' : 'NONE';
    tableQualityMap.set(t.table_id, quality);
  }

  // Build pit quality from worst-of constituent tables
  const pitQualityMap = new Map<string, TelemetryQuality>();
  const pitTablesQuality = new Map<string, TelemetryQuality[]>();
  for (const t of tables) {
    if (!t.pit) continue;
    const existing = pitTablesQuality.get(t.pit) ?? [];
    const quality: TelemetryQuality =
      t.cash_out_observation_count > 0 ? 'GOOD_COVERAGE' : 'NONE';
    existing.push(quality);
    pitTablesQuality.set(t.pit, existing);
  }
  for (const [pit, qualities] of pitTablesQuality) {
    pitQualityMap.set(pit, getWorstQuality(qualities));
  }

  // Enrich alerts with severity guardrails
  const alerts: CashObsSpikeAlertDTO[] = rawAlerts
    .filter((a) => isAllowedAlertKind(a.alert_type))
    .map((alert) => {
      const entityQuality =
        alert.entity_type === 'table'
          ? (tableQualityMap.get(alert.entity_id) ?? 'NONE')
          : (pitQualityMap.get(alert.entity_id) ?? 'NONE');

      const result = computeAlertSeverity(alert.severity, entityQuality);

      return {
        ...alert,
        severity: result.severity,
        original_severity: result.original_severity,
        downgraded: result.downgraded,
        downgrade_reason: result.downgrade_reason,
      };
    });

  return {
    casino,
    pits,
    tables,
    alerts,
  };
}
