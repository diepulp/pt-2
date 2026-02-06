/**
 * LoyaltyService Reward Catalog Mappers
 *
 * Type-safe transformations from database rows to DTOs.
 * Uses explicit row types for direct table queries.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import { narrowJsonRecord } from '@/lib/json/narrows';
import type { Json } from '@/types/database.types';

import type {
  EligibleRewardDTO,
  LoyaltyEarnConfigDTO,
  RewardCatalogDTO,
  RewardDetailDTO,
  RewardEligibilityDTO,
  RewardEntitlementTierDTO,
  RewardFamily,
  RewardLimitDTO,
  RewardPricePointsDTO,
} from './dtos';

// === Row Types (matching database columns) ===

export interface RewardCatalogRow {
  id: string;
  casino_id: string;
  code: string;
  family: RewardFamily;
  kind: string;
  name: string;
  is_active: boolean;
  fulfillment: string | null;
  metadata: Json;
  ui_tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RewardPricePointsRow {
  reward_id: string;
  casino_id: string;
  points_cost: number;
  allow_overdraw: boolean;
}

export interface RewardEntitlementTierRow {
  id: string;
  reward_id: string;
  casino_id: string;
  tier: string;
  benefit: Json;
}

export interface RewardLimitsRow {
  id: string;
  reward_id: string;
  casino_id: string;
  max_issues: number;
  scope: string;
  cooldown_minutes: number | null;
  requires_note: boolean;
}

export interface RewardEligibilityRow {
  id: string;
  reward_id: string;
  casino_id: string;
  min_points_balance: number | null;
  min_tier: string | null;
  max_tier: string | null;
  visit_kinds: string[] | null;
}

export interface LoyaltyEarnConfigRow {
  casino_id: string;
  points_per_theo: number;
  default_point_multiplier: number;
  rounding_policy: string;
  is_active: boolean;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
}

// === Type Guards ===

// Type guards require assertions to access nested properties after 'in' checks

export function isRewardCatalogRow(v: unknown): v is RewardCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'casino_id' in v &&
    'code' in v &&
    'family' in v &&
    'name' in v
  );
}

export function isRewardPricePointsRow(v: unknown): v is RewardPricePointsRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'reward_id' in v &&
    'points_cost' in v
  );
}

export function isRewardEntitlementTierRow(
  v: unknown,
): v is RewardEntitlementTierRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'reward_id' in v &&
    'tier' in v &&
    'benefit' in v
  );
}

export function isRewardLimitsRow(v: unknown): v is RewardLimitsRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'reward_id' in v &&
    'max_issues' in v &&
    'scope' in v
  );
}

export function isRewardEligibilityRow(v: unknown): v is RewardEligibilityRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'reward_id' in v &&
    'casino_id' in v
  );
}

export function isLoyaltyEarnConfigRow(v: unknown): v is LoyaltyEarnConfigRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'casino_id' in v &&
    'points_per_theo' in v
  );
}

// === Reward Catalog Mappers ===

export function toRewardCatalogDTO(row: RewardCatalogRow): RewardCatalogDTO {
  return {
    id: row.id,
    casinoId: row.casino_id,
    code: row.code,
    family: row.family,
    kind: row.kind,
    name: row.name,
    isActive: row.is_active,
    fulfillment: row.fulfillment,
    metadata: narrowJsonRecord(row.metadata),
    uiTags: row.ui_tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseRewardCatalogRow(data: unknown): RewardCatalogDTO {
  if (!isRewardCatalogRow(data)) {
    throw new Error('Invalid RewardCatalogRow structure');
  }
  return toRewardCatalogDTO(data);
}

// === Reward Price Points Mappers ===

export function toRewardPricePointsDTO(
  row: RewardPricePointsRow,
): RewardPricePointsDTO {
  return {
    rewardId: row.reward_id,
    casinoId: row.casino_id,
    pointsCost: Number(row.points_cost),
    allowOverdraw: row.allow_overdraw,
  };
}

export function parseRewardPricePointsRow(data: unknown): RewardPricePointsDTO {
  if (!isRewardPricePointsRow(data)) {
    throw new Error('Invalid RewardPricePointsRow structure');
  }
  return toRewardPricePointsDTO(data);
}

// === Reward Entitlement Tier Mappers ===

export function toRewardEntitlementTierDTO(
  row: RewardEntitlementTierRow,
): RewardEntitlementTierDTO {
  return {
    id: row.id,
    rewardId: row.reward_id,
    casinoId: row.casino_id,
    tier: row.tier,
    benefit: narrowJsonRecord(row.benefit),
  };
}

export function parseRewardEntitlementTierRow(
  data: unknown,
): RewardEntitlementTierDTO {
  if (!isRewardEntitlementTierRow(data)) {
    throw new Error('Invalid RewardEntitlementTierRow structure');
  }
  return toRewardEntitlementTierDTO(data);
}

// === Reward Limits Mappers ===

export function toRewardLimitDTO(row: RewardLimitsRow): RewardLimitDTO {
  return {
    id: row.id,
    rewardId: row.reward_id,
    casinoId: row.casino_id,
    maxIssues: Number(row.max_issues),
    scope: row.scope,
    cooldownMinutes: row.cooldown_minutes,
    requiresNote: row.requires_note,
  };
}

export function parseRewardLimitsRow(data: unknown): RewardLimitDTO {
  if (!isRewardLimitsRow(data)) {
    throw new Error('Invalid RewardLimitsRow structure');
  }
  return toRewardLimitDTO(data);
}

// === Reward Eligibility Mappers ===

export function toRewardEligibilityDTO(
  row: RewardEligibilityRow,
): RewardEligibilityDTO {
  return {
    id: row.id,
    rewardId: row.reward_id,
    casinoId: row.casino_id,
    minPointsBalance: row.min_points_balance,
    minTier: row.min_tier,
    maxTier: row.max_tier,
    visitKinds: row.visit_kinds,
  };
}

export function parseRewardEligibilityRow(data: unknown): RewardEligibilityDTO {
  if (!isRewardEligibilityRow(data)) {
    throw new Error('Invalid RewardEligibilityRow structure');
  }
  return toRewardEligibilityDTO(data);
}

// === Loyalty Earn Config Mappers ===

export function toEarnConfigDTO(
  row: LoyaltyEarnConfigRow,
): LoyaltyEarnConfigDTO {
  return {
    casinoId: row.casino_id,
    pointsPerTheo: Number(row.points_per_theo),
    defaultPointMultiplier: Number(row.default_point_multiplier),
    roundingPolicy: row.rounding_policy,
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseEarnConfigRow(data: unknown): LoyaltyEarnConfigDTO {
  if (!isLoyaltyEarnConfigRow(data)) {
    throw new Error('Invalid LoyaltyEarnConfigRow structure');
  }
  return toEarnConfigDTO(data);
}

// === Composite Mappers ===

/**
 * Assembles a RewardDetailDTO from a catalog row and its child records.
 */
