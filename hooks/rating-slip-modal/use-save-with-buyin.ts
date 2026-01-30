/**
 * Save With Buy-In Mutation Hook
 *
 * PERF-005 WS7: Single HTTP roundtrip via composite RPC.
 * Replaces sequential PATCH average_bet + POST financial_transaction pattern
 * that caused 4,935ms save-flow latency.
 *
 * Handles:
 * 1. Check compliance thresholds (client-side, pre-mutation)
 * 2. Atomically save average_bet + record buy-in (single HTTP call)
 * 3. Cache invalidation (targeted, not broad .scope)
 *
 * React 19: Uses TanStack Query optimistic updates for immediate UI feedback
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 * @see PRD-MTL-UI-GAPS WS7 Rating Slip Modal Integration
 * @see PERF-005 WS7 Composite Save-with-BuyIn RPC
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import {
  checkCumulativeThreshold,
  notifyThreshold,
} from "@/hooks/mtl/use-threshold-notifications";
import { playerFinancialKeys } from "@/hooks/player-financial/keys";
import { mtlKeys } from "@/services/mtl/keys";
import { saveWithBuyIn } from "@/services/rating-slip/http";
import type { RatingSlipModalDTO } from "@/services/rating-slip-modal/dtos";
import { ratingSlipModalKeys } from "@/services/rating-slip-modal/keys";

export interface SaveWithBuyInInput {
  /** Rating slip ID */
  slipId: string;
  /** Associated visit ID */
  visitId: string;
  /** Player ID (null for ghost visits - skips buy-in transaction) */
  playerId: string | null;
  /** Casino ID for cache invalidation */
  casinoId: string;
  /** Table ID for targeted cache invalidation */
  tableId: string;
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
 * PERF-005 WS7: Uses composite RPC for single-roundtrip save.
 * Atomically updates average_bet and records buy-in in one database transaction.
 *
 * @example
 * ```tsx
 * const saveWithBuyInMutation = useSaveWithBuyIn();
 *
 * const handleSave = async () => {
 *   await saveWithBuyInMutation.mutateAsync({
 *     slipId: selectedSlipId,
 *     visitId: modalData.slip.visitId,
 *     playerId: modalData.player?.id ?? null,
 *     casinoId,
 *     tableId,
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

      // Step 2: PERF-005 WS7 — Single HTTP call via composite RPC
      // Atomically: UPDATE average_bet + INSERT financial_transaction
      // Replaces sequential PATCH → POST pattern (4,935ms → ~2,500ms)
      const result = await saveWithBuyIn(slipId, {
        average_bet: averageBet,
        buyin_amount_cents: newBuyIn > 0 ? Math.round(newBuyIn * 100) : null,
        buyin_type: "cash",
      });

      // NOTE: MTL entry creation is handled automatically by the forward bridge
      // trigger (fn_derive_mtl_from_finance) when a financial transaction is inserted.
      // No explicit MTL creation needed here. See ISSUE-FB8EB717.

      return { ...result, thresholdResult };
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

      // Forward bridge trigger creates MTL entries from financial transactions.
      // Invalidate MTL caches when threshold was met (for UI badge updates).
      if (result.thresholdResult?.shouldCreateMtl && playerId) {
        // Invalidate gaming day summary (aggregates changed)
        queryClient.invalidateQueries({
          queryKey: mtlKeys.gamingDaySummary.scope,
        });

        // Invalidate patron daily total (PERF-005: use key factory)
        queryClient.invalidateQueries({
          queryKey: mtlKeys.patronDailyTotal(casinoId, playerId),
        });
      }
    },
  });
}
