/**
 * LoyaltyService Reward Catalog DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for reward catalog operations.
 * All DTOs use camelCase and explicit interfaces.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

// === Enum Types ===

/**
 * Reward family discriminator.
 * - points_comp: Redeemable for loyalty points (e.g., comp meals, beverages)
 * - entitlement: Tier-based benefit (e.g., match play, free play per gaming day)
 */
export type RewardFamily = 'points_comp' | 'entitlement';

// === Reward Catalog DTOs ===

/**
 * Reward catalog list DTO (summary view).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardCatalogDTO {
  id: string;
  casinoId: string;
  code: string;
  family: RewardFamily;
  kind: string;
  name: string;
  isActive: boolean;
  fulfillment: string | null;
  metadata: Record<string, unknown>;
  uiTags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reward price points DTO (1:1 with reward_catalog for points_comp family).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardPricePointsDTO {
  rewardId: string;
  casinoId: string;
  pointsCost: number;
  allowOverdraw: boolean;
}

/**
 * Reward entitlement tier DTO (1:N with reward_catalog for entitlement family).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardEntitlementTierDTO {
  id: string;
  rewardId: string;
  casinoId: string;
  tier: string;
  benefit: Record<string, unknown>;
}

/**
 * Reward limit DTO.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardLimitDTO {
  id: string;
  rewardId: string;
  casinoId: string;
  maxIssues: number;
  scope: string;
  cooldownMinutes: number | null;
  requiresNote: boolean;
}

/**
 * Reward eligibility DTO.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardEligibilityDTO {
  id: string;
  rewardId: string;
  casinoId: string;
  minPointsBalance: number | null;
  minTier: string | null;
  maxTier: string | null;
  visitKinds: string[] | null;
}

/**
 * Reward detail DTO (catalog + all child records).
 * Used for GET /api/v1/rewards/[id] single-reward view.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface RewardDetailDTO extends RewardCatalogDTO {
  pricePoints: RewardPricePointsDTO | null;
  entitlementTiers: RewardEntitlementTierDTO[];
  limits: RewardLimitDTO[];
  eligibility: RewardEligibilityDTO | null;
}

/**
 * Casino loyalty earn configuration DTO.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface LoyaltyEarnConfigDTO {
  casinoId: string;
  pointsPerTheo: number;
  defaultPointMultiplier: number;
  roundingPolicy: string;
  isActive: boolean;
  effectiveFrom: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Eligible reward DTO (enriched with player context for issuance UI).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface EligibleRewardDTO {
  id: string;
  code: string;
  family: RewardFamily;
  kind: string;
  name: string;
  fulfillment: string | null;
  uiTags: string[] | null;
  pricePoints: RewardPricePointsDTO | null;
  entitlementTiers: RewardEntitlementTierDTO[];
  limits: RewardLimitDTO[];
  eligibility: RewardEligibilityDTO | null;
}

// === Input DTOs ===

/**
 * Input for creating a reward catalog entry.
 */
export interface CreateRewardInput {
  casinoId: string;
  code: string;
  family: RewardFamily;
  kind: string;
  name: string;
  fulfillment?: string;
  metadata?: Record<string, unknown>;
  uiTags?: string[];
  /** Price points config (required for points_comp family) */
  pricePoints?: {
    pointsCost: number;
    allowOverdraw?: boolean;
  };
  /** Entitlement tier configs (for entitlement family) */
  entitlementTiers?: Array<{
    tier: string;
    benefit: Record<string, unknown>;
  }>;
  /** Limits config */
  limits?: Array<{
    maxIssues: number;
    scope: string;
    cooldownMinutes?: number;
    requiresNote?: boolean;
  }>;
  /** Eligibility config */
  eligibility?: {
    minPointsBalance?: number;
    minTier?: string;
    maxTier?: string;
    visitKinds?: string[];
  };
}

/**
 * Input for updating a reward catalog entry.
 */
export interface UpdateRewardInput {
  id: string;
  name?: string;
  kind?: string;
  isActive?: boolean;
  fulfillment?: string | null;
  metadata?: Record<string, unknown>;
  uiTags?: string[] | null;
}

/**
 * Input for upserting casino earn configuration.
 */
export interface UpsertEarnConfigInput {
  casinoId: string;
  pointsPerTheo?: number;
  defaultPointMultiplier?: number;
  roundingPolicy?: string;
  isActive?: boolean;
  effectiveFrom?: string | null;
}

/**
 * Query parameters for listing rewards.
 */
export interface RewardListQuery {
  family?: RewardFamily;
  kind?: string;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}
