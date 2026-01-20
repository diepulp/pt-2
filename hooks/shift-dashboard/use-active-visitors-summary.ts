/**
 * useActiveVisitorsSummary Hook
 *
 * TanStack Query hook for fetching active visitors summary (rated vs unrated).
 * Used by Floor Activity Donut in Shift Dashboard V2.
 *
 * @see IMPLEMENTATION_STRATEGY.md §5.2 Active Visitors Donut
 */

import { useQuery } from '@tanstack/react-query';

import type { ActiveVisitorsSummaryDTO } from '@/services/table-context/dtos';

import { fetchActiveVisitorsSummary } from './http';
import { shiftDashboardKeys } from './keys';

export interface UseActiveVisitorsSummaryOptions {
  /** Enable/disable the query */
  enabled?: boolean;
}

/**
 * Fetches active visitors summary counts by visit_kind.
 *
 * @returns Query result with rated/unrated visitor counts
 */
export function useActiveVisitorsSummary(
  options: UseActiveVisitorsSummaryOptions = {},
) {
  const { enabled = true } = options;

  return useQuery<ActiveVisitorsSummaryDTO>({
    // Use a new query key scope for visitors
    queryKey: [...shiftDashboardKeys.root, 'visitors-summary'],
    queryFn: fetchActiveVisitorsSummary,
    enabled,
    // Refresh every 30 seconds (more frequent than metrics since this is real-time activity)
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