export function toRewardDetailDTO(
  catalog: RewardCatalogRow,
  pricePoints: RewardPricePointsRow | null,
  entitlementTiers: RewardEntitlementTierRow[],
  limits: RewardLimitsRow[],
  eligibility: RewardEligibilityRow | null,
): RewardDetailDTO {
  return {
    ...toRewardCatalogDTO(catalog),
    pricePoints: pricePoints ? toRewardPricePointsDTO(pricePoints) : null,
    entitlementTiers: entitlementTiers.map(toRewardEntitlementTierDTO),
    limits: limits.map(toRewardLimitDTO),
    eligibility: eligibility ? toRewardEligibilityDTO(eligibility) : null,
  };
}

/**
 * Assembles an EligibleRewardDTO from a catalog row and child records.
 */
export function toEligibleRewardDTO(
  catalog: RewardCatalogRow,
  pricePoints: RewardPricePointsRow | null,
  entitlementTiers: RewardEntitlementTierRow[],
  limits: RewardLimitsRow[],
  eligibility: RewardEligibilityRow | null,
): EligibleRewardDTO {
  return {
    id: catalog.id,
    code: catalog.code,
    family: catalog.family,
    kind: catalog.kind,
    name: catalog.name,
    fulfillment: catalog.fulfillment,
    uiTags: catalog.ui_tags,
    pricePoints: pricePoints ? toRewardPricePointsDTO(pricePoints) : null,
    entitlementTiers: entitlementTiers.map(toRewardEntitlementTierDTO),
    limits: limits.map(toRewardLimitDTO),
    eligibility: eligibility ? toRewardEligibilityDTO(eligibility) : null,
  };
}

// === JSONB Write Boundary ===

/**
 * Widen a Zod-validated Record to Json for Supabase insert/update.
 * Centralizes the JSONB write-boundary cast (SLAD §327-359).
 */
export function toJson(value: Record<string, unknown> | undefined): Json {
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB boundary: Zod-validated Record→Json
  return (value ?? {}) as Json;
}

// === Error Shape Mapper ===

export function toErrorShape(error: unknown): {
  code?: string;
  message: string;
} {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const message =
      typeof errObj.message === 'string' ? errObj.message : String(error);
    const code = typeof errObj.code === 'string' ? errObj.code : undefined;
    return { code, message };
  }
  return { message: String(error) };
}
