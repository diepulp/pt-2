/**
 * ShiftIntelligenceService Zod Schemas (PRD-055)
 * Validates API request payloads for baseline compute and anomaly alert endpoints.
 */
import { z } from 'zod';

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
