/**
 * Query hook for searching players by name or email
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['player', 'search', query]
 * @staleTime 30 seconds - Search results stale quickly
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { searchPlayers } from "@/app/actions/player-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { PlayerDTO } from "@/services/player";

/**
 * Searches players by firstName, lastName, or email (case-insensitive)
 * Query is disabled for strings < 2 characters to avoid excessive database queries
 *
 * @param query - Search query string (min 2 characters)
 * @returns React Query result with matching players
 *
 * @example
 * ```typescript
 * function PlayerSearch() {
 *   const [searchQuery, setSearchQuery] = useState('');
 *   const { data: players, isLoading } = usePlayerSearch(searchQuery);
 *
 *   return (
 *     <div>
 *       <input
 *         value={searchQuery}
 *         onChange={(e) => setSearchQuery(e.target.value)}
 *         placeholder="Search players..."
 *       />
 *       {isLoading && <div>Searching...</div>}
 *       {players?.map(player => (
 *         <div key={player.id}>{player.firstName} {player.lastName}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerSearch(query: string) {
  return useServiceQuery<PlayerDTO[]>(
    ["player", "search", query] as const,
    () => searchPlayers(query),
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1000 * 30, // 30 seconds - search results change quickly
    },
  );
}
