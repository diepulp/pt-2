/**
 * Shift Metrics Zod Schemas
 *
 * Request validation schemas for shift metrics API endpoints.
 * All timestamps must be ISO 8601 format.
 *
 * @see ADR-013 Zod Validation Schemas
 * @see PRD-Shift-Dashboards-v0.2
 */

import { z } from 'zod';

/**
 * ISO timestamp string validation.
 * Accepts ISO 8601 format timestamps.
 */
const isoTimestamp = z
  .string()
  .datetime({ message: 'Must be a valid ISO 8601 timestamp' });

/**
 * Base time window object schema (without refinement for extension).
 */
const baseTimeWindowSchema = z.object({
  start: isoTimestamp.describe('Window start timestamp (ISO 8601)'),
  end: isoTimestamp.describe('Window end timestamp (ISO 8601)'),
});

/**
 * Refinement: end must be after start.
 */
const timeWindowRefinement = (data: { start: string; end: string }) =>
  new Date(data.end) > new Date(data.start);

/**
 * Base time window schema for all shift metrics queries.
 */
export const shiftMetricsTimeWindowSchema = baseTimeWindowSchema.refine(
  timeWindowRefinement,
  {
    message: 'end must be after start',
    path: ['end'],
  },
);

/**
 * Query params schema for table metrics endpoint.
 * GET /api/v1/shift-dashboards/metrics/tables?start=ISO&end=ISO
 */
export const shiftTableMetricsQuerySchema = shiftMetricsTimeWindowSchema;

/**
 * Query params schema for pit metrics endpoint.
 * GET /api/v1/shift-dashboards/metrics/pits?start=ISO&end=ISO&pit_id=string?
 * pit_id is optional - omit for all pits.
 */
export const shiftPitMetricsQuerySchema = baseTimeWindowSchema
  .extend({
    pit_id: z.string().min(1).optional().describe('Optional pit identifier'),
  })
  .refine(timeWindowRefinement, {
    message: 'end must be after start',
    path: ['end'],
  });

/**
 * Query params schema for casino metrics endpoint.
 * GET /api/v1/shift-dashboards/metrics/casino?start=ISO&end=ISO
 */
export const shiftCasinoMetricsQuerySchema = shiftMetricsTimeWindowSchema;

// === Cash Observation Query Schemas ===

/**
 * Query params schema for cash observations tables endpoint.
 * GET /api/v1/shift-dashboards/cash-observations/tables?start=ISO&end=ISO&table_id=uuid?
 */
export const cashObsTablesQuerySchema = baseTimeWindowSchema
  .extend({
    table_id: z
      .string()
      .uuid()
      .optional()
      .describe('Optional table UUID filter'),
  })
  .refine(timeWindowRefinement, {
    message: 'end must be after start',
    path: ['end'],
  });

/**
 * Query params schema for cash observations pits endpoint.
 * GET /api/v1/shift-dashboards/cash-observations/pits?start=ISO&end=ISO&pit=string?
 */
export const cashObsPitsQuerySchema = baseTimeWindowSchema
  .extend({
    pit: z
      .string()
      .min(1)
      .optional()
      .describe('Optional pit identifier filter'),
  })
  .refine(timeWindowRefinement, {
    message: 'end must be after start',
    path: ['end'],
  });

/**
 * Query params schema for cash observations casino endpoint.
 * GET /api/v1/shift-dashboards/cash-observations/casino?start=ISO&end=ISO
 */
export const cashObsCasinoQuerySchema = shiftMetricsTimeWindowSchema;

/**
 * Query params schema for cash observations alerts endpoint.
 * GET /api/v1/shift-dashboards/cash-observations/alerts?start=ISO&end=ISO
 */
export const cashObsAlertsQuerySchema = shiftMetricsTimeWindowSchema;

/**
 * Query params schema for consolidated cash observations summary endpoint.
 * GET /api/v1/shift-dashboards/cash-observations/summary?start=ISO&end=ISO
 * PERF: Reduces 4 HTTP calls to 1.
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
 */
export const cashObsSummaryQuerySchema = shiftMetricsTimeWindowSchema;

// === Type Exports ===

export type ShiftTableMetricsQuery = z.infer<
  typeof shiftTableMetricsQuerySchema
>;
export type ShiftPitMetricsQuery = z.infer<typeof shiftPitMetricsQuerySchema>;
export type ShiftCasinoMetricsQuery = z.infer<
  typeof shiftCasinoMetricsQuerySchema
>;
export type CashObsTablesQuery = z.infer<typeof cashObsTablesQuerySchema>;
export type CashObsPitsQuery = z.infer<typeof cashObsPitsQuerySchema>;
export type CashObsCasinoQuery = z.infer<typeof cashObsCasinoQuerySchema>;
export type CashObsAlertsQuery = z.infer<typeof cashObsAlertsQuerySchema>;
export type CashObsSummaryQuery = z.infer<typeof cashObsSummaryQuerySchema>;
