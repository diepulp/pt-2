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
