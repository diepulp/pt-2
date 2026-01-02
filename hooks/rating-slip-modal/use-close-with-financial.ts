/**
 * Close With Financial Mutation Hook
 *
 * Handles closing a rating slip with optional chips-taken recording and loyalty accrual.
 * Combines three operations:
 * 1. Record chips-taken transaction (if chipsTaken > 0)
 * 2. Close the rating slip
 * 3. Trigger loyalty accrual (for non-ghost visits, best-effort)
 *
 * React 19: Uses TanStack Query optimistic updates for immediate UI feedback
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 * @see ISSUE-47B1DFF1 Loyalty accrual integration
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import { playerFinancialKeys } from "@/hooks/player-financial/keys";
import { accrueOnClose } from "@/services/loyalty/http";
import { loyaltyKeys } from "@/services/loyalty/keys";
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
  /** Table ID for targeted activeSlips cache invalidation */
  tableId: string;
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
      // PARALLEL: Fire financial transaction and close slip concurrently
      // These operations are independent - the slip can close even if the financial transaction fails
      const [_, closeResult] = await Promise.all([
        // 1. Record chips-taken transaction (best-effort, don't block close)
        chipsTaken > 0 && playerId
          ? createFinancialTransaction({
              casino_id: casinoId,
              player_id: playerId,
              visit_id: visitId,
              rating_slip_id: slipId,
              amount: chipsTaken * 100, // Convert dollars to cents
              direction: "out",
              source: "pit",
              tender_type: "chips",
              created_by_staff_id: staffId,
            }).catch((err) => {
              console.error(
                "[useCloseWithFinancial] Financial transaction failed:",
                err,
              );
              return null; // Don't fail the close operation
            })
          : Promise.resolve(null),

        // 2. Close the rating slip (critical path - errors propagate)
        closeRatingSlip(
          slipId,
          averageBet ? { average_bet: averageBet } : undefined,
        ),
      ]);

      // 3. Trigger loyalty accrual (ISSUE-47B1DFF1)
      // Fire-and-forget: don't await, non-blocking
      // Only for non-ghost visits (playerId is not null) per ADR-014
      if (playerId) {
        accrueOnClose({
          ratingSlipId: slipId,
          casinoId,
          // Use slipId as idempotency key (already a UUID)
          // RPC dedupes via UNIQUE(casino_id, rating_slip_id) WHERE reason='base_accrual'
          idempotencyKey: slipId,
        }).catch((accrualError) => {
          // Log but don't fail - loyalty accrual is best-effort
          console.warn(
            `[useCloseWithFinancial] Loyalty accrual failed for slip ${slipId}:`,
            accrualError,
          );
        });
      }

      return closeResult;
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
    onSuccess: (_, { slipId, visitId, casinoId, tableId, playerId }) => {
      // TARGETED: Invalidate only this slip's modal data (not all modal queries)
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Invalidate financial summary for this visit
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // ISSUE-DD2C45CA: Targeted cache invalidation to prevent N×2 HTTP cascade
      // Only invalidate this table's active slips - not all slips via .scope
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(tableId),
      });

      // TARGETED: Invalidate tables for this casino only (occupancy changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables(casinoId),
      });

      // Invalidate dashboard stats
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });

      // ISSUE-47B1DFF1: Invalidate loyalty balance and ledger for accrued points
      if (playerId) {
        queryClient.invalidateQueries({
          queryKey: loyaltyKeys.balance(playerId, casinoId),
        });
        // TARGETED: Invalidate only this player's ledger (not all player ledgers)
        queryClient.invalidateQueries({
          queryKey: loyaltyKeys.ledger(playerId, casinoId),
        });
      }
    },
  });
}
