/**
 * Gaming Day Summary Query Hook
 *
 * Hook for fetching the Gaming Day Summary - the COMPLIANCE AUTHORITY surface.
 * Aggregates per patron + gaming_day with separate in/out totals.
 * This is the authoritative compliance trigger per 31 CFR § 1021.311.
 *
 * @see services/mtl/http.ts - HTTP fetchers
 * @see services/mtl/keys.ts - Query key factory
 * @see PRD-005 MTL Service
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  MtlGamingDaySummaryDTO,
  MtlGamingDaySummaryFilters,
} from "@/services/mtl/dtos";
import { getGamingDaySummary } from "@/services/mtl/http";
import { mtlKeys } from "@/services/mtl/keys";
import type { MtlGamingDaySummaryQueryFilters } from "@/services/mtl/keys";

/**
 * Converts camelCase query filters to snake_case HTTP filters.
 */
function toHttpFilters(
  filters: MtlGamingDaySummaryQueryFilters,
): MtlGamingDaySummaryFilters {
  return {
    casino_id: filters.casinoId,
    gaming_day: filters.gamingDay,
    patron_uuid: filters.patronId,
    agg_badge_in: filters.aggBadgeIn,
    agg_badge_out: filters.aggBadgeOut,
    min_total_in: filters.minTotalIn,
    min_total_out: filters.minTotalOut,
    cursor: filters.cursor,
    limit: filters.limit,
  };
}

/**
 * Fetches the Gaming Day Summary - the COMPLIANCE AUTHORITY surface.
 * Returns aggregates per patron per gaming day with Tier 2 badges.
 *
 * @param filters - Query filters (casinoId and gamingDay required)
 *
 * @example
 * ```tsx
 * // Get all summaries for today's gaming day
 * const { data, isLoading } = useGamingDaySummary({
 *   casinoId,
 *   gamingDay: '2026-01-03',
 * });
 *
 * // Filter to show only patrons who triggered CTR threshold
 * const { data } = useGamingDaySummary({
 *   casinoId,
 *   gamingDay: '2026-01-03',
 *   aggBadgeIn: 'agg_ctr_met',
 * });
 *
 * // Filter for large cash-out activity
 * const { data } = useGamingDaySummary({
 *   casinoId,
 *   gamingDay: '2026-01-03',
 *   minTotalOut: 5000,
 * });
 * ```
 */
export function useGamingDaySummary(filters: MtlGamingDaySummaryQueryFilters) {
  const hasRequiredFilters = !!filters.casinoId && !!filters.gamingDay;

  return useQuery({
    queryKey: mtlKeys.gamingDaySummary(filters),
    queryFn: async (): Promise<{
      items: MtlGamingDaySummaryDTO[];
      next_cursor: string | null;
    }> => {
      return getGamingDaySummary(toHttpFilters(filters));
    },
    enabled: hasRequiredFilters,
    staleTime: 15_000, // 15 seconds - aggregates update with new transactions
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // 1 minute - compliance dashboard auto-refresh
  });
}
