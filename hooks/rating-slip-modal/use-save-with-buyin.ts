/**
 * Save With Buy-In Mutation Hook
 *
 * Handles saving average_bet changes and recording new buy-in transactions.
 * Combines two operations:
 * 1. Record buy-in transaction (if newBuyIn > 0)
 * 2. Update average_bet via PATCH endpoint
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import { playerFinancialKeys } from "@/hooks/player-financial/keys";
import { createFinancialTransaction } from "@/services/player-financial/http";
import { updateAverageBet } from "@/services/rating-slip/http";
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
      staffId,
      averageBet,
      newBuyIn,
    }: SaveWithBuyInInput) => {
      // 1. Record buy-in transaction if new amount entered and player exists
      if (newBuyIn > 0 && playerId) {
        await createFinancialTransaction({
          casino_id: casinoId,
          player_id: playerId,
          visit_id: visitId,
          rating_slip_id: slipId,
          amount: newBuyIn * 100, // Convert dollars to cents
          direction: "in",
          source: "pit",
          tender_type: "cash",
          created_by_staff_id: staffId,
        });
      }

      // 2. Update average_bet
      return updateAverageBet(slipId, { average_bet: averageBet });
    },
    onSuccess: (_, { slipId, visitId }) => {
      // Invalidate modal data
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Invalidate financial summary for this visit
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // Invalidate dashboard slips
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips.scope,
      });
    },
  });
}
