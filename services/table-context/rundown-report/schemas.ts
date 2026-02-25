/**
 * Rundown Report Zod Schemas (PRD-038)
 *
 * Validation schemas for rundown report API operations.
 * Schemas stay snake_case to mirror HTTP payloads.
 *
 * @see ADR-013 Zod Validation Schemas
 * @see EXEC-038 WS2 Service Layer
 */

import { z } from 'zod';

// === UUID Format Schema ===

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidFormat = (fieldName = 'ID') =>
  z.string().regex(UUID_REGEX, `Invalid ${fieldName} format`);

// === Mutation Schemas ===

/**
 * Schema for persisting a rundown report.
 * POST /api/v1/rundown-reports
 */
export const persistRundownSchema = z.object({
  table_session_id: uuidFormat('session ID'),
});

/**
 * Schema for finalizing a rundown report.
 * PATCH /api/v1/rundown-reports/[id]/finalize
 */
export const finalizeRundownSchema = z.object({
  // No body required - report ID from URL param
});

// === Query Schemas ===

export const rundownQuerySchema = z.object({
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  gaming_table_id: uuidFormat('table ID').optional(),
});

// === Route Params ===

export const rundownRouteParamsSchema = z.object({
  id: uuidFormat('report ID'),
});

export const rundownSessionRouteParamsSchema = z.object({
  sessionId: uuidFormat('session ID'),
});

// === Transport Type Exports ===

export type PersistRundownRequestBody = z.infer<typeof persistRundownSchema>;
export type FinalizeRundownRequestBody = z.infer<typeof finalizeRundownSchema>;
export type RundownQueryParams = z.infer<typeof rundownQuerySchema>;
export type RundownRouteParams = z.infer<typeof rundownRouteParamsSchema>;
export type RundownSessionRouteParams = z.infer<
  typeof rundownSessionRouteParamsSchema
>;
