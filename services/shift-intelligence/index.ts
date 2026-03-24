/**
 * ShiftIntelligenceService Factory (PRD-055)
 *
 * Bounded context: Shift anomaly detection — rolling baselines and adaptive alerts.
 * Owns: table_metric_baseline
 * RPCs: rpc_compute_rolling_baseline (DEFINER), rpc_get_anomaly_alerts (INVOKER)
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { getAnomalyAlerts } from './anomaly';
import { computeBaselines } from './baseline';
import type {
  AnomalyAlertsQuery,
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  ComputeBaselineInput,
} from './dtos';

// ── Service Interface ────────────────────────────────────────────────────────

export interface ShiftIntelligenceServiceInterface {
  computeBaselines(
    input?: ComputeBaselineInput,
  ): Promise<BaselineComputeResultDTO>;

  getAnomalyAlerts(
    query: AnomalyAlertsQuery,
  ): Promise<AnomalyAlertsResponseDTO>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createShiftIntelligenceService(
  supabase: SupabaseClient<Database>,
): ShiftIntelligenceServiceInterface {
  return {
    computeBaselines: (input) => computeBaselines(supabase, input),
    getAnomalyAlerts: (query) => getAnomalyAlerts(supabase, query),
  };
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export type {
  AnomalyAlertDTO,
  AnomalyAlertsQuery,
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  BaselineCoverageDTO,
  BaselineDTO,
  ComputeBaselineInput,
  MetricType,
  ReadinessState,
  AlertSeverity,
  DeviationDirection,
} from './dtos';

export { shiftIntelligenceKeys } from './keys';

export { fetchComputeBaselines, fetchAnomalyAlerts } from './http';
