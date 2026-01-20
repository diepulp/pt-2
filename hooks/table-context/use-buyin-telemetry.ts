/**
 * Buy-in Telemetry Query and Mutation Hooks
 *
 * Hooks for grind buy-in telemetry operations.
 * Used by GrindBuyinPanel for manual anonymous buy-in logging.
 *
 * @see services/table-context/chip-custody.ts - Service layer
 * @see GAP-TABLE-ROLLOVER-UI WS5
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { tableContextKeys } from '@/services/table-context/keys';

// === Query Hooks ===

/**
 * Fetches grind buy-in total for a shift window.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 * @param shiftWindow - Start and end timestamps for the shift
 */
export function useGrindBuyinTotal(
  tableId: string,
  casinoId: string,
  shiftWindow: { startTs: string; endTs: string },
) {
  return useQuery({
    queryKey: [
      ...tableContextKeys.root,
      'grind-total',
      tableId,
      shiftWindow.startTs,
      shiftWindow.endTs,
    ],
    queryFn: async () => {
      const supabase = createBrowserComponentClient();

      const { data, error } = await supabase
        .from('table_buyin_telemetry')
        .select('amount_cents')
        .eq('table_id', tableId)
        .eq('casino_id', casinoId)
        .eq('kind', 'GRIND_BUYIN')
        .gte('created_at', shiftWindow.startTs)
        .lte('created_at', shiftWindow.endTs);

      if (error) {
        throw new Error(error.message);
      }

      const total = (data ?? []).reduce(
        (sum, row) => sum + (row.amount_cents ?? 0),
        0,
      );
      return { totalCents: total, count: data?.length ?? 0 };
    },
    enabled:
      !!tableId && !!casinoId && !!shiftWindow.startTs && !!shiftWindow.endTs,
    staleTime: 10_000, // 10 seconds - grind counts update frequently
  });
}

// === Mutation Hooks ===

/**
 * Input for logging a grind buy-in.
 */
export interface LogGrindBuyinInput {
  amountCents: number;
  note?: string;
}

/**
 * Logs a grind (anonymous) buy-in to telemetry.
 * Uses the existing rpc_log_table_buyin_telemetry RPC.
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID
 */
export function useLogGrindBuyin(tableId: string, _casinoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['log-grind-buyin', tableId],
    mutationFn: async (input: LogGrindBuyinInput) => {
      const supabase = createBrowserComponentClient();

      const idempotencyKey = `grind:${tableId}:${Date.now()}:${crypto.randomUUID()}`;

      const { data, error } = await supabase.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: input.amountCents,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_source: 'pit_manual',
          p_idempotency_key: idempotencyKey,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate grind total queries
      queryClient.invalidateQueries({
        queryKey: [...tableContextKeys.root, 'grind-total', tableId],
        exact: false,
      });
    },
  });
}

/**
 * Reverses the last grind buy-in (undo functionality).
 * Logs a negative amount to offset the previous entry.
 */
export function useUndoGrindBuyin(tableId: string, _casinoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['undo-grind-buyin', tableId],
    mutationFn: async (amountCents: number) => {
      const supabase = createBrowserComponentClient();

      const idempotencyKey = `grind-undo:${tableId}:${Date.now()}:${crypto.randomUUID()}`;

      // Log a negative amount to reverse the previous entry
      const { data, error } = await supabase.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: -amountCents, // Negative to undo
          p_telemetry_kind: 'GRIND_BUYIN',
          p_source: 'pit_manual_undo',
          p_idempotency_key: idempotencyKey,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...tableContextKeys.root, 'grind-total', tableId],
        exact: false,
      });
    },
  });
}

// === Utility Functions ===

/**
 * Formats cents to dollar display.
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}
