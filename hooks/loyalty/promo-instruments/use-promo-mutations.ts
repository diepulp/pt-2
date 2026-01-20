/**
 * Promo Instruments Mutation Hooks
 *
 * Hooks for promo instrument operations: program creation/updates, coupon issuance/void/replace.
 * All mutations automatically invalidate relevant queries using surgical cache updates.
 *
 * @see services/loyalty/promo/http.ts - HTTP fetchers
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-LOYALTY-PROMO
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { loyaltyKeys } from '@/services/loyalty/keys';
import type {
  CreatePromoProgramInput,
  IssueCouponInput,
  IssueCouponOutput,
  PromoProgramDTO,
  ReplaceCouponOutput,
  UpdatePromoProgramInput,
  VoidCouponOutput,
} from '@/services/loyalty/promo/dtos';
import {
  createPromoProgram,
  issueCoupon,
  replaceCoupon,
  updatePromoProgram,
  voidCoupon,
} from '@/services/loyalty/promo/http';

// === Program Mutations ===

/**
 * Input for createPromoProgram mutation with required idempotency key.
 */
interface CreateProgramMutationInput extends CreatePromoProgramInput {
  /** Idempotency key to prevent duplicate creations */
  idempotencyKey: string;
}

/**
 * Creates a new promo program.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - All program list queries (promoPrograms.scope)
 *
 * @example
 * ```tsx
 * const createProgram = useCreatePromoProgram();
 *
 * await createProgram.mutateAsync({
 *   name: 'Weekend Match Play $25',
 *   faceValueAmount: 25,
 *   requiredMatchWagerAmount: 25,
 *   idempotencyKey: `create-program-${Date.now()}`,
 * });
 * ```
 */
export function useCreatePromoProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['loyalty', 'create-program'],
    mutationFn: ({
      idempotencyKey,
      ...input
    }: CreateProgramMutationInput): Promise<PromoProgramDTO> =>
      createPromoProgram(input, idempotencyKey),
    onSuccess: () => {
      // Invalidate all program list queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoPrograms.scope,
      });
    },
  });
}

/**
 * Input for updatePromoProgram mutation with required idempotency key.
 */
interface UpdateProgramMutationInput extends UpdatePromoProgramInput {
  /** Idempotency key to prevent duplicate updates */
  idempotencyKey: string;
}

/**
 * Updates an existing promo program.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Specific program query
 * - All program list queries (promoPrograms.scope)
 *
 * @example
 * ```tsx
 * const updateProgram = useUpdatePromoProgram();
 *
 * await updateProgram.mutateAsync({
 *   id: programId,
 *   status: 'inactive',
 *   idempotencyKey: `update-program-${programId}-${Date.now()}`,
 * });
 * ```
 */
export function useUpdatePromoProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['loyalty', 'update-program'],
    mutationFn: ({
      idempotencyKey,
      ...input
    }: UpdateProgramMutationInput): Promise<PromoProgramDTO> =>
      updatePromoProgram(input, idempotencyKey),
    onSuccess: (_data, variables) => {
      // Invalidate specific program
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoProgram(variables.id),
      });
      // Invalidate all program list queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoPrograms.scope,
      });
    },
  });
}

// === Coupon Mutations ===

/**
 * Input for issueCoupon mutation.
 */
interface IssueCouponMutationInput {
  /** Promo program to issue from */
  promoProgramId: string;
  /** Validation number for the coupon */
  validationNumber: string;
  /** Idempotency key (typically "issue:{validationNumber}") */
  idempotencyKey: string;
  /** Optional player to associate */
  playerId?: string;
  /** Optional visit to associate */
  visitId?: string;
  /** Optional expiration override */
  expiresAt?: string;
  /** Optional correlation ID for audit */
  correlationId?: string;
}

/**
 * Issues a new promo coupon.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - All coupon list queries (promoCoupons.scope)
 * - Coupon inventory query
 * - Promo exposure rollup (for dashboard updates)
 *
 * @example
 * ```tsx
 * const issueCoupon = useIssueCoupon();
 *
 * // Issue coupon to player
 * await issueCoupon.mutateAsync({
 *   promoProgramId: programId,
 *   validationNumber: 'ABC123',
 *   playerId: playerId,
 *   idempotencyKey: `issue:ABC123`,
 * });
 *
 * // Issue anonymous coupon
 * await issueCoupon.mutateAsync({
 *   promoProgramId: programId,
 *   validationNumber: 'XYZ789',
 *   idempotencyKey: `issue:XYZ789`,
 * });
 * ```
 */
