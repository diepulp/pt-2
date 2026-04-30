/**
 * ShiftIntelligenceService Zod Schemas (PRD-055)
 * Validates API request payloads for baseline compute and anomaly alert endpoints.
 *
 * ── Phase 1.2B-A Outbound Schemas (PRD-074 WS2_SHIFT_INTEL) ─────────────────
 * DEF-007 waiver lifted. Outbound schemas for `AnomalyAlertDTO` and
 * `ShiftAlertDTO` are now active. These schemas validate mapper output at the
 * service boundary via parse calls at the end of each mapper. Route handlers
 * remain pass-through and do not call these schemas.
 */
import { z } from 'zod';

import { financialValueSchema } from '@/lib/financial/schema';

/** POST /api/shift-intelligence/compute-baselines request body */
export const computeBaselineInputSchema = z.object({
  gaming_day: z.string().date().optional(),
  table_id: z.string().uuid().optional(),
});

/** GET /api/shift-intelligence/anomaly-alerts query params */
export const anomalyAlertsQuerySchema = z
  .object({
    window_start: z.string().datetime(),
    window_end: z.string().datetime(),
  })
  .refine((data) => new Date(data.window_end) > new Date(data.window_start), {
    message: 'window_end must be after window_start',
    path: ['window_end'],
  });

export type ComputeBaselineRequestBody = z.infer<
  typeof computeBaselineInputSchema
>;
export type AnomalyAlertsQueryParams = z.infer<typeof anomalyAlertsQuerySchema>;

// ── PRD-056 Alert Maturity Schemas ──────────────────────────────────────────

/** POST /api/v1/shift-intelligence/persist-alerts request body */
export const persistAlertsInputSchema = z.object({
  gaming_day: z.string().date().optional(),
});

/** POST /api/v1/shift-intelligence/acknowledge-alert request body */
export const acknowledgeAlertSchema = z.object({
  alert_id: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  is_false_positive: z.boolean().optional(),
});

/** GET /api/v1/shift-intelligence/alerts query params */
export const alertsQuerySchema = z.object({
  gaming_day: z.string().date(),
  status: z.enum(['open', 'acknowledged']).optional(),
});

export type PersistAlertsRequestBody = z.infer<typeof persistAlertsInputSchema>;
export type AcknowledgeAlertRequestBody = z.infer<
  typeof acknowledgeAlertSchema
>;
export type AlertsQueryParams = z.infer<typeof alertsQuerySchema>;

// ── Phase 1.2B-A Outbound Schemas (PRD-074 WS2_SHIFT_INTEL) ─────────────────
// DEF-007 waiver lifted. Parse calls at the end of mapAnomalyAlertRow and
// mapShiftAlertRow validate the constructed DTO shape at the service boundary.

const financialMetricTypeSchema = z.enum([
  'drop_total',
  'win_loss_cents',
  'cash_obs_total',
]);

const alertBaseSchema = z.object({
  tableId: z.string(),
  tableLabel: z.string(),
  readinessState: z.enum([
    'ready',
    'stale',
    'missing',
    'insufficient_data',
    'compute_failed',
  ]),
  deviationScore: z.number().nullable(),
  isAnomaly: z.boolean(),
  severity: z.enum(['info', 'warn', 'critical']).nullable(),
  direction: z.enum(['above', 'below']).nullable(),
  baselineGamingDay: z.string().nullable(),
  baselineSampleCount: z.number().int().nullable(),
  message: z.string(),
  sessionCount: z.number().int().nullable(),
  peakDeviation: z.number().nullable(),
  recommendedAction: z.string().nullable(),
});

export const anomalyAlertDTOSchema = z.union([
  alertBaseSchema.extend({
    metricType: financialMetricTypeSchema,
    observedValue: financialValueSchema.nullable(),
    baselineMedian: financialValueSchema.nullable(),
    baselineMad: financialValueSchema.nullable(),
    thresholdValue: financialValueSchema.nullable(),
  }),
  alertBaseSchema.extend({
    metricType: z.literal('hold_percent'),
    observedValue: z.number().nullable(),
    baselineMedian: z.number().nullable(),
    baselineMad: z.number().nullable(),
    thresholdValue: z.number().nullable(),
  }),
]);

const acknowledgmentSchema = z
  .object({
    acknowledgedBy: z.string(),
    acknowledgedByName: z.string().nullable(),
    notes: z.string().nullable(),
    isFalsePositive: z.boolean(),
    createdAt: z.string(),
  })
  .nullable();

const shiftAlertBaseSchema = z.object({
  id: z.string().uuid(),
  tableId: z.string(),
  tableLabel: z.string(),
  gamingDay: z.string(),
  status: z.enum(['open', 'acknowledged', 'resolved']),
  severity: z.enum(['low', 'medium', 'high']),
  deviationScore: z.number().nullable(),
  direction: z.enum(['above', 'below']).nullable(),
  message: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  acknowledgment: acknowledgmentSchema,
});

export const shiftAlertDTOSchema = z.union([
  shiftAlertBaseSchema.extend({
    metricType: financialMetricTypeSchema,
    observedValue: financialValueSchema.nullable(),
    baselineMedian: financialValueSchema.nullable(),
    baselineMad: financialValueSchema.nullable(),
  }),
  shiftAlertBaseSchema.extend({
    metricType: z.literal('hold_percent'),
    observedValue: z.number().nullable(),
    baselineMedian: z.number().nullable(),
    baselineMad: z.number().nullable(),
  }),
]);
