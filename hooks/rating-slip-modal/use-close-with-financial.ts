/**
 * Close With Financial Mutation Hook
 *
 * Handles closing a rating slip with optional chips-taken recording.
 * Combines two operations:
 * 1. Record chips-taken transaction (if chipsTaken > 0)
 * 2. Close the rating slip
 *
 * React 19: Uses TanStack Query optimistic updates for immediate UI feedback
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import { playerFinancialKeys } from "@/hooks/player-financial/keys";
import { createFinancialTransaction } from "@/services/player-financial/http";
import { closeRatingSlip } from "@/services/rating-slip/http";
import type { RatingSlipModalDTO } from "@/services/rating-slip-modal/dtos";
import { ratingSlipModalKeys } from "@/services/rating-slip-modal/keys";

export interface CloseWithFinancialInput {
  /** Rating slip ID to close */
  slipId: string;
  /** Associated visit ID */
  visitId: string;
  /** Player ID (null for ghost visits - skips chips-taken transaction) */
  playerId: string | null;
  /** Casino ID for transaction recording and cache invalidation */
  casinoId: string;
  /** Staff ID for transaction recording */
  staffId: string;
  /** Chips taken amount in dollars (will be converted to cents) */
  chipsTaken: number;
  /** Optional final average bet to save before closing */
  averageBet?: number;
}

/**
 * Mutation hook for closing a rating slip with optional chips-taken recording.
 *
 * @example
 * ```tsx
 * const closeWithFinancial = useCloseWithFinancial();
 *
 * const handleClose = async () => {
 *   await closeWithFinancial.mutateAsync({
 *     slipId: selectedSlipId,
 *     visitId: modalData.slip.visitId,
 *     playerId: modalData.player?.id ?? null,
 *     casinoId,
 *     staffId,
 *     chipsTaken: Number(formState.chipsTaken),
 *     averageBet: Number(formState.averageBet),
 *   });
 *   // Close modal after successful close
 *   setIsModalOpen(false);
 * };
 * ```
 */
export function useCloseWithFinancial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slipId,
      visitId,
      playerId,
      casinoId,
      staffId,
      chipsTaken,
      averageBet,
    }: CloseWithFinancialInput) => {
      // 1. Record chips-taken transaction if amount > 0 and player exists
      if (chipsTaken > 0 && playerId) {
        await createFinancialTransaction({
          casino_id: casinoId,
          player_id: playerId,
          visit_id: visitId,
          rating_slip_id: slipId,
          amount: chipsTaken * 100, // Convert dollars to cents
          direction: "out",
          source: "pit",
          tender_type: "chips",
          created_by_staff_id: staffId,
        });
      }

      // 2. Close the rating slip (with optional final average_bet)
      return closeRatingSlip(
        slipId,
        averageBet ? { average_bet: averageBet } : undefined,
      );
    },
    onMutate: async ({ slipId }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(
        ratingSlipModalKeys.data(slipId),
      );

      // Optimistically update the slip status to closed
      queryClient.setQueryData(
        ratingSlipModalKeys.data(slipId),
        (old: RatingSlipModalDTO | undefined) => {
          if (!old) return old;
          return {
            ...old,
            slip: {
              ...old.slip,
              status: "closed",
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
          ratingSlipModalKeys.data(variables.slipId),
          context.previousData,
        );
      }
    },
    onSuccess: (_, { slipId, visitId, casinoId }) => {
      // Invalidate all modal queries (this slip is now closed)
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.scope,
      });

      // Invalidate financial summary for this visit
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // Invalidate dashboard tables (occupancy changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables.scope,
      });

      // Invalidate dashboard slips
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips.scope,
      });

      // Invalidate dashboard stats
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });
}
