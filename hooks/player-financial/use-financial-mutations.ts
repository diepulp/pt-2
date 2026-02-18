/**
 * Player Financial Transaction Mutation Hooks
 *
 * Hooks for creating financial transactions.
 * All mutations automatically invalidate relevant queries using surgical cache updates.
 *
 * @see services/player-financial/http.ts - HTTP fetchers
 * @see services/player-financial/keys.ts - Query key factory
 * @see PRD-009 Player Financial Service
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { shiftDashboardKeys } from '@/hooks/shift-dashboard/keys';
import { mtlKeys } from '@/services/mtl/keys';
import type {
  CreateFinancialAdjustmentInput,
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
} from '@/services/player-financial/dtos';
import {
  createFinancialAdjustment,
  createFinancialTransaction,
} from '@/services/player-financial/http';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

import { playerFinancialKeys } from './keys';

/**
 * Creates a new financial transaction (buy-in, cashout, marker, etc.).
 * Transactions are append-only and immutable after creation.
 *
 * Invalidates:
 * - All transaction list queries (list.scope)
 * - Visit financial summary for the transaction's visit
 * - Player-scoped queries (forPlayer)
 * - Visit-scoped queries (forVisit)
 *
 * @example
 * ```tsx
 * const createTxn = useCreateFinancialTransaction();
 *
 * // Record a buy-in
 * await createTxn.mutateAsync({
 *   casino_id: casinoId,
 *   player_id: playerId,
 *   visit_id: visitId,
 *   amount: 500,
 *   direction: 'in',
 *   source: 'pit',
 *   tender_type: 'cash',
 *   created_by_staff_id: staffId,
 *   rating_slip_id: slipId,
 * });
 * ```
 */
export function useCreateFinancialTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFinancialTxnInput) =>
      createFinancialTransaction(input),
    onSuccess: (data: FinancialTransactionDTO) => {
      // Set detail cache for the new transaction
      queryClient.setQueryData(playerFinancialKeys.detail(data.id), data);

      // Invalidate all transaction list queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.list.scope,
      });

      // Invalidate visit financial summary (totals changed)
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(data.visit_id),
      });

      // Invalidate visit summary scope (for all visits)
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummaryScope,
      });

      // Invalidate player-scoped queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.forPlayer(data.player_id),
      });

      // Invalidate visit-scoped queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.forVisit(data.visit_id),
      });
    },
  });
}

/**
 * Creates a financial adjustment (compliance-friendly correction).
 *
 * Adjustments don't modify or delete original transactions.
 * They add a new record with txn_kind='adjustment' that explains
 * the correction with a reason code and detailed note.
 *
 * Invalidates:
 * - Visit financial summary (totals changed)
 * - Rating slip modal data (totalCashIn display)
 *
 * @example
 * ```tsx
 * const createAdjustment = useCreateFinancialAdjustment();
 *
 * // Reduce total by $100 due to data entry error
 * await createAdjustment.mutateAsync({
 *   casino_id: casinoId,
 *   player_id: playerId,
 *   visit_id: visitId,
 *   delta_amount: -100,
 *   reason_code: 'data_entry_error',
 *   note: 'Original buy-in was $500 but should have been $400. Customer confirmed.',
 * });
 * ```
 */
export function useCreateFinancialAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFinancialAdjustmentInput) =>
      createFinancialAdjustment(input),
    onSuccess: (data: FinancialTransactionDTO) => {
      // Set detail cache for the new transaction
      queryClient.setQueryData(playerFinancialKeys.detail(data.id), data);

      // Invalidate all transaction list queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.list.scope,
      });

      // Invalidate visit financial summary (totals changed)
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(data.visit_id),
      });

      // Invalidate visit summary scope
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummaryScope,
      });

      // Invalidate player-scoped queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.forPlayer(data.player_id),
      });

      // Invalidate visit-scoped queries
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.forVisit(data.visit_id),
      });

      // Invalidate rating slip modal data (shows totalCashIn)
      // We need to invalidate all modal data since adjustment affects totals
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.scope,
      });

      // Invalidate shift dashboard metrics (adjustment changes telemetry totals)
      queryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.summary.scope,
      });
      queryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.allMetrics(),
      });

      // GAP-CASHIN-ADJUSTMENT-MTL-SYNC Fix 2:
      // Forward bridge trigger now creates mtl_entry for adjustments.
      // Invalidate MTL caches so compliance dashboard reflects the change.
      queryClient.invalidateQueries({
        queryKey: mtlKeys.entries.scope,
      });
      queryClient.invalidateQueries({
        queryKey: mtlKeys.gamingDaySummary.scope,
      });
      queryClient.invalidateQueries({
        queryKey: mtlKeys.patronDailyTotal(data.casino_id, data.player_id),
      });
    },
  });
}

// Re-export types for convenience
export type { CreateFinancialTxnInput, CreateFinancialAdjustmentInput };
