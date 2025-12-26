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
 */
export interface MovePlayerMutationInput {
  /** Current rating slip UUID being closed */
  currentSlipId: string;
  /** Target table UUID */
  destinationTableId: string;
  /** Target seat number (optional, null for unseated) */
  destinationSeatNumber?: string | null;
  /** Optional: final average bet for the current slip being closed */
  averageBet?: number;
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

  return useMutation<MovePlayerResponse, Error, MovePlayerMutationInput>({
    mutationFn: async (input: MovePlayerMutationInput) => {
      const moveInput: MovePlayerInput = {
        destinationTableId: input.destinationTableId,
        destinationSeatNumber: input.destinationSeatNumber,
        averageBet: input.averageBet,
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
      const previousData = queryClient.getQueryData(
        ratingSlipModalKeys.data(currentSlipId),
      );

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
      // Invalidate modal data for the old slip (now closed)
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(variables.currentSlipId),
      });

      // Invalidate modal data for the new slip (force fresh fetch)
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(data.newSlipId),
      });

      // Invalidate all modal queries (in case any are cached)
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.scope,
      });

      // Invalidate dashboard queries to reflect the move
      // Tables query needs refresh (occupancy changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables.scope,
      });

      // Slips queries need refresh (active slips changed at both tables)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips.scope,
      });

      // Stats queries need refresh (may affect table counts)
      queryClient.invalidateQueries({
        predicate: (query) => {
          return (
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === "dashboard" &&
            query.queryKey[1] === "stats"
          );
        },
      });
    },
  });
}

// Re-export types for convenience
export type { MovePlayerInput, MovePlayerResponse };
