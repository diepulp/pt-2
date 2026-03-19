/**
 * Player Exclusion Zod Schemas
 *
 * Validation schemas for exclusion API operations.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import { z } from 'zod';

import { uuidSchema } from '@/lib/validation';

// === Exclusion Type & Enforcement Enums ===

export const exclusionTypeEnum = z.enum([
  'self_exclusion',
  'trespass',
  'regulatory',
  'internal_ban',
  'watchlist',
]);

export const enforcementEnum = z.enum(['hard_block', 'soft_alert', 'monitor']);

// === Create Exclusion Schema ===

export const createExclusionSchema = z.object({
  player_id: uuidSchema('player ID'),
  exclusion_type: exclusionTypeEnum,
  enforcement: enforcementEnum,
  reason: z.string().min(1, 'Reason is required').max(1000, 'Reason too long'),
  effective_from: z.iso
    .datetime({ message: 'effective_from must be ISO 8601' })
    .optional(),
  effective_until: z.iso
    .datetime({ message: 'effective_until must be ISO 8601' })
    .nullable()
    .optional(),
  review_date: z.iso
    .datetime({ message: 'review_date must be ISO 8601' })
    .nullable()
    .optional(),
  external_ref: z.string().max(500).nullable().optional(),
  jurisdiction: z.string().max(200).nullable().optional(),
});

// === Lift Exclusion Schema ===

export const liftExclusionSchema = z.object({
  lift_reason: z
    .string()
    .min(1, 'Lift reason is required')
    .max(1000, 'Lift reason too long'),
});

// === Route Param Schemas ===

export const exclusionRouteParamsSchema = z.object({
  playerId: uuidSchema('player ID'),
});

export const exclusionDetailParamsSchema = z.object({
  playerId: uuidSchema('player ID'),
  exclusionId: uuidSchema('exclusion ID'),
});

// === Type Exports ===

export type CreateExclusionSchemaInput = z.infer<typeof createExclusionSchema>;
export type LiftExclusionSchemaInput = z.infer<typeof liftExclusionSchema>;
