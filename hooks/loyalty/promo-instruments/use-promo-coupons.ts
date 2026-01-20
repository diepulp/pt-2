/**
 * Promo Coupons Query Hooks
 *
 * React Query hooks for fetching promo coupon data.
 * Used by pit bosses to view coupon inventory and details.
 *
 * @see services/loyalty/promo/http.ts - HTTP fetchers
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-LOYALTY-PROMO
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { loyaltyKeys } from '@/services/loyalty/keys';
import type {
  CouponInventoryOutput,
  CouponInventoryQuery,
  PromoCouponDTO,
  PromoCouponListQuery,
} from '@/services/loyalty/promo/dtos';
import {
  getCouponInventory,
  getPromoCoupon,
  getPromoCouponByValidation,
  listPromoCoupons,
} from '@/services/loyalty/promo/http';

/**
 * Fetches list of promo coupons with optional filters.
 *
 * @param query - Optional filters (promoProgramId, status, playerId, visitId, etc.)
 * @param options - Additional query options (enabled, etc.)
 *
 * @example
 * ```tsx
 * // List all coupons
 * const { data: coupons, isLoading } = usePromoCoupons();
 *
 * // Filter by program
 * const { data } = usePromoCoupons({ promoProgramId: programId });
 *
 * // Filter by status and player
 * const { data } = usePromoCoupons({
 *   status: 'issued',
 *   playerId: playerId,
 * });
 *
 * // Find expiring soon (next 24 hours)
 * const tomorrow = new Date();
 * tomorrow.setDate(tomorrow.getDate() + 1);
 * const { data } = usePromoCoupons({
 *   expiringBefore: tomorrow.toISOString(),
 * });
 * ```
 */
export function usePromoCoupons(
  query: PromoCouponListQuery = {},
  options?: { enabled?: boolean },
) {
  const { promoProgramId, status, playerId, visitId } = query;

  return useQuery({
    queryKey: loyaltyKeys.promoCoupons({
      promoProgramId,
      status,
      playerId,
      visitId,
    }),
    queryFn: (): Promise<PromoCouponDTO[]> => listPromoCoupons(query),
    enabled: options?.enabled ?? true,
    staleTime: 30_000, // 30 seconds - coupons can change frequently
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches a single promo coupon by ID.
 *
 * @param couponId - Coupon UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: coupon, isLoading } = usePromoCoupon(couponId);
 * if (coupon) {
 *   console.log('Validation#:', coupon.validationNumber);
 *   console.log('Status:', coupon.status);
 * }
 * ```
 */
export function usePromoCoupon(couponId: string | undefined) {
  return useQuery({
    queryKey: loyaltyKeys.promoCoupon(couponId!),
    queryFn: (): Promise<PromoCouponDTO | null> => getPromoCoupon(couponId!),
    enabled: !!couponId,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches a promo coupon by its validation number.
 * Useful for looking up coupons by the printed number.
 *
 * @param validationNumber - Validation number (required, undefined disables query)
 *
 * @example
 * ```tsx
 * // Look up coupon by validation number
 * const { data: coupon, isLoading } = usePromoCouponByValidation('ABC123');
 * if (coupon) {
 *   console.log('Found coupon:', coupon.id);
 *   console.log('Status:', coupon.status);
 * }
 * ```
 */
export function usePromoCouponByValidation(
  validationNumber: string | undefined,
) {
  return useQuery({
    queryKey: loyaltyKeys.promoCouponByValidation(validationNumber!),
    queryFn: (): Promise<PromoCouponDTO | null> =>
      getPromoCouponByValidation(validationNumber!),
    enabled: !!validationNumber,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches coupon inventory summary (counts and totals by status).
 *
 * @param query - Optional filters (promoProgramId, status)
 * @param options - Additional query options (enabled, etc.)
 *
 * @example
 * ```tsx
 * // Get overall inventory
 * const { data: inventory, isLoading } = usePromoCouponInventory();
 * if (inventory) {
 *   inventory.inventory.forEach(row => {
 *     console.log(`${row.status}: ${row.couponCount} coupons, $${row.totalFaceValue}`);
 *   });
 * }
 *
 * // Get inventory for specific program
 * const { data } = usePromoCouponInventory({ promoProgramId: programId });
 * ```
 */
export function usePromoCouponInventory(
  query: CouponInventoryQuery = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: loyaltyKeys.promoCouponInventory(query),
    queryFn: (): Promise<CouponInventoryOutput> => getCouponInventory(query),
    enabled: options?.enabled ?? true,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
