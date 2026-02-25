/**
 * Shift Checkpoint Zod Schemas (PRD-038)
 *
 * Validation schemas for shift checkpoint API operations.
 * Schemas stay snake_case to mirror HTTP payloads.
 *
 * @see ADR-013 Zod Validation Schemas
 * @see EXEC-038 WS2 Service Layer
 */

import { z } from 'zod';

// === Mutation Schemas ===

/**
 * Schema for creating a shift checkpoint.
 * POST /api/v1/shift-checkpoints
 */
export const createCheckpointSchema = z.object({
  checkpoint_type: z
    .string()
    .min(1, 'Checkpoint type is required')
    .max(50, 'Checkpoint type too long'),
  notes: z.string().max(2000).optional(),
});

// === Query Schemas ===

export const checkpointQuerySchema = z.object({
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// === Transport Type Exports ===

export type CreateCheckpointRequestBody = z.infer<
  typeof createCheckpointSchema
>;
export type CheckpointQueryParams = z.infer<typeof checkpointQuerySchema>;
