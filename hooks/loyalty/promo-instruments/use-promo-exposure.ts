/**
 * Promo Exposure Query Hook
 *
 * React Query hook for fetching promo exposure rollup metrics.
 * Used by shift dashboards for "Promo Lens" section (separate from cash KPIs).
 *
 * @see services/loyalty/rollups.ts - Rollup query implementation
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-LOYALTY-PROMO
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import { loyaltyKeys } from "@/services/loyalty/keys";
import type {
  PromoExposureRollupDTO,
  PromoExposureRollupQuery,
} from "@/services/loyalty/rollups";
import { getPromoExposureRollup } from "@/services/loyalty/rollups";

/**
 * Fetches promo exposure rollup metrics for shift dashboards.
 * Surfaces promo summaries SEPARATELY from cash KPIs (DoD requirement).
 *
 * @param query - Optional filters (gamingDay, shiftId, fromTs, toTs)
 * @param options - Additional query options (enabled, refetchInterval)
 *
 * @example
 * ```tsx
 * // Get current promo exposure
 * const { data: exposure, isLoading } = usePromoExposure();
 * if (exposure) {
 *   console.log('Issued:', exposure.issuedCount, 'coupons');
 *   console.log('Outstanding:', exposure.outstandingCount, 'coupons');
 *   console.log('Expiring Soon:', exposure.expiringSoonCount);
 * }
 *
 * // Filter by gaming day
 * const { data } = usePromoExposure({ gamingDay: '2026-01-07' });
 *
 * // Filter by time range
 * const { data } = usePromoExposure({
 *   fromTs: '2026-01-07T00:00:00Z',
 *   toTs: '2026-01-07T23:59:59Z',
 * });
 *
 * // Auto-refresh every 30 seconds for live dashboard
 * const { data } = usePromoExposure({}, {
 *   refetchInterval: 30_000,
 * });
 * ```
 */
export function usePromoExposure(
  query: PromoExposureRollupQuery = {},
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: loyaltyKeys.promoExposureRollup({
      gamingDay: query.gamingDay,
      shiftId: query.shiftId,
      fromTs: query.fromTs,
      toTs: query.toTs,
    }),
    queryFn: async (): Promise<PromoExposureRollupDTO> => {
      const supabase = createBrowserComponentClient();
      return getPromoExposureRollup(supabase, query);
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000, // 30 seconds - dashboard data
    refetchOnWindowFocus: true,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

// Re-export types for convenience
export type { PromoExposureRollupDTO, PromoExposureRollupQuery };
