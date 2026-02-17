'use client';

/**
 * Cashier Operations React Query Hooks
 *
 * Data fetching and mutation hooks for the Cashier Console.
 * Uses HTTP fetchers from table-context service and cache keys from keys.ts.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  TableCreditDTO,
  TableDropEventDTO,
  TableFillDTO,
} from '@/services/table-context/dtos';
import {
  acknowledgeDropReceived,
  confirmTableCredit,
  confirmTableFill,
  fetchPendingCredits,
  fetchPendingFills,
  fetchUnacknowledgedDrops,
} from '@/services/table-context/http';
import { tableContextKeys } from '@/services/table-context/keys';

// === Query Hooks ===

export function usePendingFills(gamingDay?: string) {
  return useQuery({
    queryKey: tableContextKeys.pendingFills(gamingDay),
    queryFn: () => fetchPendingFills(gamingDay),
  });
}

export function usePendingCredits(gamingDay?: string) {
  return useQuery({
    queryKey: tableContextKeys.pendingCredits(gamingDay),
    queryFn: () => fetchPendingCredits(gamingDay),
  });
}

export function useUnacknowledgedDrops(gamingDay?: string) {
  return useQuery({
    queryKey: tableContextKeys.unacknowledgedDrops(gamingDay),
    queryFn: () => fetchUnacknowledgedDrops(gamingDay),
  });
}

// === Mutation Hooks ===

export function useConfirmFill(gamingDay?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      fillId: string;
      confirmedAmountCents: number;
      discrepancyNote?: string;
    }) =>
      confirmTableFill(params.fillId, {
        confirmed_amount_cents: params.confirmedAmountCents,
        discrepancy_note: params.discrepancyNote,
      }),
    onMutate: async (params) => {
      const key = tableContextKeys.pendingFills(gamingDay);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TableFillDTO[]>(key);

      queryClient.setQueryData<TableFillDTO[]>(key, (old) =>
        old ? old.filter((f) => f.id !== params.fillId) : [],
      );

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          tableContextKeys.pendingFills(gamingDay),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.pendingFills(gamingDay),
      });
    },
  });
}

export function useConfirmCredit(gamingDay?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      creditId: string;
      confirmedAmountCents: number;
      discrepancyNote?: string;
    }) =>
      confirmTableCredit(params.creditId, {
        confirmed_amount_cents: params.confirmedAmountCents,
        discrepancy_note: params.discrepancyNote,
      }),
    onMutate: async (params) => {
      const key = tableContextKeys.pendingCredits(gamingDay);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TableCreditDTO[]>(key);

      queryClient.setQueryData<TableCreditDTO[]>(key, (old) =>
        old ? old.filter((c) => c.id !== params.creditId) : [],
      );

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          tableContextKeys.pendingCredits(gamingDay),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.pendingCredits(gamingDay),
      });
    },
  });
}

export function useAcknowledgeDrop(gamingDay?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dropEventId: string) => acknowledgeDropReceived(dropEventId),
    onMutate: async (dropEventId) => {
      const key = tableContextKeys.unacknowledgedDrops(gamingDay);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TableDropEventDTO[]>(key);

      queryClient.setQueryData<TableDropEventDTO[]>(key, (old) =>
        old ? old.filter((d) => d.id !== dropEventId) : [],
      );

      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          tableContextKeys.unacknowledgedDrops(gamingDay),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.unacknowledgedDrops(gamingDay),
      });
    },
  });
}
