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

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardKeys } from '@/hooks/dashboard/keys';
import { accrueOnClose } from '@/services/loyalty/http';
import { loyaltyKeys } from '@/services/loyalty/keys';
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';
import type { RatingSlipModalDTO } from '@/services/rating-slip-modal/dtos';
import type {
  MovePlayerInput,
  MovePlayerResponse,
} from '@/services/rating-slip-modal/http';
import { movePlayer } from '@/services/rating-slip-modal/http';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

/**
 * Mutation input for moving a player.
 * Includes the current slip ID and the destination details.
 *
 * PRD-020: Added sourceTableId and casinoId for targeted cache invalidation
 * ISSUE-752833A6: Added playerId for loyalty accrual on move
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
  /** Casino ID (for stats invalidation and loyalty accrual) */
  casinoId?: string;
  /** Player ID (null for ghost visits - needed for loyalty accrual) */
  playerId?: string | null;
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
/**
 * Context for rollback on error.
 */
interface MovePlayerContext {
  previousModalData: RatingSlipModalDTO | undefined;
  previousSourceSlips: RatingSlipDTO[] | undefined;
  previousDestSlips: RatingSlipDTO[] | undefined;
}

export function useMovePlayer() {
  const queryClient = useQueryClient();

  return useMutation<
    MovePlayerResponse,
    Error,
    MovePlayerMutationInput,
    MovePlayerContext
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
      sourceTableId,
      destinationTableId,
      destinationSeatNumber,
    }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ratingSlipModalKeys.data(currentSlipId),
      });
      await queryClient.cancelQueries({
        queryKey: dashboardKeys.activeSlips(sourceTableId),
      });
      if (sourceTableId !== destinationTableId) {
        await queryClient.cancelQueries({
          queryKey: dashboardKeys.activeSlips(destinationTableId),
        });
      }

      // Snapshot previous values for rollback
      const previousModalData = queryClient.getQueryData<
        RatingSlipModalDTO | undefined
      >(ratingSlipModalKeys.data(currentSlipId));

      const previousSourceSlips = queryClient.getQueryData<RatingSlipDTO[]>(
        dashboardKeys.activeSlips(sourceTableId),
      );

      const previousDestSlips =
        sourceTableId !== destinationTableId
          ? queryClient.getQueryData<RatingSlipDTO[]>(
              dashboardKeys.activeSlips(destinationTableId),
            )
          : undefined;

      // Optimistically update the modal slip data
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

      // Optimistically update source table's activeSlips
      // BUG FIX: Move operation ALWAYS closes the old slip and creates a new one,
      // even for same-table seat changes. We must remove the old slip from cache
      // to prevent user from clicking on a closed slip before refetch completes.
      queryClient.setQueryData(
        dashboardKeys.activeSlips(sourceTableId),
        (old: RatingSlipDTO[] | undefined) => {
          if (!old) return old;
          // Remove the old slip - it will be replaced by newSlip after refetch
          return old.filter((slip) => slip.id !== currentSlipId);
        },
      );

      // Return context for rollback
      return { previousModalData, previousSourceSlips, previousDestSlips };
    },
    onError: (_err, variables, context) => {
      // Rollback modal data on error
      if (context?.previousModalData) {
        queryClient.setQueryData(
          ratingSlipModalKeys.data(variables.currentSlipId),
          context.previousModalData,
        );
      }
      // Rollback source table's activeSlips on error
      if (context?.previousSourceSlips) {
        queryClient.setQueryData(
          dashboardKeys.activeSlips(variables.sourceTableId),
          context.previousSourceSlips,
        );
      }
      // Rollback destination table's activeSlips on error (if different table)
      if (context?.previousDestSlips) {
        queryClient.setQueryData(
          dashboardKeys.activeSlips(variables.destinationTableId),
          context.previousDestSlips,
        );
      }
    },
    onSuccess: (data: MovePlayerResponse, variables, context) => {
      // OPTIMISTIC UX: Immediately add new slip to destination table cache
      // This provides instant feedback before the background refetch completes.
      // Construct a minimal RatingSlipDTO from response + previous slip data.
      const previousSlip = context?.previousSourceSlips?.find(
        (s) => s.id === variables.currentSlipId,
      );

      if (previousSlip) {
        const newSlipDTO: RatingSlipDTO = {
          id: data.newSlipId,
          casino_id: previousSlip.casino_id,
          visit_id: previousSlip.visit_id,
          table_id: data.newSlip.tableId,
          seat_number: data.newSlip.seatNumber,
          start_time: data.newSlip.startTime,
          end_time: null,
          status: data.newSlip.status as RatingSlipDTO['status'],
          average_bet: variables.averageBet ?? previousSlip.average_bet,
          game_settings: previousSlip.game_settings,
          policy_snapshot: previousSlip.policy_snapshot,
          previous_slip_id: data.closedSlipId,
          move_group_id: data.moveGroupId,
          accumulated_seconds: data.accumulatedSeconds,
          final_duration_seconds: null,
        };

        // Add new slip to destination table cache immediately
        queryClient.setQueryData(
          dashboardKeys.activeSlips(variables.destinationTableId),
          (old: RatingSlipDTO[] | undefined) => {
            if (!old) return [newSlipDTO];
            // Add new slip if not already present
            if (old.some((s) => s.id === newSlipDTO.id)) return old;
            return [...old, newSlipDTO];
          },
        );
      }

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

      // ISSUE-752833A6: Trigger loyalty accrual for the CLOSED slip
      // The move operation closes one slip and opens another - we must accrue
      // points for the closed slip's play time to prevent "loyalty wipe" on move.
      // Fire-and-forget: don't await, non-blocking (best-effort)
      if (variables.playerId && variables.casinoId) {
        accrueOnClose({
          ratingSlipId: data.closedSlipId,
          casinoId: variables.casinoId,
          // Use closedSlipId as idempotency key (already a UUID)
          // RPC dedupes via UNIQUE(casino_id, rating_slip_id) WHERE reason='base_accrual'
          idempotencyKey: data.closedSlipId,
        }).catch((accrualError) => {
          // Log but don't fail - loyalty accrual is best-effort
          console.warn(
            `[useMovePlayer] Loyalty accrual failed for closed slip ${data.closedSlipId}:`,
            accrualError,
          );
        });

        // Invalidate loyalty balance and ledger for the player
        queryClient.invalidateQueries({
          queryKey: loyaltyKeys.balance(variables.playerId, variables.casinoId),
        });
        queryClient.invalidateQueries({
          queryKey: loyaltyKeys.ledger(variables.playerId, variables.casinoId),
        });
      }

      // NOTE: Modal queries NOT invalidated - modal closes after move (PRD-020)
      // NOTE: tables.scope NOT invalidated - prevents full re-render cascade
    },
  });
}

// Re-export types for convenience
export type { MovePlayerInput, MovePlayerResponse };
