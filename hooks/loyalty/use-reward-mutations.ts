/**
 * Reward Catalog Mutation Hooks
 *
 * Hooks for reward catalog operations: create, update, and toggle active.
 * All mutations automatically invalidate relevant queries using surgical cache updates.
 *
 * @see services/loyalty/reward/http.ts - HTTP fetchers
 * @see services/loyalty/reward/keys.ts - Query key factory (rewardKeys)
 * @see PRD-LOYALTY-ADMIN-CATALOG
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CreateRewardInput,
  RewardCatalogDTO,
  UpdateRewardInput,
} from '@/services/loyalty/reward/dtos';
import { createReward, updateReward } from '@/services/loyalty/reward/http';
import { rewardKeys } from '@/services/loyalty/reward/keys';

// === Mutation Input Interfaces ===

/**
 * Input for createReward mutation with required idempotency key.
 */
interface CreateRewardMutationInput extends CreateRewardInput {
  /** Idempotency key to prevent duplicate creations */
  idempotencyKey: string;
}

/**
 * Input for updateReward mutation with required idempotency key.
 */
interface UpdateRewardMutationInput extends UpdateRewardInput {
  /** Idempotency key to prevent duplicate updates */
  idempotencyKey: string;
}

/**
 * Input for toggleRewardActive mutation with required idempotency key.
 */
interface ToggleRewardActiveMutationInput {
  /** Reward ID to toggle */
  id: string;
  /** New active state */
  isActive: boolean;
  /** Idempotency key to prevent duplicate toggles */
  idempotencyKey: string;
}

// === Mutation Hooks ===

/**
 * Creates a new reward catalog entry.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - All reward list queries (rewardKeys.list.scope)
 *
 * @example
 * ```tsx
 * const createReward = useCreateReward();
 *
 * await createReward.mutateAsync({
 *   casinoId,
 *   code: 'COMP_MEAL_BRONZE',
 *   family: 'points_comp',
 *   kind: 'comp_meal',
 *   name: 'Comp Meal (Bronze)',
 *   idempotencyKey: `create-reward-${Date.now()}`,
 * });
 * ```
 */
export function useCreateReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: rewardKeys.createReward(),
    mutationFn: ({
      idempotencyKey,
      ...input
    }: CreateRewardMutationInput): Promise<RewardCatalogDTO> =>
      createReward(input, idempotencyKey),
    onSuccess: () => {
      // Invalidate all reward list queries
      queryClient.invalidateQueries({
        queryKey: rewardKeys.list.scope,
      });
    },
  });
}

/**
 * Updates an existing reward catalog entry.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Specific reward detail query
 * - All reward list queries (rewardKeys.list.scope)
 *
 * @example
 * ```tsx
 * const updateReward = useUpdateReward();
 *
 * await updateReward.mutateAsync({
 *   id: rewardId,
 *   name: 'Updated Reward Name',
 *   idempotencyKey: `update-reward-${rewardId}-${Date.now()}`,
 * });
 * ```
 */
export function useUpdateReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: rewardKeys.updateReward(),
    mutationFn: ({
      idempotencyKey,
      ...input
    }: UpdateRewardMutationInput): Promise<RewardCatalogDTO> =>
      updateReward(input, idempotencyKey),
    onSuccess: (_data, variables) => {
      // Invalidate specific reward detail
      queryClient.invalidateQueries({
        queryKey: rewardKeys.detail(variables.id),
      });
      // Invalidate all reward list queries
      queryClient.invalidateQueries({
        queryKey: rewardKeys.list.scope,
      });
    },
  });
}

/**
 * Toggles a reward's active state.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Specific reward detail query
 * - All reward list queries (rewardKeys.list.scope)
 *
 * @example
 * ```tsx
 * const toggleActive = useToggleRewardActive();
 *
 * await toggleActive.mutateAsync({
 *   id: rewardId,
 *   isActive: false,
 *   idempotencyKey: `toggle-reward-${rewardId}-${Date.now()}`,
 * });
 * ```
 */
export function useToggleRewardActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: rewardKeys.toggleActive(),
    mutationFn: ({
      id,
      isActive,
      idempotencyKey,
    }: ToggleRewardActiveMutationInput): Promise<RewardCatalogDTO> =>
      updateReward({ id, isActive }, idempotencyKey),
    onSuccess: (_data, variables) => {
      // Invalidate specific reward detail
      queryClient.invalidateQueries({
        queryKey: rewardKeys.detail(variables.id),
      });
      // Invalidate all reward list queries
      queryClient.invalidateQueries({
        queryKey: rewardKeys.list.scope,
      });
    },
  });
}

// Re-export mutation input types for convenience
export type {
  CreateRewardMutationInput,
  UpdateRewardMutationInput,
  ToggleRewardActiveMutationInput,
};
