/**
 * Player Exclusion Hooks
 *
 * React Query hooks for exclusion status, lists, and mutations.
 * All queries use staleTime: 30_000 (codebase convention).
 * Mutations invalidate list, active, and status keys for the affected player.
 *
 * @see services/player/exclusion-http.ts - HTTP fetchers
 * @see services/player/exclusion-keys.ts - Query key factory
 * @see PRD-052 Player Exclusion UI Surface
 * @see EXEC-052 WS2
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateExclusionInput,
  ExclusionStatusDTO,
  LiftExclusionInput,
  PlayerExclusionDTO,
} from '@/services/player/exclusion-dtos';
import {
  createExclusion,
  getActiveExclusions,
  getExclusionStatus,
  liftExclusion,
  listExclusions,
} from '@/services/player/exclusion-http';
import { exclusionKeys } from '@/services/player/exclusion-keys';

/**
 * Fetches collapsed exclusion status for a player.
 * Returns one of: blocked, alert, watchlist, clear.
 */
export function useExclusionStatus(playerId: string) {
  return useQuery<ExclusionStatusDTO>({
    queryKey: exclusionKeys.status(playerId),
    queryFn: () => getExclusionStatus(playerId),
    enabled: !!playerId,
    staleTime: 30_000,
  });
}

/**
 * Fetches all exclusions for a player (including lifted).
 */
export function useExclusions(playerId: string) {
  return useQuery<PlayerExclusionDTO[]>({
    queryKey: exclusionKeys.list(playerId),
    queryFn: () => listExclusions(playerId),
    enabled: !!playerId,
    staleTime: 30_000,
  });
}

/**
 * Fetches active exclusions for a player (not lifted, temporally valid).
 */
export function useActiveExclusions(playerId: string) {
  return useQuery<PlayerExclusionDTO[]>({
    queryKey: exclusionKeys.active(playerId),
    queryFn: () => getActiveExclusions(playerId),
    enabled: !!playerId,
    staleTime: 30_000,
  });
}

/**
 * Creates a new exclusion.
 * Invalidates list, active, and status keys for the affected player.
 */
export function useCreateExclusion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playerId,
      input,
    }: {
      playerId: string;
      input: Omit<CreateExclusionInput, 'player_id'>;
    }) => createExclusion(playerId, input),
    onSuccess: (_data: PlayerExclusionDTO, { playerId }) => {
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.list(playerId),
      });
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.active(playerId),
      });
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.status(playerId),
      });
    },
  });
}

/**
 * Lifts (soft-deletes) an exclusion. Admin only.
 * Invalidates list, active, and status keys for the affected player.
 */
export function useLiftExclusion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playerId,
      exclusionId,
      input,
    }: {
      playerId: string;
      exclusionId: string;
      input: LiftExclusionInput;
    }) => liftExclusion(playerId, exclusionId, input),
    onSuccess: (_data: PlayerExclusionDTO, { playerId }) => {
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.list(playerId),
      });
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.active(playerId),
      });
      queryClient.invalidateQueries({
        queryKey: exclusionKeys.status(playerId),
      });
    },
  });
}
