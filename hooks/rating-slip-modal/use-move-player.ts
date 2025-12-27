/**
 * Move Player Mutation Hook
 *
 * TanStack Query mutation hook for moving a player to a different table/seat.
 * Orchestrates closing current slip and starting new slip at destination.
 *
 * React 19: Uses TanStack Query optimistic updates for immediate UI feedback
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS5
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import type { RatingSlipModalDTO } from "@/services/rating-slip-modal/dtos";
import type {
  MovePlayerInput,
  MovePlayerResponse,
} from "@/services/rating-slip-modal/http";
import { movePlayer } from "@/services/rating-slip-modal/http";
import { ratingSlipModalKeys } from "@/services/rating-slip-modal/keys";

/**
 * Mutation input for moving a player.
 * Includes the current slip ID and the destination details.
 *
 * PRD-020: Added sourceTableId and casinoId for targeted cache invalidation
 */
export interface MovePlayerMutationInput {
  /** Current rating slip UUID being closed */
  currentSlipId: string;
  /** Source table UUID (for targeted cache invalidation) */
  sourceTableId: string;
  /** Target table UUID */
  destinationTableId: string;
  /** Target seat number (optional, null for unseated) */
  destinationSeatNumber?: string | null;
  /** Optional: final average bet for the current slip being closed */
  averageBet?: number;
  /** Casino ID (for stats invalidation) */
  casinoId?: string;
}

/**
 * Moves a player from current table/seat to a new table/seat.
 *
 * This mutation:
 * 1. Validates destination seat is available
 * 2. Closes the current rating slip
 * 3. Starts a new rating slip at destination with same visit_id
 *
 * Cache invalidation strategy:
 * - Invalidates modal data for current slip (it's now closed)
 * - Invalidates all dashboard queries (tables, slips, stats) to reflect the move
 *
 * @returns TanStack Query mutation hook
 *
 * @example
 * ```tsx
 * function MovePlayerButton({ currentSlipId, destinationTableId, seatNumber }: Props) {
 *   const movePlayerMutation = useMovePlayer();
 *
 *   const handleMove = async () => {
 *     try {
 *       const result = await movePlayerMutation.mutateAsync({
 *         currentSlipId,
 *         destinationTableId,
 *         destinationSeatNumber: seatNumber,
 *         averageBet: 25,
 *       });
 *
 *       // Modal can now refresh with the new slip ID
 *       console.log('Moved to new slip:', result.newSlipId);
 *     } catch (error) {
 *       console.error('Move failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleMove} disabled={movePlayerMutation.isPending}>
 *       {movePlayerMutation.isPending ? 'Moving...' : 'Move Player'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useMovePlayer() {
  const queryClient = useQueryClient();

  return useMutation<
    MovePlayerResponse,
    Error,
    MovePlayerMutationInput,
    { previousData: RatingSlipModalDTO | undefined }
  >({
    mutationFn: async (input: MovePlayerMutationInput) => {
      // Only include averageBet if it's positive (schema requires positive if provided)
      const moveInput: MovePlayerInput = {
        destinationTableId: input.destinationTableId,
        destinationSeatNumber: input.destinationSeatNumber,
        ...(input.averageBet && input.averageBet > 0
          ? { averageBet: input.averageBet }
          : {}),
      };

      return movePlayer(input.currentSlipId, moveInput);
    },
    onMutate: async ({
      currentSlipId,
      destinationTableId,
      destinationSeatNumber,
    }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ratingSlipModalKeys.data(currentSlipId),
      });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData<
        RatingSlipModalDTO | undefined
      >(ratingSlipModalKeys.data(currentSlipId));

      // Optimistically update the slip to show move in progress
      queryClient.setQueryData(
        ratingSlipModalKeys.data(currentSlipId),
        (old: RatingSlipModalDTO | undefined) => {
          if (!old) return old;
          return {
            ...old,
            slip: {
              ...old.slip,
              tableId: destinationTableId,
              seatNumber: destinationSeatNumber,
            },
          };
        },
      );

      // Return context for rollback
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          ratingSlipModalKeys.data(variables.currentSlipId),
          context.previousData,
        );
      }
    },
    onSuccess: (data: MovePlayerResponse, variables) => {
      // PRD-020: Targeted cache invalidation (reduces 12+ requests to ~4)
      // Only invalidate the specific tables affected by the move

      // 1. Invalidate active slips for SOURCE table only
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(variables.sourceTableId),
      });

      // 2. Invalidate active slips for DESTINATION table only
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(variables.destinationTableId),
      });

      // 3. Invalidate slips queries for source and destination tables
      // (uses the serialized filter key pattern)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips(variables.sourceTableId),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips(variables.destinationTableId),
      });

      // 4. Invalidate stats if casinoId provided (counts may change)
      if (variables.casinoId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.stats(variables.casinoId),
        });
      }

      // NOTE: Modal queries NOT invalidated - modal closes after move (PRD-020)
      // NOTE: tables.scope NOT invalidated - prevents full re-render cascade
    },
  });
}

// Re-export types for convenience
export type { MovePlayerInput, MovePlayerResponse };
