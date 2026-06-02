/**
 * Table Accounting Projection Hook (PRD-090)
 *
 * Replaces the legacy useTableRundown hook (ADR-027 / rpc_compute_table_rundown,
 * quarantined per PRD-090 DEC-2). Fetches TableInventoryAccountingProjection
 * from the canonical BFF endpoint.
 *
 * Drop posting mutation (usePostDropTotal) is retained unchanged.
 *
 * @see services/table-context/table-inventory-accounting.ts - derivation service
 * @see app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts
 * @see PRD-090 DEC-2 — computeTableRundown quarantined
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { TableSessionDTO } from '@/services/table-context/dtos';
import { tableContextKeys } from '@/services/table-context/keys';
import { postTableDropTotal } from '@/services/table-context/rundown';

// === Query Key Factory Extension ===

export const tableRundownKeys = {
  all: [...tableContextKeys.root, 'rundown'] as const,
  detail: (sessionId: string) => [...tableRundownKeys.all, sessionId] as const,
};

// === API Response Type ===

/** bigint fields serialized as string at the HTTP boundary (lossless JSON) */
export interface AccountingProjectionApiResponse {
  table_session_id: string;
  casino_id: string;
  calculation_kind:
    | 'telemetry_drop_formula'
    | 'inventory_only'
    | 'integrity_failure';
  projected_table_win_loss_cents: string | null;
  partial_table_result_cents: string | null;
  final_table_win_loss_cents: null;
  telemetry_derived_drop_estimate_cents: string | null;
  drop_estimate_state: 'present' | 'absent';
  custody_status: 'non_custody_estimate';
  completeness: { status: string };
  source_authority: {
    drop: string | null;
    snapshots: string | null;
    fills: string | null;
    credits: string | null;
  };
  integrity_issues: string[];
  request_id: string;
  derived_at: string;
}

// === Query Hook ===

/**
 * Fetches the canonical TableInventoryAccountingProjection for a session.
 *
 * Returns the three-state result (telemetry_drop_formula / inventory_only /
 * integrity_failure). Consumers render only — no re-derivation from raw fields.
 *
 * bigint fields arrive as strings from the API and must be converted with
 * Number() at display time.
 */
export function useTableAccountingProjection(sessionId: string | null) {
  return useQuery<AccountingProjectionApiResponse>({
    queryKey: tableRundownKeys.detail(sessionId ?? ''),
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/table-context/table-sessions/${sessionId}/accounting-projection`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        throw new Error(`Accounting projection fetch failed: ${res.status}`);
      }
      const json = await res.json();
      return json.data as AccountingProjectionApiResponse;
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

// === Mutation Hook ===

/**
 * Posts drop total to a session (write-path unchanged from ADR-027).
 *
 * Invalidates rundown queries so the projection refreshes after drop posting.
 */
export function usePostDropTotal() {
  const queryClient = useQueryClient();

  return useMutation<
    TableSessionDTO,
    Error,
    { sessionId: string; dropTotalCents: number; tableId?: string }
  >({
    mutationKey: ['post-drop-total'],
    mutationFn: async ({ sessionId, dropTotalCents }) => {
      const supabase = createBrowserComponentClient();
      return postTableDropTotal(supabase, sessionId, dropTotalCents);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: tableRundownKeys.detail(variables.sessionId),
      });

      queryClient.setQueryData(
        tableContextKeys.sessions.byId(variables.sessionId),
        data,
      );

      if (variables.tableId) {
        queryClient.setQueryData(
          tableContextKeys.sessions.current(variables.tableId),
          data,
        );
      }
    },
  });
}

// Re-export types for convenience
export type { AccountingProjectionApiResponse as TableAccountingProjection };
