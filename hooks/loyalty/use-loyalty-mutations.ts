/**
 * Loyalty Mutation Hooks
 *
 * Hooks for loyalty operations: accrual, redemption, manual credits, and promotions.
 * All mutations automatically invalidate relevant queries using surgical cache updates.
 *
 * @see services/loyalty/http.ts - HTTP fetchers
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-004 Loyalty Service
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  AccrueOnCloseInput,
  AccrueOnCloseOutput,
  ApplyPromotionInput,
  ApplyPromotionOutput,
  ManualCreditInput,
  ManualCreditOutput,
  RedeemInput,
  RedeemOutput,
} from '@/services/loyalty/dtos';
import {
  accrueOnClose,
  redeem,
  manualCredit,
  applyPromotion,
} from '@/services/loyalty/http';
import { loyaltyKeys } from '@/services/loyalty/keys';

/**
 * Triggers base accrual on rating slip close.
 * Awards points based on theoretical win (theo) per current loyalty policy.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Player balance (loyaltyKeys.balance)
 * - All ledger queries (ledger.scope)
 *
 * @example
 * ```tsx
 * const accrue = useAccrueOnClose();
 *
 * // Award points when rating slip closes
 * await accrue.mutateAsync({
 *   ratingSlipId,
 *   casinoId,
 *   idempotencyKey: `accrue-${ratingSlipId}`,
 * });
 * ```
 */
export function useAccrueOnClose() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.accrue(),
    mutationFn: (input: AccrueOnCloseInput) => accrueOnClose(input),
    onSuccess: (data: AccrueOnCloseOutput, variables: AccrueOnCloseInput) => {
      // Extract playerId from rating slip context (we need it for invalidation)
      // Note: The API response doesn't include playerId, so we rely on broader invalidation

      // Invalidate all ledger queries (surgical invalidation via .scope)
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.ledger.scope,
      });

      // Invalidate balance for this casino (we don't have playerId, so invalidate all balances)
      // This is safe because balance queries are scoped by playerId + casinoId
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'balance' &&
          query.queryKey[2] === variables.casinoId,
      });
    },
  });
}

/**
 * Issues a comp redemption (debit).
 * Deducts points from player balance and creates negative ledger entry.
 * Supports overdraw with pit_boss/admin authorization.
 *
 * Invalidates:
 * - Player balance for the specific player
 * - All ledger queries (ledger.scope)
 *
 * @example
 * ```tsx
 * const redeemPoints = useRedeem();
 *
 * // Redeem points for a comp
 * await redeemPoints.mutateAsync({
 *   casinoId,
 *   playerId,
 *   points: 5000,
 *   issuedByStaffId: staffId,
 *   note: 'Dinner for 2 at steakhouse',
 *   idempotencyKey: `redeem-${playerId}-${Date.now()}`,
 *   rewardId: 'reward-123',
 * });
 *
 * // Overdraw with authorization
 * await redeemPoints.mutateAsync({
 *   casinoId,
 *   playerId,
 *   points: 10000,
 *   issuedByStaffId: pitBossId,
 *   note: 'High roller suite comp',
 *   allowOverdraw: true,
 *   idempotencyKey: `redeem-${playerId}-${Date.now()}`,
 * });
 * ```
 */
export function useRedeem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.redeem(),
    mutationFn: (input: RedeemInput) => redeem(input),
    onSuccess: (_data: RedeemOutput, variables: RedeemInput) => {
      // Invalidate balance for this specific player
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.balance(variables.playerId, variables.casinoId),
      });

      // Invalidate all ledger queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.ledger.scope,
      });
    },
  });
}

/**
 * Issues a manual credit (service recovery, goodwill).
 * Awards points without associated rating slip.
 * Requires pit_boss or admin role.
 *
 * Invalidates:
 * - Player balance for the specific player
 * - All ledger queries (ledger.scope)
 *
 * @example
 * ```tsx
 * const creditPoints = useManualCredit();
 *
 * // Award points for service recovery
 * await creditPoints.mutateAsync({
 *   casinoId,
 *   playerId,
 *   points: 2500,
 *   awardedByStaffId: pitBossId,
 *   note: 'Service recovery for slot malfunction',
 *   idempotencyKey: `manual-${playerId}-${Date.now()}`,
 * });
 * ```
 */
export function useManualCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.manualCredit(),
    mutationFn: (input: ManualCreditInput) => manualCredit(input),
    onSuccess: (_data: ManualCreditOutput, variables: ManualCreditInput) => {
      // Invalidate balance for this specific player
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.balance(variables.playerId, variables.casinoId),
      });

      // Invalidate all ledger queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.ledger.scope,
      });
    },
  });
}

/**
 * Applies a promotional overlay credit.
 * Awards bonus points based on campaign rules.
 * Business uniqueness: one promotion per campaign per rating slip.
 *
 * Invalidates:
 * - Player balance (via predicate, playerId derived from rating slip)
 * - All ledger queries (ledger.scope)
 *
 * @example
 * ```tsx
 * const applyPromo = useApplyPromotion();
 *
 * // Apply fixed bonus promotion
 * await applyPromo.mutateAsync({
 *   casinoId,
 *   ratingSlipId,
 *   campaignId: 'blackjack-weekend-2x',
 *   bonusPoints: 1000,
 *   idempotencyKey: `promo-${ratingSlipId}-${campaignId}`,
 * });
 *
 * // Apply multiplier promotion
 * await applyPromo.mutateAsync({
 *   casinoId,
 *   ratingSlipId,
 *   campaignId: 'vip-triple-points',
 *   bonusPoints: 0,
 *   promoMultiplier: 3.0,
 *   idempotencyKey: `promo-${ratingSlipId}-${campaignId}`,
 * });
 * ```
 */
export function useApplyPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.promotion(),
    mutationFn: (input: ApplyPromotionInput) => applyPromotion(input),
    onSuccess: (
      _data: ApplyPromotionOutput,
      variables: ApplyPromotionInput,
    ) => {
      // Invalidate all ledger queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.ledger.scope,
      });

      // Invalidate balance for this casino (we don't have playerId in input)
      // Use predicate to invalidate all balances for this casino
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'balance' &&
          query.queryKey[2] === variables.casinoId,
      });
    },
  });
}

// Re-export types for convenience
export type {
  AccrueOnCloseInput,
  AccrueOnCloseOutput,
  RedeemInput,
  RedeemOutput,
  ManualCreditInput,
  ManualCreditOutput,
  ApplyPromotionInput,
  ApplyPromotionOutput,
};
