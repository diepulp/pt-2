/**
 * Query hook for fetching a single player by ID
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['player', 'detail', id]
 * @staleTime 5 minutes - Player details change infrequently
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { getPlayer } from "@/app/actions/player-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { PlayerDTO } from "@/services/player";

/**
 * Fetches a single player by ID with automatic caching and refetching
 *
 * @param id - Player UUID (undefined disables the query)
 * @returns React Query result with player data
 *
 * @example
 * ```typescript
 * function PlayerProfile({ playerId }: { playerId: string }) {
 *   const { data: player, isLoading, error } = usePlayer(playerId);
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!player) return <div>Player not found</div>;
 *
 *   return <div>{player.firstName} {player.lastName}</div>;
 * }
 * ```
 */
export function usePlayer(id: string | undefined) {
  return useServiceQuery<PlayerDTO>(
    ["player", "detail", id] as const,
    () => getPlayer(id!),
    {
      enabled: !!id, // Only run query if id exists
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );
}
