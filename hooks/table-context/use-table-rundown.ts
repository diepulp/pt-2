/**
 * Table Rundown Query and Mutation Hooks (ADR-027)
 *
 * Hooks for table rundown visibility and drop total posting.
 * Uses RPC-based computation for accurate win/loss calculation.
 *
 * Formula: win = closing + credits + drop - opening - fills
 *
 * IMPORTANT: table_win_cents is NULL when drop is not posted (PATCHED behavior).
 *
 * @see services/table-context/rundown.ts - Service functions
 * @see services/table-context/keys.ts - Query key factory
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import type {
  TableRundownDTO,
  TableSessionDTO,
} from '@/services/table-context/dtos';
import { tableContextKeys } from '@/services/table-context/keys';
import {
  computeTableRundown,
  postTableDropTotal,
} from '@/services/table-context/rundown';

// === Query Key Factory Extension ===

/**
 * Query keys for table rundown operations.
 * Extends tableContextKeys for ADR-027 rundown queries.
 */
export const tableRundownKeys = {
  /** All rundown queries scope */
  all: [...tableContextKeys.root, 'rundown'] as const,
  /** Rundown for a specific session */
  detail: (sessionId: string) => [...tableRundownKeys.all, sessionId] as const,
};

// === Query Hooks ===

/**
 * Fetches table rundown for a session.
 *
 * Returns all formula components:
 * - opening_total_cents, closing_total_cents
 * - fills_total_cents, credits_total_cents
 * - drop_total_cents (NULL if not posted)
 * - table_win_cents (NULL if drop not posted - PATCHED behavior)
 *
 * @param sessionId - Table session UUID (null to disable query)
 */
export function useTableRundown(sessionId: string | null) {
  return useQuery<TableRundownDTO>({
    queryKey: tableRundownKeys.detail(sessionId ?? ''),
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      return computeTableRundown(supabase, sessionId!);
    },
    enabled: !!sessionId,
    staleTime: 30_000, // 30 seconds - rundown values may change during shift
  });
}

// === Mutation Hooks ===

/**
 * Posts drop total to a session.
 *
 * This persists drop_total_cents AND sets drop_posted_at timestamp.
 * After posting, subsequent rundown computations will include table_win_cents.
 *
 * Invalidates:
 * - Rundown query for the session
 * - Session queries (current and by-id)
 *
 * @returns Mutation with sessionId and dropTotalCents parameters
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
      // Invalidate rundown query for this session
      queryClient.invalidateQueries({
        queryKey: tableRundownKeys.detail(variables.sessionId),
      });

      // Update session caches with returned data
      queryClient.setQueryData(
        tableContextKeys.sessions.byId(variables.sessionId),
        data,
      );

      // If tableId provided, also update current session cache
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
export type { TableRundownDTO };