export function useIssueCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.issueCoupon(),
    mutationFn: ({
      idempotencyKey,
      ...input
    }: IssueCouponMutationInput): Promise<IssueCouponOutput> =>
      issueCoupon(input, idempotencyKey),
    onSuccess: () => {
      // Invalidate all coupon list queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoCoupons.scope,
      });
      // Invalidate inventory
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-inventory',
      });
      // Invalidate promo exposure rollup for dashboard
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-exposure',
      });
    },
  });
}

/**
 * Input for voidCoupon mutation.
 */
interface VoidCouponMutationInput {
  /** Coupon ID to void */
  couponId: string;
  /** Idempotency key (typically "void:{couponId}") */
  idempotencyKey: string;
  /** Optional correlation ID for audit */
  correlationId?: string;
}

/**
 * Voids a promo coupon.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Specific coupon query
 * - All coupon list queries (promoCoupons.scope)
 * - Coupon inventory query
 * - Promo exposure rollup (for dashboard updates)
 *
 * @example
 * ```tsx
 * const voidCoupon = useVoidCoupon();
 *
 * await voidCoupon.mutateAsync({
 *   couponId: couponId,
 *   idempotencyKey: `void:${couponId}`,
 * });
 * ```
 */
export function useVoidCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.voidCoupon(),
    mutationFn: ({
      couponId,
      idempotencyKey,
      correlationId,
    }: VoidCouponMutationInput): Promise<VoidCouponOutput> =>
      voidCoupon(couponId, idempotencyKey, correlationId),
    onSuccess: (_data, variables) => {
      // Invalidate specific coupon
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoCoupon(variables.couponId),
      });
      // Invalidate all coupon list queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoCoupons.scope,
      });
      // Invalidate inventory
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-inventory',
      });
      // Invalidate promo exposure rollup for dashboard
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-exposure',
      });
    },
  });
}

/**
 * Input for replaceCoupon mutation.
 */
interface ReplaceCouponMutationInput {
  /** Coupon ID to replace */
  couponId: string;
  /** New validation number for replacement coupon */
  newValidationNumber: string;
  /** Idempotency key (typically "replace:{couponId}:{newValidationNumber}") */
  idempotencyKey: string;
  /** Optional new expiration date */
  newExpiresAt?: string;
  /** Optional correlation ID for audit */
  correlationId?: string;
}

/**
 * Replaces a promo coupon with a new one.
 * Idempotent via server-side idempotency key handling.
 *
 * Invalidates:
 * - Old coupon query (by ID)
 * - All coupon list queries (promoCoupons.scope)
 * - Coupon inventory query
 * - Promo exposure rollup (for dashboard updates)
 *
 * @example
 * ```tsx
 * const replaceCoupon = useReplaceCoupon();
 *
 * // Replace with new validation number
 * await replaceCoupon.mutateAsync({
 *   couponId: oldCouponId,
 *   newValidationNumber: 'NEW123',
 *   idempotencyKey: `replace:${oldCouponId}:NEW123`,
 * });
 *
 * // Replace with new expiration
 * await replaceCoupon.mutateAsync({
 *   couponId: oldCouponId,
 *   newValidationNumber: 'NEW456',
 *   newExpiresAt: '2026-02-01T00:00:00Z',
 *   idempotencyKey: `replace:${oldCouponId}:NEW456`,
 * });
 * ```
 */
export function useReplaceCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loyaltyKeys.replaceCoupon(),
    mutationFn: ({
      couponId,
      newValidationNumber,
      idempotencyKey,
      newExpiresAt,
      correlationId,
    }: ReplaceCouponMutationInput): Promise<ReplaceCouponOutput> =>
      replaceCoupon(couponId, newValidationNumber, idempotencyKey, {
        newExpiresAt,
        correlationId,
      }),
    onSuccess: (_data, variables) => {
      // Invalidate old coupon
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoCoupon(variables.couponId),
      });
      // Invalidate all coupon list queries
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.promoCoupons.scope,
      });
      // Invalidate inventory
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-inventory',
      });
      // Invalidate promo exposure rollup for dashboard
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'loyalty' &&
          query.queryKey[1] === 'promo-exposure',
      });
    },
  });
}

// Re-export mutation input types for convenience
export type {
  CreateProgramMutationInput,
  UpdateProgramMutationInput,
  IssueCouponMutationInput,
  VoidCouponMutationInput,
  ReplaceCouponMutationInput,
};
