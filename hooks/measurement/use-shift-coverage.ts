/**
 * useShiftCoverage Hook
 *
 * React Query hook for fetching per-table rating coverage data
 * from measurement_rating_coverage_v (MEAS-003).
 *
 * Data sources:
 * - casinoId: useAuth().casinoId (JWT app_metadata)
 * - gamingDay: useGamingDay() from hooks/casino/
 *
 * @see PRD-049 WS1 — Shift Dashboard Coverage Widget
 * @see EXEC-049 WS1 — Coverage Widget
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { RatingCoverageQueryResult } from '@/services/measurement/queries';
import { queryRatingCoverage } from '@/services/measurement/queries';

import { measurementKeys } from './keys';

/**
 * Fetch per-table rating coverage for the shift dashboard coverage widget.
 *
 * - staleTime: 30s (MEAS-003: Derived Operational, Cached 30s freshness)
 * - refetchOnWindowFocus: true (refresh when tab regains focus)
 * - placeholderData: keepPreviousData (smooth transitions on gamingDay change)
 */
export function useShiftCoverage(casinoId: string, gamingDay?: string) {
  return useQuery<RatingCoverageQueryResult>({
    queryKey: measurementKeys.coverage(casinoId, gamingDay),
    queryFn: () => {
      const supabase = createBrowserComponentClient();
      return queryRatingCoverage(supabase, casinoId, { gamingDay });
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: Boolean(casinoId && gamingDay),
    placeholderData: keepPreviousData,
  });
}
