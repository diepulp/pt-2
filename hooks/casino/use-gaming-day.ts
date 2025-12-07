/**
 * Gaming Day Query Hook
 *
 * Hook for computing the current gaming day for the authenticated user's casino.
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 */

import { useQuery } from '@tanstack/react-query';

import { getGamingDay } from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

/**
 * Computes the gaming day for a given timestamp.
 * Uses the compute_gaming_day RPC on the server.
 *
 * @param timestamp - Optional ISO 8601 timestamp (defaults to 'now')
 * @param options - Additional query options
 */
export function useGamingDay(
  timestamp?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: casinoKeys.gamingDay(timestamp),
    queryFn: () => getGamingDay(timestamp),
    staleTime: 1000 * 60 * 5, // 5 minutes - gaming day doesn't change often
    enabled: options?.enabled ?? true,
  });
}
