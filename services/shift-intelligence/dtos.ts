/**
 * ShiftIntelligenceService DTOs (PRD-055)
 * Pattern A: Contract-First — manual interfaces for baseline and anomaly alert contracts.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type MetricType =
  | 'drop_total'
  | 'hold_percent'
  | 'cash_obs_total'
  | 'win_loss_cents';

/** ADR-046 §8 — compute_failed deferred to Phase C-2 */
export type ReadinessState =
  | 'ready'
  | 'stale'
  | 'missing'
  | 'insufficient_data';

export type AlertSeverity = 'info' | 'warn' | 'critical';

export type DeviationDirection = 'above' | 'below';

// ── Output DTOs ──────────────────────────────────────────────────────────────

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: computed aggregate, not table projection
export interface BaselineDTO {
  tableId: string;
  tableLabel: string;
  metricType: MetricType;
  gamingDay: string;
  medianValue: number;
  madValue: number;
  sampleCount: number;
  minValue: number | null;
  maxValue: number | null;
  computedAt: string;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: anomaly evaluation with computed fields
export interface AnomalyAlertDTO {
  tableId: string;
  tableLabel: string;
  metricType: MetricType;
  readinessState: ReadinessState;
  observedValue: number | null;
  baselineMedian: number | null;
  baselineMad: number | null;
  deviationScore: number | null;
  isAnomaly: boolean;
  severity: AlertSeverity | null;
  direction: DeviationDirection | null;
  thresholdValue: number | null;
  baselineGamingDay: string | null;
  baselineSampleCount: number | null;
  message: string;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: computation summary
export interface BaselineComputeResultDTO {
  tablesProcessed: number;
  metricsComputed: number;
  gamingDay: string;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Composite response field, not table-derived
export interface BaselineCoverageDTO {
  withBaseline: number;
  withoutBaseline: number;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Composite response envelope
export interface AnomalyAlertsResponseDTO {
  alerts: AnomalyAlertDTO[];
  baselineGamingDay: string;
  baselineCoverage: BaselineCoverageDTO;
}

// ── Input DTOs ───────────────────────────────────────────────────────────────

export interface ComputeBaselineInput {
  gaming_day?: string;
  table_id?: string;
}

export interface AnomalyAlertsQuery {
  window_start: string;
  window_end: string;
}
