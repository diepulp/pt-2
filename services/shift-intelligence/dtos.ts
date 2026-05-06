/**
 * ShiftIntelligenceService DTOs (PRD-055)
 * Pattern A: Contract-First — manual interfaces for baseline and anomaly alert contracts.
 *
 * ── Phase 1.2B-A Canonicalization (PRD-074 WS2_SHIFT_INTEL) ─────────────────
 * Financial metric fields on `AnomalyAlertDTO` and `ShiftAlertDTO` are promoted
 * to `FinancialValue | null` via `resolveShiftMetricAuthority`. Both DTOs are
 * now discriminated unions on `metricType`. `hold_percent` retains bare
 * `number | null` at every layer (DEF-NEVER — permanently a bare ratio, never
 * wrapped). Outbound Zod schemas added to `schemas.ts`, lifting DEF-007 waiver.
 *
 * `hold_percent` is permanently a bare ratio — never wrapped.
 * `cash_obs_total` authority/source is fixed at
 * `estimated / pit_cash_observation.extrapolated`.
 */

import type { FinancialValue } from '@/types/financial';

// ── Enums ────────────────────────────────────────────────────────────────────

export type FinancialMetricType =
  | 'drop_total'
  | 'win_loss_cents'
  | 'cash_obs_total';

export type MetricType = FinancialMetricType | 'hold_percent';

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

// ── AnomalyAlertDTO: discriminated union on metricType ───────────────────────

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: financial metric anomaly (FinancialValue fields)
export interface FinancialAnomalyAlertDTO {
  tableId: string;
  tableLabel: string;
  metricType: FinancialMetricType;
  readinessState: ReadinessState;
  observedValue: FinancialValue | null;
  baselineMedian: FinancialValue | null;
  baselineMad: FinancialValue | null;
  deviationScore: number | null;
  isAnomaly: boolean;
  severity: AlertSeverity | null;
  direction: DeviationDirection | null;
  thresholdValue: FinancialValue | null;
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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response: ratio metric anomaly (hold_percent carve-out, DEF-NEVER)
export interface RatioAnomalyAlertDTO {
  tableId: string;
  tableLabel: string;
  metricType: 'hold_percent';
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
  sessionCount: number | null;
  peakDeviation: number | null;
  recommendedAction: string | null;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- discriminated union: RPC response not table-derived
export type AnomalyAlertDTO = FinancialAnomalyAlertDTO | RatioAnomalyAlertDTO;

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

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Joined sub-document, not table projection
export interface AlertAcknowledgmentDTO {
  acknowledgedBy: string;
  acknowledgedByName: string | null;
  notes: string | null;
  isFalsePositive: boolean;
  createdAt: string;
}

// ── ShiftAlertDTO: discriminated union on metricType ─────────────────────────

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Persistent alert: financial metric with FinancialValue fields
export interface FinancialShiftAlertDTO {
  id: string;
  tableId: string;
  tableLabel: string;
  metricType: FinancialMetricType;
  gamingDay: string;
  status: AlertStatus;
  severity: 'low' | 'medium' | 'high';
  observedValue: FinancialValue | null;
  baselineMedian: FinancialValue | null;
  baselineMad: FinancialValue | null;
  deviationScore: number | null;
  direction: DeviationDirection | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgment: AlertAcknowledgmentDTO | null;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Persistent alert: ratio metric (hold_percent carve-out, DEF-NEVER)
export interface RatioShiftAlertDTO {
  id: string;
  tableId: string;
  tableLabel: string;
  metricType: 'hold_percent';
  gamingDay: string;
  status: AlertStatus;
  severity: 'low' | 'medium' | 'high';
  observedValue: number | null;
  baselineMedian: number | null;
  baselineMad: number | null;
  deviationScore: number | null;
  direction: DeviationDirection | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgment: AlertAcknowledgmentDTO | null;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- discriminated union: RPC response not table-derived
export type ShiftAlertDTO = FinancialShiftAlertDTO | RatioShiftAlertDTO;

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
