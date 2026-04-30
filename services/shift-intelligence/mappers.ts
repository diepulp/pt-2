/**
 * ShiftIntelligenceService Mappers (PRD-055)
 * RPC return rows → camelCase DTOs.
 *
 * ── Phase 1.2B-A Canonicalization (PRD-074 WS2_SHIFT_INTEL) ─────────────────
 * Financial metric fields are constructed as FinancialValue via
 * resolveShiftMetricAuthority. hold_percent retains bare number | null.
 * Outbound schema parse calls validate mapper output at the service boundary.
 */
import { financialValueSchema } from '@/lib/financial/schema';
import type { Database } from '@/types/database.types';
import type { FinancialAuthority } from '@/types/financial';

import type {
  AcknowledgeAlertResultDTO,
  AlertAcknowledgmentDTO,
  AlertQualityDTO,
  AlertSeverity,
  AlertStatus,
  AnomalyAlertDTO,
  BaselineComputeResultDTO,
  DeviationDirection,
  FinancialAnomalyAlertDTO,
  FinancialMetricType,
  FinancialShiftAlertDTO,
  MetricType,
  PersistAlertsResultDTO,
  RatioAnomalyAlertDTO,
  RatioShiftAlertDTO,
  ReadinessState,
  ShiftAlertDTO,
} from './dtos';
import { anomalyAlertDTOSchema, shiftAlertDTOSchema } from './schemas';

type ComputeRow =
  Database['public']['Functions']['rpc_compute_rolling_baseline']['Returns'][number];

type AlertRow =
  Database['public']['Functions']['rpc_get_anomaly_alerts']['Returns'][number];

// ── Frozen routing rules (WS7A, EXEC-070). DO NOT re-derive. ────────────────

export function resolveShiftMetricAuthority(
  metricType: MetricType,
): { type: FinancialAuthority; source: string } | null {
  switch (metricType) {
    case 'drop_total':
      return { type: 'estimated', source: 'table_session.drop' };
    case 'win_loss_cents':
      return { type: 'estimated', source: 'table_session.inventory_win' };
    case 'cash_obs_total':
      return { type: 'estimated', source: 'pit_cash_observation.extrapolated' };
    case 'hold_percent':
      return null; // bare ratio — never wrapped
    default: {
      const _exhaustive: never = metricType;
      throw new Error(`Unhandled MetricType: ${String(_exhaustive)}`);
    }
  }
}

export function mapComputeResult(row: ComputeRow): BaselineComputeResultDTO {
  return {
    tablesProcessed: row.tables_processed,
    metricsComputed: row.metrics_computed,
    gamingDay: row.gaming_day,
  };
}

export function mapAnomalyAlertRow(row: AlertRow): AnomalyAlertDTO {
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
  const metricType = row.metric_type as MetricType;
  const authority = resolveShiftMetricAuthority(metricType);

  const base = {
    tableId: row.table_id,
    tableLabel: row.table_label,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC text column → union type
    readinessState: row.readiness_state as ReadinessState,
    deviationScore: row.deviation_score,
    isAnomaly: row.is_anomaly,

    severity: row.severity as AlertSeverity | null,

    direction: row.direction as DeviationDirection | null,
    baselineGamingDay: row.baseline_gaming_day,
    baselineSampleCount: row.baseline_sample_count,
    message: row.message,
    sessionCount: row.session_count ?? null,
    peakDeviation: row.peak_deviation ?? null,
    recommendedAction: row.recommended_action ?? null,
  };

  let dto: AnomalyAlertDTO;
  if (authority !== null) {
    const buildFV = (v: number | null) =>
      v != null
        ? financialValueSchema.parse({
            value: v,
            type: authority.type,
            source: authority.source,
            completeness: { status: 'complete' },
          })
        : null;
    const financialDto: FinancialAnomalyAlertDTO = {
      ...base,
      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- authority non-null ↔ FinancialMetricType
      metricType: metricType as FinancialMetricType,
      observedValue: buildFV(row.observed_value),
      baselineMedian: buildFV(row.baseline_median),
      baselineMad: buildFV(row.baseline_mad),
      thresholdValue: buildFV(row.threshold_value),
    };
    anomalyAlertDTOSchema.parse(financialDto);
    dto = financialDto;
  } else {
    const ratioDto: RatioAnomalyAlertDTO = {
      ...base,
      metricType: 'hold_percent',
      observedValue: row.observed_value,
      baselineMedian: row.baseline_median,
      baselineMad: row.baseline_mad,
      thresholdValue: row.threshold_value,
    };
    anomalyAlertDTOSchema.parse(ratioDto);
    dto = ratioDto;
  }

  return dto;
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
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB text column → union type
  const metricType = row.metric_type as MetricType;
  const authority = resolveShiftMetricAuthority(metricType);
  const ack = row.alert_acknowledgment?.[0] ?? null;

  const base = {
    id: row.id,
    tableId: row.table_id,
    tableLabel: '', // Populated by caller via gaming_table join
    gamingDay: row.gaming_day,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB text column → union type
    status: row.status as AlertStatus,
    severity: row.severity as 'low' | 'medium' | 'high',
    deviationScore: row.deviation_score,

    direction: row.direction as DeviationDirection | null,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgment: ack ? mapAcknowledgmentRow(ack) : null,
  };

  let dto: ShiftAlertDTO;
  if (authority !== null) {
    const buildFV = (v: number | null) =>
      v != null
        ? financialValueSchema.parse({
            value: v,
            type: authority.type,
            source: authority.source,
            completeness: { status: 'complete' },
          })
        : null;
    const financialDto: FinancialShiftAlertDTO = {
      ...base,
      // eslint-disable-next-line custom-rules/no-dto-type-assertions -- authority non-null ↔ FinancialMetricType
      metricType: metricType as FinancialMetricType,
      observedValue: buildFV(row.observed_value),
      baselineMedian: buildFV(row.baseline_median),
      baselineMad: buildFV(row.baseline_mad),
    };
    shiftAlertDTOSchema.parse(financialDto);
    dto = financialDto;
  } else {
    const ratioDto: RatioShiftAlertDTO = {
      ...base,
      metricType: 'hold_percent',
      observedValue: row.observed_value,
      baselineMedian: row.baseline_median,
      baselineMad: row.baseline_mad,
    };
    shiftAlertDTOSchema.parse(ratioDto);
    dto = ratioDto;
  }

  return dto;
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
