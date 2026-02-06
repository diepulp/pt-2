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

// === Route Param Schemas ===

export const rewardRouteParamsSchema = z.object({
  id: z.string().uuid('Invalid reward ID'),
});

// === Reward Catalog Schemas ===

const pricePointsSchema = z.object({
  pointsCost: z.number().int().min(0, 'Points cost must be >= 0'),
  allowOverdraw: z.boolean().optional(),
});

const entitlementTierSchema = z.object({
  tier: z.string().min(1, 'Tier is required'),
  benefit: z.record(z.string(), z.unknown()),
});

const limitSchema = z.object({
  maxIssues: z.number().int().positive('Max issues must be > 0'),
  scope: z.string().min(1, 'Scope is required'),
  cooldownMinutes: z.number().int().nonnegative().optional(),
  requiresNote: z.boolean().optional(),
});

const eligibilitySchema = z.object({
  minPointsBalance: z.number().int().nonnegative().optional(),
  minTier: z.string().optional(),
  maxTier: z.string().optional(),
  visitKinds: z.array(z.string()).optional(),
});

export const createRewardSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  family: z.enum(['points_comp', 'entitlement']),
  kind: z.string().min(1, 'Kind is required').max(100),
  name: z.string().min(1, 'Name is required').max(200),
  fulfillment: z.string().max(200).optional(),
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
  fulfillment: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  uiTags: z.array(z.string()).nullable().optional(),
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
  effectiveFrom: z.string().datetime().nullable().optional(),
});

// === Eligible Rewards Schema ===

export const eligibleRewardsQuerySchema = z.object({
  playerId: z.string().uuid('Invalid player ID'),
});
