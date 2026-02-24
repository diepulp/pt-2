/**
 * Rundowns By Day Query Hook (PRD-038)
 *
 * Fetches rundown report summaries for a gaming day.
 * Used by gaming day dashboard views.
 *
 * @see services/table-context/rundown-report/http.ts
 * @see EXEC-038 WS4
 */

import { useQuery } from '@tanstack/react-query';

import type { TableRundownReportSummaryDTO } from '@/services/table-context/rundown-report/dtos';
import { fetchRundownsByDay } from '@/services/table-context/rundown-report/http';
import { rundownReportKeys } from '@/services/table-context/rundown-report/keys';

/**
 * Query hook to list rundown report summaries by gaming day.
 *
 * @param gamingDay - Gaming day string (YYYY-MM-DD), null to disable query
 */
export function useRundownsByDay(gamingDay: string | null) {
  return useQuery<TableRundownReportSummaryDTO[]>({
    queryKey: rundownReportKeys.byDay(gamingDay ?? ''),
    queryFn: () => fetchRundownsByDay(gamingDay!),
    enabled: !!gamingDay,
    staleTime: 60_000,
  });
}
