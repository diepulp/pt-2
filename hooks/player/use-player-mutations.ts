/**
 * Player Mutation Hooks
 *
 * Hooks for player create, update, and enrollment mutations.
 * All mutations automatically invalidate relevant queries.
 *
 * @see services/player/http.ts - HTTP fetchers
 * @see services/player/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { enrollPlayer, type PlayerEnrollmentDTO } from "@/services/casino/http";
import type {
  CreatePlayerDTO,
  PlayerDTO,
  UpdatePlayerDTO,
} from "@/services/player/dtos";
import {
  createPlayer,
  getPlayerEnrollment,
  updatePlayer,
} from "@/services/player/http";
import { playerKeys } from "@/services/player/keys";

/**
 * Creates a new player.
 * Invalidates the player list on success.
 */
export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlayerDTO) => createPlayer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
    },
  });
}

/**
 * Updates an existing player.
 * Invalidates both list and detail cache on success.
 */
export function useUpdatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playerId,
      input,
    }: {
      playerId: string;
      input: UpdatePlayerDTO;
    }) => updatePlayer(playerId, input),
    onSuccess: (data: PlayerDTO) => {
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
      queryClient.invalidateQueries({ queryKey: playerKeys.detail(data.id) });
    },
  });
}

/**
 * Enrolls a player in the current casino.
 * Idempotent - returns existing enrollment if already enrolled.
 * Invalidates player list and search queries on success.
 */
export function useEnrollPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) => enrollPlayer(playerId),
    onSuccess: (_data: PlayerEnrollmentDTO, playerId: string) => {
      queryClient.invalidateQueries({ queryKey: playerKeys.list.scope });
      queryClient.invalidateQueries({ queryKey: playerKeys.detail(playerId) });
      // Invalidate all search queries since enrollment status changed
      queryClient.invalidateQueries({ queryKey: ["player", "search"] });
    },
  });
}

/**
 * Gets enrollment status for a player.
 * Uses React Query for caching.
 */
export function usePlayerEnrollment(
  playerId: string,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();

  return {
    ...useMutation({
      mutationFn: () => getPlayerEnrollment(playerId),
    }),
    // Provide a query hook alternative for read operations
    getEnrollment: () =>
      queryClient.fetchQuery({
        queryKey: [...playerKeys.detail(playerId), "enrollment"],
        queryFn: () => getPlayerEnrollment(playerId),
        staleTime: 60_000,
      }),
  };
}

// Re-export types for convenience
export type { CreatePlayerDTO, UpdatePlayerDTO, PlayerEnrollmentDTO };
