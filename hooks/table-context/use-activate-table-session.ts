/**
 * Table Session Activation Mutation Hook
 *
 * Transitions a table session from OPEN → ACTIVE via custody gate attestation.
 * Creates opening attestation with chip count, dealer confirmation, and provenance.
 *
 * @see PRD-059 Table Lifecycle Recovery
 * @see services/table-context/http.ts - activateTableSession HTTP fetcher
 * @see services/table-context/keys.ts - Query key factory
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardKeys } from '@/hooks/dashboard/keys';
import { activateTableSession } from '@/services/table-context/http';
import { tableContextKeys } from '@/services/table-context/keys';
import type { ActivateTableSessionRequestBody } from '@/services/table-context/schemas';

/**
 * Activates an OPEN table session with opening attestation.
 * Transitions: OPEN → ACTIVE
 *
 * @param sessionId - Table session UUID (must be in OPEN state)
 * @param tableId - Gaming table UUID (for cache invalidation)
 */
export function useActivateTableSession(sessionId: string, tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['activate-table-session', sessionId],
    mutationFn: async (
      input: Omit<ActivateTableSessionRequestBody, 'table_session_id'>,
    ) => {
      const idempotencyKey = crypto.randomUUID();
      return activateTableSession(sessionId, input, idempotencyKey);
    },
    onSuccess: (data) => {
      // Update current session cache with ACTIVE session
      queryClient.setQueryData(
        tableContextKeys.sessions.current(tableId),
        data,
      );
      // Also cache by ID
      queryClient.setQueryData(tableContextKeys.sessions.byId(sessionId), data);
      // Invalidate dashboard so grid badge updates from OPEN → IN_PLAY
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
    },
  });
}
