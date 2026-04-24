/**
 * ShiftIntelligenceService Zod Schemas (PRD-055)
 * Validates API request payloads for baseline compute and anomaly alert endpoints.
 *
 * ── Phase 1.1 Outbound-Schema Waiver (PRD-070 WS7A) ──────────────────────────
 * This file intentionally remains **request-only** in Phase 1.1. No outbound
 * (response) Zod schemas for `AnomalyAlertDTO`, `BaselineDTO`, `ShiftAlertDTO`,
 * or related envelopes are added in this phase.
 *
 * Per docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md
 * and docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md
 * § Planning Lock Resolution, GATE-070.6 deferred public shift-intelligence DTO
 * field-shape changes to Phase 1.2 because those fields already cross live
 * HTTP/UI boundaries and introducing outbound schema validation in this phase
 * would entangle the internal authority-routing work (WS7B) with the deferred
 * public-shape decisions.
 *
 * Reopen trigger: if leadership explicitly reopens a Phase 1.1 public
 * shift-intelligence exception slice, outbound schema work must return in an
 * amended EXEC-SPEC with explicit service/route/UI ownership — not as
 * incidental mapper churn in this file.
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
