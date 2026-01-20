/**
 * Closed Slips for Gaming Day Hook
 *
 * React Query hook for fetching closed terminal rating slips for the current gaming day.
 * Used by the "Start From Previous" panel to display completed sessions.
 *
 * ISSUE-SFP-001 Fix: Uses useInfiniteQuery with keyset pagination.
 * Only returns terminal slips (excludes intermediate move slips).
 *
 * @see PRD-020 Closed Sessions Panel
 * @see EXEC-SPEC-START-FROM-PREVIOUS-FIX.md
 */

import { useInfiniteQuery } from '@tanstack/react-query';

import {
  fetchClosedSlipsForGamingDay,
  type ClosedSlipCursor,
} from '@/services/rating-slip/http';
import { ratingSlipKeys } from '@/services/rating-slip/keys';

/**
 * Hook for fetching closed terminal rating slips for the current gaming day.
 * Uses infinite query with keyset pagination for "Load More" capability.
 *
 * ISSUE-SFP-001: Fixed pagination bugs:
 * - Uses keyset cursor (endTime, id) for stable pagination
 * - Filters at database level (not in-memory)
 * - Only returns terminal slips
 *
 * @param casinoId - Casino UUID for query key
 * @param gamingDay - Gaming day string (YYYY-MM-DD), or undefined if not yet loaded
 * @param options - Optional limit per page (default 50)
 * @returns Infinite query result with pages of closed slips
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   isLoading,
 *   error,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useClosedSlipsForGamingDay(casinoId, gamingDay);
 *
 * // Flatten pages to get all items
 * const closedSlips = data?.pages.flatMap(page => page.items) ?? [];
 *
 * // Load more button
 * {hasNextPage && (
 *   <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
 *     {isFetchingNextPage ? 'Loading...' : 'Load More'}
 *   </Button>
 * )}
 * ```
 */
export function useClosedSlipsForGamingDay(
  casinoId: string,
  gamingDay: string | undefined,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 50;

  return useInfiniteQuery({
    queryKey: ratingSlipKeys.closedToday(casinoId, gamingDay ?? ''),
    queryFn: ({ pageParam }) =>
      fetchClosedSlipsForGamingDay({
        limit,
        cursor: pageParam ?? null,
      }),
    initialPageParam: null as ClosedSlipCursor | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!casinoId && !!gamingDay,
    staleTime: 30_000, // 30 seconds
  });
}
