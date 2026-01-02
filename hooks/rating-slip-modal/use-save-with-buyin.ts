/**
 * Save With Buy-In Mutation Hook
 *
 * Handles saving average_bet changes and recording new buy-in transactions.
 * Combines two operations:
 * 1. Record buy-in transaction (if newBuyIn > 0)
 * 2. Update average_bet via PATCH endpoint
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
import { updateAverageBet } from "@/services/rating-slip/http";
import type { RatingSlipModalDTO } from "@/services/rating-slip-modal/dtos";
import { ratingSlipModalKeys } from "@/services/rating-slip-modal/keys";

export interface SaveWithBuyInInput {
  /** Rating slip ID */
  slipId: string;
  /** Associated visit ID */
  visitId: string;
  /** Player ID (null for ghost visits - skips buy-in transaction) */
  playerId: string | null;
  /** Casino ID for transaction recording */
  casinoId: string;
  /** Table ID for targeted cache invalidation */
  tableId: string;
  /** Staff ID for transaction recording */
  staffId: string;
  /** New average bet value */
  averageBet: number;
  /** New buy-in amount in dollars (will be converted to cents) */
  newBuyIn: number;
}

/**
 * Mutation hook for saving rating slip changes with optional buy-in recording.
 *
 * @example
 * ```tsx
 * const saveWithBuyIn = useSaveWithBuyIn();
 *
 * const handleSave = async () => {
 *   await saveWithBuyIn.mutateAsync({
 *     slipId: selectedSlipId,
 *     visitId: modalData.slip.visitId,
 *     playerId: modalData.player?.id ?? null,
 *     casinoId,
 *     staffId,
 *     averageBet: Number(formState.averageBet),
 *     newBuyIn: Number(formState.newBuyIn),
 *   });
 * };
 * ```
 */
export function useSaveWithBuyIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slipId,
      visitId,
      playerId,
      casinoId,
      tableId,
      staffId,
      averageBet,
      newBuyIn,
    }: SaveWithBuyInInput) => {
      // PARALLEL: Both operations are independent - run concurrently for 50% faster save
      // Financial transaction can fail independently without blocking average_bet update
      const [_, updateResult] = await Promise.all([
        // 1. Record buy-in transaction (best-effort, don't block update)
        newBuyIn > 0 && playerId
          ? createFinancialTransaction({
              casino_id: casinoId,
              player_id: playerId,
              visit_id: visitId,
              rating_slip_id: slipId,
              amount: newBuyIn * 100, // Convert dollars to cents
              direction: "in",
              source: "pit",
              tender_type: "cash",
              created_by_staff_id: staffId,
            }).catch((err) => {
              console.error(
                "[useSaveWithBuyIn] Financial transaction failed:",
                err,
              );
              return null; // Don't fail the save operation
            })
          : Promise.resolve(null),

        // 2. Update average_bet (critical path - errors propagate)
        updateAverageBet(slipId, { average_bet: averageBet }),
      ]);

      return updateResult;
    },
    onMutate: async ({ slipId, averageBet }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(
        ratingSlipModalKeys.data(slipId),
      );

      // Optimistically update the average bet
      queryClient.setQueryData(
        ratingSlipModalKeys.data(slipId),
        (old: RatingSlipModalDTO | undefined) => {
          if (!old) return old;
          return {
            ...old,
            slip: {
              ...old.slip,
              averageBet,
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
    onSuccess: (_, { slipId, visitId, tableId }) => {
      // Invalidate modal data
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Invalidate financial summary for this visit
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // TARGETED: Invalidate only this table's slips (not all slips via .scope)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(tableId),
      });
    },
  });
}
