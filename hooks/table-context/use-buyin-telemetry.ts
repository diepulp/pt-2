/**
 * Buy-in Telemetry Query and Mutation Hooks
 *
 * Hooks for grind buy-in telemetry operations.
 * Used by GrindBuyinPanel for manual anonymous buy-in logging.
 *
 * @see services/player-financial/crud.ts - getShiftOperationalCompleteness
 * @see app/api/v1/table-context/operational-projection/route.ts - projection route
 * @see GAP-TABLE-ROLLOVER-UI WS5
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { normalizeClientError } from '@/lib/errors/normalize-client-error';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { OperationalProjectionResponseDTO } from '@/services/player-financial/dtos';
import { tableContextKeys } from '@/services/table-context/keys';

// === Query Hooks ===

/**
 * Fetches grind buy-in total for a gaming day from the operational projection route.
 *
 * Uses GET /api/v1/table-context/operational-projection (service-role backed).
 * table_buyin_telemetry direct query replaced by projection route per Phase 2.4 (PRD-088 DEC-EXEC-2).
 *
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID (passed through for cache keying; casinoId is authoritative from rlsContext in route)
 * @param gamingDay - Gaming day date string (YYYY-MM-DD)
 */
export function useGrindBuyinTotal(
  tableId: string,
  casinoId: string,
  gamingDay: string,
) {
  return useQuery({
    queryKey: [...tableContextKeys.root, 'grind-total', tableId, gamingDay],
    queryFn: async () => {
      const params = new URLSearchParams({ gamingDay, tableId });
      const res = await fetch(
        `/api/v1/table-context/operational-projection?${params.toString()}`,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw normalizeClientError(
          new Error(body?.error ?? `projection fetch failed (${res.status})`),
        );
      }

      const envelope = (await res.json()) as {
        data: OperationalProjectionResponseDTO;
      };
      return envelope.data;
    },
    enabled: !!tableId && !!casinoId && !!gamingDay,
    staleTime: 10_000, // 10 seconds — grind counts update frequently
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
        throw normalizeClientError(error);
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
