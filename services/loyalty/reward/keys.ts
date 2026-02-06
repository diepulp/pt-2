/**
 * LoyaltyService Reward Catalog React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import { serializeKeyFilters } from '@/services/shared/key-utils';

import type { RewardListQuery } from './dtos';

const ROOT = ['loyalty', 'reward'] as const;

type RewardFilters = Omit<RewardListQuery, 'limit' | 'offset'>;

export const rewardKeys = {
  /** Root key for all reward queries */
  root: ROOT,

  // === Reward Catalog Queries ===

  /** List rewards with optional filters */
  list: Object.assign(
    (filters: RewardFilters = {}) =>
      [...ROOT, 'list', serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),

  /** Single reward detail by ID */
  detail: (rewardId: string) => [...ROOT, 'detail', rewardId] as const,

  // === Earn Config Queries ===

  /** Casino earn configuration */
  earnConfig: () => [...ROOT, 'earn-config'] as const,

  // === Eligible Rewards ===

  /** Eligible rewards for a player */
  eligible: (playerId: string) => [...ROOT, 'eligible', playerId] as const,

  // === Mutation Keys ===

  /** Key for create reward mutation */
  createReward: () => [...ROOT, 'create'] as const,

  /** Key for update reward mutation */
  updateReward: () => [...ROOT, 'update'] as const,

  /** Key for upsert earn config mutation */
  upsertEarnConfig: () => [...ROOT, 'upsert-earn-config'] as const,
};
