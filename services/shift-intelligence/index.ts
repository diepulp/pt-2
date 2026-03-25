/**
 * ShiftIntelligenceService Factory (PRD-055 + PRD-056)
 *
 * Bounded context: Shift anomaly detection — rolling baselines, persistent alerts, acknowledgment.
 * Owns: table_metric_baseline, shift_alert, alert_acknowledgment
 * RPCs: rpc_compute_rolling_baseline (DEFINER), rpc_get_anomaly_alerts (INVOKER),
 *       rpc_persist_anomaly_alerts (DEFINER), rpc_acknowledge_alert (DEFINER)
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  acknowledgeAlert,
  getAlertQuality,
  getAlerts,
  persistAlerts,
} from './alerts';
import { getAnomalyAlerts } from './anomaly';
import { computeBaselines } from './baseline';
import type {
  AcknowledgeAlertInput,
  AcknowledgeAlertResultDTO,
  AlertQualityDTO,
  AlertsQuery,
  AnomalyAlertsQuery,
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  ComputeBaselineInput,
  PersistAlertsInput,
  PersistAlertsResultDTO,
  ShiftAlertDTO,
} from './dtos';

// ── Service Interface ────────────────────────────────────────────────────────

export interface ShiftIntelligenceServiceInterface {
  computeBaselines(
    input?: ComputeBaselineInput,
  ): Promise<BaselineComputeResultDTO>;

  getAnomalyAlerts(
    query: AnomalyAlertsQuery,
  ): Promise<AnomalyAlertsResponseDTO>;

  persistAlerts(input?: PersistAlertsInput): Promise<PersistAlertsResultDTO>;

  acknowledgeAlert(
    input: AcknowledgeAlertInput,
  ): Promise<AcknowledgeAlertResultDTO>;

  getAlerts(query: AlertsQuery): Promise<ShiftAlertDTO[]>;

  getAlertQuality(startDate: string, endDate: string): Promise<AlertQualityDTO>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createShiftIntelligenceService(
  supabase: SupabaseClient<Database>,
): ShiftIntelligenceServiceInterface {
  return {
    computeBaselines: (input) => computeBaselines(supabase, input),
    getAnomalyAlerts: (query) => getAnomalyAlerts(supabase, query),
    persistAlerts: (input) => persistAlerts(supabase, input),
    acknowledgeAlert: (input) => acknowledgeAlert(supabase, input),
    getAlerts: (query) => getAlerts(supabase, query),
    getAlertQuality: (startDate, endDate) =>
      getAlertQuality(supabase, startDate, endDate),
  };
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export type {
  AcknowledgeAlertInput,
  AcknowledgeAlertResultDTO,
  AlertAcknowledgmentDTO,
  AlertQualityDTO,
  AlertSeverity,
  AlertStatus,
  AlertsQuery,
  AnomalyAlertDTO,
  AnomalyAlertsQuery,
  AnomalyAlertsResponseDTO,
  BaselineComputeResultDTO,
  BaselineCoverageDTO,
  BaselineDTO,
  ComputeBaselineInput,
  DeviationDirection,
  MetricType,
  PersistAlertsInput,
  PersistAlertsResultDTO,
  ReadinessState,
  ShiftAlertDTO,
} from './dtos';

export { shiftIntelligenceKeys } from './keys';

export {
  fetchAcknowledgeAlert,
  fetchAlertQuality,
  fetchAlerts,
  fetchAnomalyAlerts,
  fetchComputeBaselines,
  fetchPersistAlerts,
} from './http';
