/**
 * Query hook for fetching all players
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['player', 'list']
 * @staleTime 2 minutes - Lists should be fresher than details
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { getPlayers } from "@/app/actions/player-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { PlayerDTO } from "@/services/player";

/**
 * Fetches all players ordered by lastName (ascending)
 * Returns empty array if no players exist
 *
 * @returns React Query result with player list
 *
 * @example
 * ```typescript
 * function PlayerList() {
 *   const { data: players, isLoading, error } = usePlayers();
 *
 *   if (isLoading) return <div>Loading players...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <ul>
 *       {players?.map(player => (
 *         <li key={player.id}>{player.firstName} {player.lastName}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePlayers() {
  return useServiceQuery<PlayerDTO[]>(
    ["player", "list"] as const,
    () => getPlayers(),
    {
      staleTime: 1000 * 60 * 2, // 2 minutes - fresher for viewing recent changes
    },
  );
}
