/**
 * Visit Mutation Hooks
 *
 * Hooks for visit start (check-in) and close (check-out) mutations.
 * All mutations automatically invalidate relevant queries.
 *
 * @see services/visit/http.ts - HTTP fetchers
 * @see services/visit/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CloseVisitDTO, VisitDTO } from '@/services/visit/dtos';
import { closeVisit, startVisit } from '@/services/visit/http';
import { visitKeys } from '@/services/visit/keys';

/**
 * Starts a visit (check-in) for a player.
 * Idempotent - returns existing active visit if one exists.
 * Invalidates visit list and active visit queries on success.
 */
export function useStartVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) => startVisit(playerId),
    onSuccess: (data: VisitDTO, playerId: string) => {
      // Invalidate all visit lists
      queryClient.invalidateQueries({ queryKey: visitKeys.list.scope });
      // Invalidate active visit for this player
      queryClient.invalidateQueries({
        queryKey: visitKeys.activeByPlayer(playerId),
      });
      // Set the detail cache for the new visit
      queryClient.setQueryData(visitKeys.detail(data.id), data);
    },
  });
}

/**
 * Closes a visit (check-out).
 * Idempotent - succeeds if already closed.
 * Invalidates visit list, detail, and active visit queries on success.
 */
export function useCloseVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      visitId,
      input,
    }: {
      visitId: string;
      input?: CloseVisitDTO;
    }) => closeVisit(visitId, input),
    onSuccess: (data: VisitDTO) => {
      // Invalidate all visit lists
      queryClient.invalidateQueries({ queryKey: visitKeys.list.scope });
      // Invalidate active visit for this player (skip for ghost visits with null player_id)
      if (data.player_id) {
        queryClient.invalidateQueries({
          queryKey: visitKeys.activeByPlayer(data.player_id),
        });
      }
      // Update the detail cache
      queryClient.setQueryData(visitKeys.detail(data.id), data);
    },
  });
}

// Re-export types for convenience
export type { CloseVisitDTO, VisitDTO };
