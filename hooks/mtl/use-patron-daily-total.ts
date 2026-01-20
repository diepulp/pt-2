/**
 * Patron Daily Total Hook
 *
 * React Query hook to fetch a patron's current gaming day cash-in total
 * for threshold calculation. Uses the mtl_gaming_day_summary view which
 * aggregates per patron per gaming_day with separate in/out totals.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS3
 * @see services/mtl/keys.ts - Query key factory
 * @see hooks/mtl/use-gaming-day-summary.ts - Similar pattern
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { getGamingDaySummary } from '@/services/mtl/http';
import { mtlKeys } from '@/services/mtl/keys';

// ============================================================================
// Types
// ============================================================================

/**
 * Patron daily total result
 */
export interface PatronDailyTotalDTO {
  /** Total cash-in amount for the gaming day */
  totalIn: number;
  /** Total cash-out amount for the gaming day */
  totalOut: number;
  /** Number of MTL entries recorded */
  entryCount: number;
}

// ============================================================================
// Query Key Extension
// ============================================================================

/**
 * Query key for patron daily total
 * Extends mtlKeys with patron-specific daily total
 */
export const patronDailyTotalKey = (
  casinoId: string | undefined,
  patronUuid: string | undefined,
  gamingDay: string | undefined,
) =>
  [
    ...mtlKeys.root,
    'patron-daily-total',
    casinoId,
    patronUuid,
    gamingDay,
  ] as const;

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch patron's current gaming day cash-in/out aggregate.
 *
 * Returns the patron's total cash-in, cash-out, and entry count
 * for threshold calculation in buy-in workflows.
 *
 * IMPORTANT: gamingDay is now required. Use useGamingDay() hook to fetch
 * the canonical gaming day from server (respects casino timezone and cutoff).
 * Do not use client-side date defaults - they ignore timezone and gaming day cutoff.
 *
 * @param casinoId - Casino UUID
 * @param patronUuid - Patron (player) UUID
 * @param gamingDay - Gaming day in YYYY-MM-DD format (REQUIRED)
 * @returns UseQueryResult with PatronDailyTotalDTO
 *
 * @example
 * ```tsx
 * function BuyInForm({ casinoId, playerId }: Props) {
 *   // Fetch canonical gaming day from server
 *   const { data: gamingDay } = useGamingDay(casinoId);
 *
 *   const { data: dailyTotal, isLoading } = usePatronDailyTotal(
 *     casinoId,
 *     playerId,
 *     gamingDay
 *   );
 *
 *   if (isLoading || !gamingDay) return <Skeleton />;
 *
 *   // Use dailyTotal.totalIn for threshold checking
 *   const projectedTotal = (dailyTotal?.totalIn ?? 0) + newBuyInAmount;
 * }
 * ```
 */
export function usePatronDailyTotal(
  casinoId: string | undefined,
  patronUuid: string | undefined,
  gamingDay: string | undefined,
) {
  const hasRequiredParams = !!casinoId && !!patronUuid && !!gamingDay;

  return useQuery({
    queryKey: patronDailyTotalKey(casinoId, patronUuid, gamingDay),
    queryFn: async (): Promise<PatronDailyTotalDTO> => {
      if (!casinoId || !patronUuid || !gamingDay) {
        return { totalIn: 0, totalOut: 0, entryCount: 0 };
      }

      const result = await getGamingDaySummary({
        casino_id: casinoId,
        gaming_day: gamingDay,
        patron_uuid: patronUuid,
        limit: 1, // We only need the single patron's summary
      });

      // Find the patron's summary (should be only one with this filter)
      const summary = result.items.find((s) => s.patron_uuid === patronUuid);

      if (!summary) {
        // No MTL entries yet for this patron on this gaming day
        return { totalIn: 0, totalOut: 0, entryCount: 0 };
      }

      return {
        totalIn: summary.total_in,
        totalOut: summary.total_out,
        entryCount: summary.entry_count,
      };
    },
    enabled: hasRequiredParams,
    // 30-second stale time for compliance freshness
    // Transactions may be recorded frequently during active play
    staleTime: 30_000,
    // Refetch when window regains focus (important for compliance)
    refetchOnWindowFocus: true,
    // Auto-refetch every 60 seconds to catch new transactions
    refetchInterval: 60_000,
  });
}
