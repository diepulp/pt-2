/**
 * Player Financial Transaction Query Hooks
 *
 * Hooks for fetching financial transactions and visit summaries.
 * Used by pit boss and cashier to view player financial activity.
 *
 * @see services/player-financial/http.ts - HTTP fetchers
 * @see services/player-financial/keys.ts - Query key factory
 * @see PRD-009 Player Financial Service
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitFinancialSummaryDTO,
} from "@/services/player-financial/dtos";
import {
  getFinancialTransaction,
  listFinancialTransactions,
  getVisitFinancialSummary,
} from "@/services/player-financial/http";

import { playerFinancialKeys } from "./keys";

/**
 * Fetches a single financial transaction by ID.
 *
 * @param txnId - Transaction UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: txn, isLoading } = useFinancialTransaction(txnId);
 * ```
 */
export function useFinancialTransaction(txnId: string | undefined) {
  return useQuery({
    queryKey: playerFinancialKeys.detail(txnId!),
    queryFn: () => getFinancialTransaction(txnId!),
    enabled: !!txnId,
    staleTime: 5 * 60_000, // 5 minutes - transactions are immutable
  });
}

/**
 * Fetches a paginated list of financial transactions with optional filters.
 *
 * @param filters - Optional filters (player_id, visit_id, direction, etc.)
 *
 * @example
 * ```tsx
 * // Get all transactions for a visit
 * const { data, isLoading } = useFinancialTransactions({ visit_id: visitId });
 *
 * // Get all "in" transactions for a player
 * const { data } = useFinancialTransactions({
 *   player_id: playerId,
 *   direction: 'in',
 * });
 * ```
 */
export function useFinancialTransactions(filters: FinancialTxnListQuery = {}) {
  // Extract casino_id or player_id to determine if query should be enabled
  const hasRequiredFilter = !!(
    filters.player_id ||
    filters.visit_id ||
    filters.table_id ||
    filters.gaming_day
  );

  return useQuery({
    queryKey: playerFinancialKeys.list(filters),
    queryFn: async (): Promise<{
      items: FinancialTransactionDTO[];
      cursor: string | null;
    }> => {
      return listFinancialTransactions(filters);
    },
    enabled: hasRequiredFilter,
    staleTime: 30_000, // 30 seconds - append-only ledger rarely changes
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches aggregated financial summary for a visit.
 * Returns totals for amount in, amount out, net amount, and transaction count.
 *
 * @param visitId - Visit UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: summary, isLoading } = useVisitFinancialSummary(visitId);
 * if (summary) {
 *   console.log('Net:', summary.net_amount);
 *   console.log('Total In:', summary.total_in);
 *   console.log('Total Out:', summary.total_out);
 * }
 * ```
 */
export function useVisitFinancialSummary(visitId: string | undefined) {
  return useQuery({
    queryKey: playerFinancialKeys.visitSummary(visitId!),
    queryFn: (): Promise<VisitFinancialSummaryDTO> =>
      getVisitFinancialSummary(visitId!),
    enabled: !!visitId,
    staleTime: 15_000, // 15 seconds - summary updates on new transactions
    refetchOnWindowFocus: true,
  });
}
