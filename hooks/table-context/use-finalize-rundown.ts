/**
 * Finalize Rundown Report Mutation Hook (PRD-038)
 *
 * Finalizes a rundown report (stamps finalized_at/finalized_by).
 * Immutable after finalization.
 *
 * @see services/table-context/rundown-report/http.ts
 * @see EXEC-038 WS4
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { TableRundownReportDTO } from '@/services/table-context/rundown-report/dtos';
import { finalizeRundownReport } from '@/services/table-context/rundown-report/http';
import { rundownReportKeys } from '@/services/table-context/rundown-report/keys';

/**
 * Mutation hook to finalize a rundown report.
 *
 * Invalidates:
 * - rundownReport.byId(reportId)
 * - rundownReport.scope (all session/day queries)
 *
 * @param reportId - Report UUID
 */
export function useFinalizeRundown(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation<TableRundownReportDTO, Error>({
    mutationKey: ['finalize-rundown', reportId],
    mutationFn: async () => {
      return finalizeRundownReport(reportId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: rundownReportKeys.byId(reportId),
      });
      queryClient.invalidateQueries({
        queryKey: rundownReportKeys.scope,
      });
    },
  });
}
