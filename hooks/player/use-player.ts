/**
 * Player Query Hooks
 *
 * Hooks for fetching player list and detail data.
 *
 * @see services/player/http.ts - HTTP fetchers
 * @see services/player/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useQuery } from "@tanstack/react-query";

import type { PlayerDTO, PlayerListFilters } from "@/services/player/dtos";
import { getPlayer, getPlayers } from "@/services/player/http";
import { playerKeys } from "@/services/player/keys";

/**
 * Fetches a paginated list of players.
 *
 * @param filters - Optional filters for status, cursor, limit, search
 */
export function usePlayers(filters: PlayerListFilters = {}) {
  return useQuery({
    queryKey: playerKeys.list(filters),
    queryFn: () => getPlayers(filters),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetches a single player by ID.
 *
 * @param playerId - Player UUID
 */
export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: () => getPlayer(playerId),
    enabled: !!playerId,
    staleTime: 60_000, // 1 minute
  });
}

// Re-export types for convenience
export type { PlayerDTO, PlayerListFilters };
