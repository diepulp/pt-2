/**
 * Dashboard Promo Exposure Hook
 *
 * Dashboard-specific wrapper for promo exposure rollup data.
 * Consumes LoyaltyService rollup via browser Supabase client.
 * Used by PromoExposurePanel component.
 *
 * @see components/dashboard/promo-exposure-panel.tsx
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS8
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type {
  PromoExposureRollupDTO,
  PromoExposureRollupQuery,
} from '@/services/loyalty/rollups';
import { getPromoExposureRollup } from '@/services/loyalty/rollups';

import { dashboardKeys } from './keys';

interface UseDashboardPromoExposureOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Auto-refresh interval in ms (default: 30s) */
  refetchInterval?: number | false;
}

/**
 * Fetches promo exposure rollup for dashboard display.
 * Auto-refreshes every 30 seconds for live dashboard updates.
 *
 * @param casinoId - Casino UUID (required)
 * @param query - Optional filters (gamingDay, shiftId)
 * @param options - Query options
 *
 * @example
 * ```tsx
 * const { data: exposure, isLoading, error } = useDashboardPromoExposure(
 *   casinoId,
 *   { gamingDay: '2026-01-07' },
 *   { refetchInterval: 30_000 }
 * );
 * ```
 */
export function useDashboardPromoExposure(
  casinoId: string | undefined,
  query: Omit<PromoExposureRollupQuery, 'casinoId'> = {},
  options: UseDashboardPromoExposureOptions = {},
) {
  const { enabled = true, refetchInterval = 30_000 } = options;

  return useQuery({
    queryKey: dashboardKeys.promoExposure(casinoId!, {
      gamingDay: query.gamingDay,
      shiftId: query.shiftId,
    }),
    queryFn: async (): Promise<PromoExposureRollupDTO> => {
      const supabase = createBrowserComponentClient();
      return getPromoExposureRollup(supabase, query);
    },
    enabled: !!casinoId && enabled,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}

// Re-export types for convenience
export type { PromoExposureRollupDTO, PromoExposureRollupQuery };
