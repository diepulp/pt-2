/**
 * ShiftIntelligenceService Mappers (PRD-055)
 * RPC return rows → camelCase DTOs.
 */
import type { Database } from '@/types/database.types';

import type {
  AnomalyAlertDTO,
  AlertSeverity,
  BaselineComputeResultDTO,
  DeviationDirection,
  MetricType,
  ReadinessState,
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
  };
}
