/**
 * LoyaltyService Reward Catalog Zod Schemas
 *
 * Validation schemas for route handlers.
 * Mirrors DTO interfaces exactly.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import { z } from 'zod';

import { datetimeSchema } from '@/lib/validation';

// === Route Param Schemas ===

export const rewardRouteParamsSchema = z.object({
  id: z.string().uuid('Invalid reward ID'),
});

// === Reward Catalog Schemas ===

const pricePointsSchema = z.object({
  pointsCost: z.number().int().min(0, 'Points cost must be >= 0'),
  allowOverdraw: z.boolean().optional(),
});

const benefitSchema = z.object({
  face_value_cents: z.number().int().positive('Face value must be > 0'),
  instrument_type: z.enum(['match_play', 'free_play']),
});

const entitlementTierSchema = z.object({
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']),
  benefit: benefitSchema,
});

const limitSchema = z.object({
  maxIssues: z.number().int().positive('Max issues must be > 0'),
  scope: z.enum(['per_visit', 'per_gaming_day', 'per_week', 'per_month']),
  cooldownMinutes: z.number().int().nonnegative().optional(),
  requiresNote: z.boolean().optional(),
});

const eligibilitySchema = z.object({
  minPointsBalance: z.number().int().nonnegative().optional(),
  minTier: z
    .enum(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
    .optional(),
  maxTier: z
    .enum(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
    .optional(),
  visitKinds: z.array(z.string()).optional(),
});

export const createRewardSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  family: z.enum(['points_comp', 'entitlement']),
  kind: z.string().min(1, 'Kind is required').max(100),
  name: z.string().min(1, 'Name is required').max(200),
  fulfillment: z.enum(['comp_slip', 'coupon', 'none']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  uiTags: z.array(z.string()).optional(),
  pricePoints: pricePointsSchema.optional(),
  entitlementTiers: z.array(entitlementTierSchema).optional(),
  limits: z.array(limitSchema).optional(),
  eligibility: eligibilitySchema.optional(),
});

export const updateRewardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  fulfillment: z.enum(['comp_slip', 'coupon', 'none']).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  uiTags: z.array(z.string()).nullable().optional(),
  pricePoints: pricePointsSchema.nullable().optional(),
  entitlementTiers: z.array(entitlementTierSchema).nullable().optional(),
});

export const rewardListQuerySchema = z.object({
  family: z.enum(['points_comp', 'entitlement']).optional(),
  kind: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// === Earn Config Schemas ===

export const upsertEarnConfigSchema = z.object({
  pointsPerTheo: z
    .number()
    .positive('Points per theo must be positive')
    .optional(),
  defaultPointMultiplier: z
    .number()
    .positive('Multiplier must be positive')
    .optional(),
  roundingPolicy: z.enum(['floor', 'ceil', 'round']).optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: datetimeSchema('effectiveFrom').nullable().optional(),
});

// === Eligible Rewards Schema ===

export const eligibleRewardsQuerySchema = z.object({
  playerId: z.string().uuid('Invalid player ID'),
});
