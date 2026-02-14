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

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardKeys } from '@/hooks/dashboard/keys';
import {
  checkCumulativeThreshold,
  notifyThreshold,
} from '@/hooks/mtl/use-threshold-notifications';
import { playerFinancialKeys } from '@/hooks/player-financial/keys';
import { DomainError } from '@/lib/errors/domain-errors';
import { getErrorMessage, logError } from '@/lib/errors/error-utils';
import { mtlKeys } from '@/services/mtl/keys';
import { createFinancialTransaction } from '@/services/player-financial/http';
import { updateAverageBet } from '@/services/rating-slip/http';
import type { RatingSlipModalDTO } from '@/services/rating-slip-modal/dtos';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

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

      // SEQUENTIAL: Update average_bet first, then record buy-in if successful
      // FIX: Previously parallel operations caused double-entry bug when average_bet
      // validation failed but financial transaction already committed.
      // Now we only record buy-in AFTER average_bet update succeeds.

      // Step 2: Update average_bet (critical path - errors propagate)
      const updateResult = await updateAverageBet(slipId, {
        average_bet: averageBet,
      });

      // Step 3: Record buy-in transaction (only after average_bet succeeds)
      // GAP-ADR-026-UI-SHIPPABLE Patch C: If buy-in fails, save must fail
      if (newBuyIn > 0 && playerId) {
        try {
          await createFinancialTransaction({
            casino_id: casinoId,
            player_id: playerId,
            visit_id: visitId,
            rating_slip_id: slipId,
            amount: newBuyIn * 100, // Convert dollars to cents
            direction: 'in',
            source: 'pit',
            tender_type: 'cash',
            created_by_staff_id: staffId,
          });
        } catch (txnError) {
          // Check for STALE_GAMING_DAY_CONTEXT error
          const errorMessage = getErrorMessage(txnError);
          if (errorMessage.includes('STALE_GAMING_DAY_CONTEXT')) {
            // Re-throw with domain error for caller to handle context refresh
            throw new DomainError(
              'STALE_GAMING_DAY_CONTEXT',
              'Session context is stale. Please refresh and try again.',
              { httpStatus: 409, retryable: true },
            );
          }
          // Log all buy-in errors for visibility (Patch C requirement)
          logError(txnError, {
            component: 'useSaveWithBuyIn',
            action: 'createFinancialTransaction',
            metadata: { slipId, visitId, playerId },
          });
          // Re-throw to fail the save operation
          throw txnError;
        }
      }

      // Step 4: MTL entry creation
      // NOTE: The forward bridge trigger (fn_derive_mtl_from_finance) automatically
      // creates an MTL entry when a financial transaction is inserted. This makes
      // explicit MTL creation here REDUNDANT and would cause duplicate entries.
      // The threshold notification (Step 1) still fires for UX feedback.
      // See ISSUE-FB8EB717 for cents standardization details.

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
