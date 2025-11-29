/**
 * Rating Slip Duration Hook
 *
 * TanStack Query hook for fetching rating slip duration with live refresh.
 * Calls RPC directly via Supabase client for real-time duration updates.
 */

import { useQuery } from "@tanstack/react-query";

import { createBrowserComponentClient } from "@/lib/supabase/client";
import { getDuration, ratingSlipKeys } from "@/services/rating-slip";

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Rating slip duration query with live refresh
 *
 * Fetches active play duration (excludes paused time) and refreshes
 * every 10 seconds for live display.
 *
 * @param ratingSlipId - Rating slip ID to fetch duration for
 * @param enabled - Whether the query should run (default: true)
 * @param asOf - Optional timestamp to calculate duration as of (ISO-8601)
 *
 * @example
 * const { data: durationSeconds, isLoading } = useRatingSlipDuration('slip-123');
 *
 * @example
 * // Conditional fetching
 * const { data } = useRatingSlipDuration(slipId, slip?.status === 'open');
 */
export function useRatingSlipDuration(
  ratingSlipId: string,
  enabled = true,
  asOf?: string,
) {
  return useQuery({
    queryKey: ratingSlipKeys.duration(ratingSlipId),

    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      return getDuration(supabase, ratingSlipId, asOf);
    },

    // Only fetch if enabled and ratingSlipId is provided
    enabled: enabled && !!ratingSlipId,

    // Live refresh configuration
    refetchInterval: 10_000, // Refresh every 10 seconds
    staleTime: 5_000, // Consider data stale after 5 seconds

    // Retry configuration
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: 1000, // Wait 1 second between retries
  });
}
