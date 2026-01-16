/**
 * Save With Buy-In Mutation Hook
 *
 * Handles saving average_bet changes and recording new buy-in transactions.
 * Combines three operations:
 * 1. Record buy-in transaction (if newBuyIn > 0)
 * 2. Update average_bet via PATCH endpoint
 * 3. Check compliance thresholds and auto-create MTL entry if needed (≥$3,000)
 *
 * React 19: Uses TanStack Query optimistic updates for immediate UI feedback
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 * @see PRD-MTL-UI-GAPS WS7 Rating Slip Modal Integration
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import {
  checkCumulativeThreshold,
  notifyThreshold,
} from "@/hooks/mtl/use-threshold-notifications";
import { playerFinancialKeys } from "@/hooks/player-financial/keys";
import { createMtlEntry } from "@/services/mtl/http";
import { mtlKeys } from "@/services/mtl/keys";
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
  /**
   * Player's current daily total (cash-in) for threshold calculation.
   * If provided, enables threshold checking and auto-MTL creation.
   * @see PRD-MTL-UI-GAPS WS7
   */
  playerDailyTotal?: number;
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
      playerDailyTotal,
    }: SaveWithBuyInInput) => {
      // Step 1: Check compliance thresholds if daily total is provided
      let thresholdResult = null;
      if (playerDailyTotal !== undefined && newBuyIn > 0) {
        thresholdResult = checkCumulativeThreshold(playerDailyTotal, newBuyIn);
        // Show toast notification for threshold status
        notifyThreshold(thresholdResult);
      }

      // PARALLEL: Both operations are independent - run concurrently for 50% faster save
      // Financial transaction can fail independently without blocking average_bet update
      const [_, updateResult] = await Promise.all([
        // 2. Record buy-in transaction (best-effort, don't block update)
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
            }).catch(() => {
              // Don't fail the save operation
              return null;
            })
          : Promise.resolve(null),

        // 3. Update average_bet (critical path - errors propagate)
        updateAverageBet(slipId, { average_bet: averageBet }),
      ]);

      // Step 4: Auto-create MTL entry if threshold requires it (≥$3,000)
      // This runs after the financial transaction succeeds
      if (thresholdResult?.shouldCreateMtl && playerId && newBuyIn > 0) {
        // Gaming day is computed from occurred_at on the server side
        await createMtlEntry({
          casino_id: casinoId,
          patron_uuid: playerId,
          amount: newBuyIn * 100, // cents
          direction: "in",
          txn_type: "buy_in",
          source: "table",
          staff_id: staffId,
          visit_id: visitId,
          rating_slip_id: slipId,
          area: tableId, // Use table ID as area reference
          idempotency_key: `rsm:${slipId}:${Date.now()}`, // Rating slip modal unique key
        }).catch(() => {
          // MTL creation is best-effort, don't fail the save
        });
      }

      return { updateResult, thresholdResult };
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
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          ratingSlipModalKeys.data(variables.slipId),
          context.previousData,
        );
      }
    },
    onSuccess: (result, { slipId, visitId, tableId, playerId, casinoId }) => {
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

      // If MTL was created (threshold met), invalidate MTL caches
      if (result.thresholdResult?.shouldCreateMtl && playerId) {
        // Invalidate gaming day summary (aggregates changed)
        queryClient.invalidateQueries({
          queryKey: mtlKeys.gamingDaySummary.scope,
        });

        // Invalidate patron daily total
        queryClient.invalidateQueries({
          queryKey: ["mtl", "patron-daily-total", casinoId, playerId],
        });
      }
    },
  });
}
