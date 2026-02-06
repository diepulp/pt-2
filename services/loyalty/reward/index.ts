/**
 * LoyaltyService Reward Catalog Sub-module
 *
 * Reward catalog management for LoyaltyService.
 * Pattern A: Contract-First with manual DTOs.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  CreateRewardInput,
  EligibleRewardDTO,
  LoyaltyEarnConfigDTO,
  RewardCatalogDTO,
  RewardDetailDTO,
  RewardListQuery,
  UpdateRewardInput,
  UpsertEarnConfigInput,
} from './dtos';

// Re-export all DTOs for consumers
export * from './dtos';

// === Reward Service Interface ===

/**
 * RewardService interface - explicit, no ReturnType inference.
 *
 * All write operations require RLS context (casino_id, staff_role).
 * Read operations are automatically scoped by RLS policies.
 * ADR-024: Casino context derived from authenticated user, not parameters.
 */
export interface RewardService {
  /**
   * Lists reward catalog entries for the current casino.
   *
   * @param query - Query filters (family, kind, isActive, search, limit, offset)
   * @returns Array of RewardCatalogDTO
   */
  listRewards(query?: RewardListQuery): Promise<RewardCatalogDTO[]>;

  /**
   * Gets a single reward with full details (child records included).
   *
   * @param id - Reward UUID
   * @returns RewardDetailDTO or null if not found
   */
  getReward(id: string): Promise<RewardDetailDTO | null>;

  /**
   * Creates a new reward catalog entry with optional child records.
   *
   * @param input - Reward creation input
   * @returns Created RewardCatalogDTO
   * @throws UNIQUE_VIOLATION if code already exists for casino
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  createReward(input: CreateRewardInput): Promise<RewardCatalogDTO>;

  /**
   * Updates a reward catalog entry.
   *
   * @param input - Reward update input
   * @returns Updated RewardCatalogDTO
   * @throws NOT_FOUND if reward doesn't exist
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  updateReward(input: UpdateRewardInput): Promise<RewardCatalogDTO>;

  /**
   * Toggles a reward's is_active flag.
   *
   * @param id - Reward UUID
   * @param isActive - New active state
   * @returns Updated RewardCatalogDTO
   * @throws NOT_FOUND if reward doesn't exist
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  toggleRewardActive(id: string, isActive: boolean): Promise<RewardCatalogDTO>;

  /**
   * Gets the casino's earn configuration.
   *
   * @returns LoyaltyEarnConfigDTO or null if not configured
   */
  getEarnConfig(): Promise<LoyaltyEarnConfigDTO | null>;

  /**
   * Upserts the casino's earn configuration.
   *
   * @param input - Earn config upsert input
   * @returns Updated LoyaltyEarnConfigDTO
   * @throws FORBIDDEN if caller is not admin
   */
  upsertEarnConfig(input: UpsertEarnConfigInput): Promise<LoyaltyEarnConfigDTO>;

  /**
   * Lists rewards eligible for a given player.
   * Reads: reward_catalog, reward_eligibility, reward_price_points,
   *        reward_entitlement_tier, player_loyalty — all Loyalty-owned per SRM §401-435.
   *
   * @param playerId - Player UUID
   * @returns Array of EligibleRewardDTO
   */
  listEligibleRewards(playerId: string): Promise<EligibleRewardDTO[]>;
}

// === Service Factory ===

/**
 * Creates a RewardService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createRewardService(
  supabase: SupabaseClient<Database>,
): RewardService {
  return {
    listRewards: (query) => crud.listRewards(supabase, query),
    getReward: (id) => crud.getReward(supabase, id),
    createReward: (input) => crud.createReward(supabase, input),
    updateReward: (input) => crud.updateReward(supabase, input),
    toggleRewardActive: (id, isActive) =>
      crud.toggleRewardActive(supabase, id, isActive),
    getEarnConfig: () => crud.getEarnConfig(supabase),
    upsertEarnConfig: (input) => crud.upsertEarnConfig(supabase, input),
    listEligibleRewards: (playerId) =>
      crud.listEligibleRewards(supabase, playerId),
  };
}
