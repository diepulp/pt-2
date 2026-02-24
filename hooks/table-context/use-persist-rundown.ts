/**
 * Persist Rundown Report Mutation Hook (PRD-038)
 *
 * Persists (UPSERTs) a rundown report for a table session.
 * Used for manual pre-close report persistence.
 *
 * @see services/table-context/rundown-report/http.ts
 * @see EXEC-038 WS4
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { TableRundownReportDTO } from '@/services/table-context/rundown-report/dtos';
import { persistRundownReport } from '@/services/table-context/rundown-report/http';
import { rundownReportKeys } from '@/services/table-context/rundown-report/keys';

/**
 * Mutation hook to persist a rundown report.
 *
 * Invalidates:
 * - rundownReport.bySession(sessionId)
 * - rundownReport.scope (all by-day queries)
 *
 * @param sessionId - Table session UUID
 */
export function usePersistRundown(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation<TableRundownReportDTO, Error>({
    mutationKey: ['persist-rundown', sessionId],
    mutationFn: async () => {
      return persistRundownReport({ table_session_id: sessionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: rundownReportKeys.bySession(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: rundownReportKeys.scope,
      });
    },
  });
}
