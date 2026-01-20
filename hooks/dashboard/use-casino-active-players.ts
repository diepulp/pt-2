/**
 * Casino-Wide Active Players Hook
 *
 * Fetches active players across all tables in the casino.
 * Used by the Activity Panel for casino-wide player lookup.
 *
 * @see GAP-ACTIVITY-PANEL-CASINO-WIDE
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { ActivePlayerForDashboardDTO } from '@/services/rating-slip/dtos';

import { dashboardKeys } from './keys';

/**
 * Response shape from the active players API endpoint.
 */
interface CasinoActivePlayersResponse {
  items: ActivePlayerForDashboardDTO[];
  count: number;
}

/**
 * Options for the casino active players query.
 */
export interface UseCasinoActivePlayersOptions {
  /** Search filter for player name (first or last) */
  search?: string;
  /** Max results (default 100, max 200) */
  limit?: number;
  /** Whether to enable the query (default true) */
  enabled?: boolean;
}

/**
 * Fetches active players from the API endpoint.
 *
 * @param options - Search and limit options
 * @returns Promise with items and count
 */
async function fetchCasinoActivePlayers(
  options?: Pick<UseCasinoActivePlayersOptions, 'search' | 'limit'>,
): Promise<CasinoActivePlayersResponse> {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  if (options?.limit) params.set('limit', options.limit.toString());

  const url = `/api/v1/rating-slips/active-players${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  const json = await response.json();

  if (!json.ok) {
    throw new Error(json.error ?? 'Failed to fetch active players');
  }

  return json.data as CasinoActivePlayersResponse;
}

/**
 * Fetches all active (open/paused) players across the casino.
 *
 * Used by the Activity Panel for casino-wide player lookup with:
 * - Search by player name
 * - Configurable result limit
 * - 15s stale time with window focus refresh
 *
 * @param options - Search, limit, and enabled options
 *
 * @example
 * ```tsx
 * // Get all active players (default limit 100)
 * const { data, isLoading } = useCasinoActivePlayers();
 *
 * // Search for players named "John"
 * const { data } = useCasinoActivePlayers({ search: 'John' });
 *
 * // Limit to 50 results
 * const { data } = useCasinoActivePlayers({ limit: 50 });
 * ```
 */
export function useCasinoActivePlayers(
  options: UseCasinoActivePlayersOptions = {},
) {
  const { search, limit, enabled = true } = options;

  return useQuery({
    queryKey: dashboardKeys.casinoActivePlayers({ search, limit }),
    queryFn: () => fetchCasinoActivePlayers({ search, limit }),
    enabled,
    staleTime: 15_000, // 15 seconds - players move/change frequently
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });
}
