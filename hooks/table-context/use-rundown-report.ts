/**
 * Rundown Report Query Hook (PRD-038)
 *
 * Fetches a rundown report by session ID.
 * Uses direct Supabase query via service layer.
 *
 * @see services/table-context/rundown-report/crud.ts
 * @see EXEC-038 WS4
 */

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getRundownBySession } from '@/services/table-context/rundown-report/crud';
import type { TableRundownReportDTO } from '@/services/table-context/rundown-report/dtos';
import { rundownReportKeys } from '@/services/table-context/rundown-report/keys';

/**
 * Query hook to fetch a rundown report by session ID.
 * Returns null if no report exists for the session.
 *
 * @param sessionId - Table session UUID (null to disable query)
 */
export function useRundownReport(sessionId: string | null) {
  return useQuery<TableRundownReportDTO | null>({
    queryKey: rundownReportKeys.bySession(sessionId ?? ''),
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      return getRundownBySession(supabase, sessionId!);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
