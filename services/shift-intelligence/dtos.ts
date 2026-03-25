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

/** ADR-046 §8 — 5-state readiness model (PRD-056 C-2) */
export type ReadinessState =
  | 'ready'
  | 'stale'
  | 'missing'
  | 'insufficient_data'
  | 'compute_failed';

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
  /** WS8 enrichment: active sessions on this table */
  sessionCount: number | null;
  /** WS8 enrichment: max deviation_score across all metrics for this table */
  peakDeviation: number | null;
  /** WS8 enrichment: 'investigate' | 'monitor' | 'acknowledge' based on severity */
  recommendedAction: string | null;
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

// ── PRD-056 Alert Maturity DTOs ─────────────────────────────────────────────

/** Forward-only state machine: open → acknowledged → resolved (resolved is type-only, no UI/transition ships) */
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Persistent alert with joined acknowledgment, not a table projection
export interface ShiftAlertDTO {
  id: string;
  tableId: string;
  tableLabel: string;
  metricType: MetricType;
  gamingDay: string;
  status: AlertStatus;
  severity: 'low' | 'medium' | 'high';
  observedValue: number;
  baselineMedian: number | null;
  baselineMad: number | null;
  deviationScore: number | null;
  direction: DeviationDirection | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgment: AlertAcknowledgmentDTO | null;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Joined sub-document, not table projection
export interface AlertAcknowledgmentDTO {
  acknowledgedBy: string;
  acknowledgedByName: string | null;
  notes: string | null;
  isFalsePositive: boolean;
  createdAt: string;
}

export interface PersistAlertsInput {
  gaming_day?: string;
}

export interface AcknowledgeAlertInput {
  alert_id: string;
  notes?: string;
  is_false_positive?: boolean;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC jsonb result envelope
export interface PersistAlertsResultDTO {
  persistedCount: number;
  suppressedCount: number;
  gamingDay: string;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC jsonb result envelope
export interface AcknowledgeAlertResultDTO {
  alertId: string;
  status: AlertStatus;
  acknowledgedBy: string;
  alreadyAcknowledged: boolean;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Computed aggregate for alert quality telemetry
export interface AlertQualityDTO {
  totalAlerts: number;
  acknowledgedCount: number;
  falsePositiveCount: number;
  medianAcknowledgeLatencyMs: number | null;
  period: { start: string; end: string };
}

export interface AlertsQuery {
  gaming_day: string;
  status?: 'open' | 'acknowledged';
}
