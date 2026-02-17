'use client';

/**
 * Patron Transaction React Query Hooks
 *
 * Data fetching and mutation hooks for cashier cash-out operations.
 * Uses HTTP fetchers from player-financial service.
 *
 * @see PRD-033 Cashier Workflow MVP (WS5 Patron Transactions)
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AdjustmentReasonCode,
  FinancialTransactionDTO,
} from '@/services/player-financial/dtos';
import {
  createFinancialAdjustment,
  createFinancialTransaction,
  listFinancialTransactions,
} from '@/services/player-financial/http';
import { playerFinancialKeys } from '@/services/player-financial/keys';

// === Cache Key Helper ===

/** Stable key for the cashier cash-outs query, including gamingDay segment. */
function cashOutsKey(gamingDay?: string) {
  return [
    ...playerFinancialKeys.transactions(),
    'cashier-cash-outs',
    gamingDay,
  ] as const;
}

// === Query Hooks ===

/**
 * Fetches recent cash-out transactions for the current gaming day.
 * Filters: source='cage', direction='out'.
 */
export function useRecentCashOuts(gamingDay?: string) {
  return useQuery({
    queryKey: cashOutsKey(gamingDay),
    queryFn: async () => {
      const result = await listFinancialTransactions({
        source: 'cage',
        direction: 'out',
        gaming_day: gamingDay,
        limit: 50,
      });
      return result.items;
    },
  });
}

// === Mutation Hooks ===

export interface CashOutCreateParams {
  casino_id: string;
  player_id: string;
  visit_id: string;
  amount_cents: number;
  created_by_staff_id: string;
  external_ref?: string;
}

/**
 * Creates a cash-out confirmation transaction.
 * source='cage', direction='out', tender_type='cash'.
 * Passes external_ref (receipt/ticket) through to the RPC.
 */
export function useCashOutCreate(gamingDay?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CashOutCreateParams) =>
      createFinancialTransaction({
        casino_id: params.casino_id,
        player_id: params.player_id,
        visit_id: params.visit_id,
        amount: params.amount_cents,
        direction: 'out',
        source: 'cage',
        tender_type: 'cash',
        created_by_staff_id: params.created_by_staff_id,
        idempotency_key: crypto.randomUUID(),
        external_ref: params.external_ref,
      }),
    onSuccess: (newTxn) => {
      // Append to cache immediately so the list updates without waiting for refetch
      queryClient.setQueryData<FinancialTransactionDTO[]>(
        cashOutsKey(gamingDay),
        (old) => (old ? [newTxn, ...old] : [newTxn]),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.transactions(),
      });
    },
  });
}

export interface VoidCashOutParams {
  casino_id: string;
  player_id: string;
  visit_id: string;
  original_txn_id: string;
  amount_cents: number;
  reason_code: AdjustmentReasonCode;
  note: string;
}

/**
 * Voids a cash-out by creating a reversal adjustment.
 * Uses rpc_create_financial_adjustment with link to original transaction.
 */
export function useVoidCashOut(gamingDay?: string) {
  const queryClient = useQueryClient();
  const key = cashOutsKey(gamingDay);

  return useMutation({
    mutationFn: (params: VoidCashOutParams) =>
      createFinancialAdjustment({
        casino_id: params.casino_id,
        player_id: params.player_id,
        visit_id: params.visit_id,
        delta_amount: -params.amount_cents,
        reason_code: params.reason_code,
        note: params.note,
        original_txn_id: params.original_txn_id,
        idempotency_key: crypto.randomUUID(),
      }),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FinancialTransactionDTO[]>(key);

      queryClient.setQueryData<FinancialTransactionDTO[]>(key, (old) =>
        old
          ? old.map((txn) =>
              txn.id === params.original_txn_id
                ? { ...txn, txn_kind: 'reversal' as const }
                : txn,
            )
          : [],
      );

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.transactions(),
      });
    },
  });
}
