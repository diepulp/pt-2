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

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
} from "@/services/player-financial/dtos";
import { createFinancialTransaction } from "@/services/player-financial/http";

import { playerFinancialKeys } from "./keys";

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

// Re-export types for convenience
export type { CreateFinancialTxnInput };
