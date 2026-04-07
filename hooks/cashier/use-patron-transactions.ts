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

import { playerFinancialKeys } from '@/hooks/player-financial/keys';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import type {
  AdjustmentReasonCode,
  FinancialTransactionDTO,
} from '@/services/player-financial/dtos';
import {
  createFinancialAdjustment,
  createFinancialTransaction,
  listFinancialTransactions,
} from '@/services/player-financial/http';
// GAP-CASHIN-ADJUSTMENT-MTL-SYNC Fix 4: use canonical hooks key factory

// === Enriched Types ===

/** Cash-out transaction enriched with player display name. */
export interface CashOutWithPlayer extends FinancialTransactionDTO {
  player_name: string | null;
}

// === Cache Key Helper ===

/** Stable key for the cashier cash-outs query, including gamingDay segment. */
function cashOutsKey(gamingDay?: string) {
  return [
    ...playerFinancialKeys.list.scope,
    'cashier-cash-outs',
    gamingDay,
  ] as const;
}

// === Query Hooks ===

/**
 * Fetches recent cash-out transactions for the current gaming day,
 * enriched with player names via batch lookup.
 * Filters: source='cage', direction='out'.
 */
export function useRecentCashOuts(gamingDay?: string) {
  return useQuery({
    queryKey: cashOutsKey(gamingDay),
    queryFn: async (): Promise<CashOutWithPlayer[]> => {
      const result = await listFinancialTransactions({
        source: 'cage',
        direction: 'out',
        gaming_day: gamingDay,
        limit: 50,
      });

      const items = result.items;
      if (items.length === 0) return [];

      // Batch-fetch player names for all unique player_ids
      const uniquePlayerIds = [...new Set(items.map((t) => t.player_id))];
      const supabase = createBrowserComponentClient();
      const { data: players } = await supabase
        .from('player')
        .select('id, first_name, last_name')
        .in('id', uniquePlayerIds);

      const nameMap = new Map<string, string>();
      for (const p of players ?? []) {
        nameMap.set(p.id, `${p.first_name} ${p.last_name}`);
      }

      return items.map((txn) => ({
        ...txn,
        player_name: nameMap.get(txn.player_id) ?? null,
      }));
    },
  });
}

// === Mutation Hooks ===

export interface CashOutCreateParams {
  casino_id: string;
  player_id: string;
  player_name?: string;
  visit_id: string;
  amount_cents: number;
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
        idempotency_key: crypto.randomUUID(),
        external_ref: params.external_ref,
      }),
    onSuccess: (newTxn, params) => {
      // Append to cache immediately so the list updates without waiting for refetch
      const enriched: CashOutWithPlayer = {
        ...newTxn,
        player_name: params.player_name ?? null,
      };
      queryClient.setQueryData<CashOutWithPlayer[]>(
        cashOutsKey(gamingDay),
        (old) => (old ? [enriched, ...old] : [enriched]),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.list.scope,
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
      const previous = queryClient.getQueryData<CashOutWithPlayer[]>(key);

      queryClient.setQueryData<CashOutWithPlayer[]>(key, (old) =>
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
        queryKey: playerFinancialKeys.list.scope,
      });
    },
  });
}
