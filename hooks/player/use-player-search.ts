/**
 * Player Search Hook
 *
 * Debounced search hook for player lookup with enrollment status.
 * Uses 300ms debounce to avoid excessive API calls.
 *
 * @see services/player/http.ts - HTTP fetchers
 * @see services/player/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";

import type { PlayerSearchResultDTO } from "@/services/player/dtos";
import { searchPlayers } from "@/services/player/http";
import { playerKeys } from "@/services/player/keys";

export interface UsePlayerSearchOptions {
  /** Minimum query length to trigger search (default: 2) */
  minLength?: number;
  /** Maximum results to return (default: 20) */
  limit?: number;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

export interface UsePlayerSearchResult {
  /** Search results */
  data: PlayerSearchResultDTO[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Fetching state (including background refetch) */
  isFetching: boolean;
}

/**
 * Hook for debounced player search by name.
 *
 * Uses React's useDeferredValue for automatic debouncing without
 * external debounce libraries. This integrates naturally with
 * concurrent rendering and provides a smooth UX.
 *
 * @param query - Search query string
 * @param options - Search options
 * @returns Search results with loading state
 *
 * @example
 * ```tsx
 * function PlayerSearchInput() {
 *   const [query, setQuery] = useState('');
 *   const { data, isLoading } = usePlayerSearch(query);
 *
 *   return (
 *     <div>
 *       <input value={query} onChange={e => setQuery(e.target.value)} />
 *       {isLoading ? <Spinner /> : (
 *         <ul>
 *           {data.map(player => (
 *             <li key={player.id}>{player.full_name}</li>
 *           ))}
 *         </ul>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerSearch(
  query: string,
  options: UsePlayerSearchOptions = {},
): UsePlayerSearchResult {
  const { minLength = 2, limit = 20, enabled = true } = options;

  // Use deferred value for natural debouncing
  const deferredQuery = useDeferredValue(query);

  // Check if query meets minimum length
  const shouldSearch = useMemo(
    () => enabled && deferredQuery.trim().length >= minLength,
    [enabled, deferredQuery, minLength],
  );

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: playerKeys.search(deferredQuery),
    queryFn: () => searchPlayers(deferredQuery, limit),
    enabled: shouldSearch,
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  });

  return {
    data: data ?? [],
    isLoading: shouldSearch && isLoading,
    error: error instanceof Error ? error : null,
    isFetching,
  };
}
