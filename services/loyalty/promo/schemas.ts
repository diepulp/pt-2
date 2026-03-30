/**
 * LoyaltyService Promo Instrument Zod Schemas
 *
 * Validation schemas for route handlers.
 * Mirrors DTO interfaces exactly.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS3
 */

import { z } from 'zod';

import { datetimeSchema } from '@/lib/validation';

// === Route Param Schemas ===

export const promoProgramRouteParamsSchema = z.object({
  id: z.string().uuid('Invalid program ID'),
});

export const promoCouponRouteParamsSchema = z.object({
  id: z.string().uuid('Invalid coupon ID'),
});

// === Promo Program Schemas ===

export const createPromoProgramSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  promoType: z.enum(['match_play', 'free_play']).optional(),
  faceValueAmount: z.number().positive('Face value must be positive'),
  requiredMatchWagerAmount: z.number().positive('Match wager must be positive'),
  startAt: datetimeSchema().optional(),
  endAt: datetimeSchema().optional(),
});

export const updatePromoProgramSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  startAt: datetimeSchema().nullable().optional(),
  endAt: datetimeSchema().nullable().optional(),
});

export const promoProgramListQuerySchema = z.object({
  status: z.string().optional(),
  activeOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// === Promo Coupon Schemas ===

export const issueCouponSchema = z.object({
  promoProgramId: z.string().uuid('Invalid program ID'),
  validationNumber: z.string().min(1, 'Validation number is required').max(50),
  playerId: z.string().uuid().optional(),
  visitId: z.string().uuid().optional(),
  expiresAt: datetimeSchema().optional(),
  correlationId: z.string().uuid().optional(),
});

export const voidCouponSchema = z.object({
  correlationId: z.string().uuid().optional(),
});

export const replaceCouponSchema = z.object({
  newValidationNumber: z
    .string()
    .min(1, 'New validation number is required')
    .max(50),
  newExpiresAt: datetimeSchema().optional(),
  correlationId: z.string().uuid().optional(),
});

export const promoCouponListQuerySchema = z.object({
  promoProgramId: z.string().uuid().optional(),
  status: z
    .enum(['issued', 'voided', 'replaced', 'expired', 'cleared'])
    .optional(),
  playerId: z.string().uuid().optional(),
  visitId: z.string().uuid().optional(),
  expiringBefore: datetimeSchema().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const couponInventoryQuerySchema = z.object({
  promoProgramId: z.string().uuid().optional(),
  status: z
    .enum(['issued', 'voided', 'replaced', 'expired', 'cleared'])
    .optional(),
});
