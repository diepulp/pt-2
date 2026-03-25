/**
 * ShiftIntelligenceService Mappers (PRD-055)
 * RPC return rows → camelCase DTOs.
 */
import type { Database } from '@/types/database.types';

import type {
  AcknowledgeAlertResultDTO,
  AlertAcknowledgmentDTO,
  AlertQualityDTO,
  AlertSeverity,
  AlertStatus,
  AnomalyAlertDTO,
  BaselineComputeResultDTO,
  DeviationDirection,
  MetricType,
  PersistAlertsResultDTO,
  ReadinessState,
  ShiftAlertDTO,
} from './dtos';

type ComputeRow =
  Database['public']['Functions']['rpc_compute_rolling_baseline']['Returns'][number];

type AlertRow =
  Database['public']['Functions']['rpc_get_anomaly_alerts']['Returns'][number];

export function mapComputeResult(row: ComputeRow): BaselineComputeResultDTO {
  return {
    tablesProcessed: row.tables_processed,
    metricsComputed: row.metrics_computed,
    gamingDay: row.gaming_day,
  };
}

export function mapAnomalyAlertRow(row: AlertRow): AnomalyAlertDTO {
  return {
    tableId: row.table_id,
    tableLabel: row.table_label,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
    metricType: row.metric_type as MetricType,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
    readinessState: row.readiness_state as ReadinessState,
    observedValue: row.observed_value,
    baselineMedian: row.baseline_median,
    baselineMad: row.baseline_mad,
    deviationScore: row.deviation_score,
    isAnomaly: row.is_anomaly,
    severity: row.severity as AlertSeverity | null,
    direction: row.direction as DeviationDirection | null,
    thresholdValue: row.threshold_value,
    baselineGamingDay: row.baseline_gaming_day,
    baselineSampleCount: row.baseline_sample_count,
    message: row.message,
    sessionCount: row.session_count ?? null,
    peakDeviation: row.peak_deviation ?? null,
    recommendedAction: row.recommended_action ?? null,
  };
}

// ── PRD-056 Alert Maturity Mappers ──────────────────────────────────────────

type ShiftAlertRow = Database['public']['Tables']['shift_alert']['Row'];

type AlertAckRow = Database['public']['Tables']['alert_acknowledgment']['Row'];

/** Map a shift_alert row + optional acknowledgment join to ShiftAlertDTO */
export function mapShiftAlertRow(
  row: ShiftAlertRow & {
    alert_acknowledgment?:
      | (AlertAckRow & { staff_name?: string | null })[]
      | null;
  },
): ShiftAlertDTO {
  const ack = row.alert_acknowledgment?.[0] ?? null;
  return {
    id: row.id,
    tableId: row.table_id,
    tableLabel: '', // Populated by caller via gaming_table join
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB text column → union type
    metricType: row.metric_type as MetricType,
    gamingDay: row.gaming_day,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB text column → union type
    status: row.status as AlertStatus,

    severity: row.severity as 'low' | 'medium' | 'high',
    observedValue: row.observed_value,
    baselineMedian: row.baseline_median,
    baselineMad: row.baseline_mad,
    deviationScore: row.deviation_score,
    direction: row.direction as DeviationDirection | null,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgment: ack ? mapAcknowledgmentRow(ack) : null,
  };
}

export function mapAcknowledgmentRow(
  row: AlertAckRow & { staff_name?: string | null },
): AlertAcknowledgmentDTO {
  return {
    acknowledgedBy: row.acknowledged_by,
    acknowledgedByName: row.staff_name ?? null,
    notes: row.notes,
    isFalsePositive: row.is_false_positive,
    createdAt: row.created_at,
  };
}

/** Map RPC jsonb → PersistAlertsResultDTO */
export function mapPersistResult(
  data: Record<string, unknown>,
): PersistAlertsResultDTO {
  return {
    persistedCount: (data.persisted_count as number) ?? 0,
    suppressedCount: (data.suppressed_count as number) ?? 0,
    gamingDay: (data.gaming_day as string) ?? '',
  };
}

/** Map RPC jsonb → AcknowledgeAlertResultDTO */
export function mapAcknowledgeResult(
  data: Record<string, unknown>,
): AcknowledgeAlertResultDTO {
  return {
    alertId: data.alert_id as string,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC jsonb text → union type
    status: data.status as AlertStatus,
    acknowledgedBy: data.acknowledged_by as string,
    alreadyAcknowledged: (data.already_acknowledged as boolean) ?? false,
  };
}

/** Map RPC jsonb → AlertQualityDTO */
export function mapAlertQualityResult(
  data: Record<string, unknown>,
  period: { start: string; end: string },
): AlertQualityDTO {
  return {
    totalAlerts: (data.total_alerts as number) ?? 0,
    acknowledgedCount: (data.acknowledged_count as number) ?? 0,
    falsePositiveCount: (data.false_positive_count as number) ?? 0,
    medianAcknowledgeLatencyMs:
      (data.median_acknowledge_latency_ms as number) ?? null,
    period,
  };
}
