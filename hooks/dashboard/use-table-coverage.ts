/**
 * Table Coverage Hook
 *
 * Fetches per-table rating coverage data from measurement_rating_coverage_v.
 * Derives coverage tier using canonical getCoverageTier from snapshot-rules.
 *
 * Client-fetched only — NOT part of RSC prefetch set.
 * RLS path: View uses security_invoker=true — caller's RLS applies.
 *
 * @see PRD-048 WS3 — Coverage Data Wiring
 * @see MEAS-003 Rating Coverage provenance (Derived Operational, Request-time)
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { queryRatingCoverage } from '@/services/measurement/queries';
import { getCoverageTier } from '@/services/table-context/shift-metrics/snapshot-rules';

import { dashboardKeys } from './keys';
import type { TableCoverageDTO, CoverageTier } from './types';

export interface TableCoverageResult extends TableCoverageDTO {
  coverage_tier: CoverageTier;
}

/**
 * Fetches per-table coverage data for the current gaming day.
 *
 * @param casinoId - Casino UUID (undefined disables the query)
 * @param gamingDay - Current gaming day (YYYY-MM-DD) to limit result set
 */
export function useTableCoverage(
  casinoId: string | undefined,
  gamingDay?: string | null,
) {
  return useQuery({
    queryKey: dashboardKeys.coverage(casinoId!),
    queryFn: async (): Promise<TableCoverageResult[]> => {
      const supabase = createBrowserComponentClient();

      const result = await queryRatingCoverage(supabase, casinoId!, {
        gamingDay: gamingDay ?? undefined,
      });

      return result.rows.map((row) => ({
        gaming_table_id: row.gaming_table_id,
        rated_ratio: row.rated_ratio,
        untracked_seconds: row.untracked_seconds,
        rated_seconds: row.rated_seconds,
        open_seconds: row.open_seconds,
        slip_count: row.slip_count,
        gaming_day: row.gaming_day,
        coverage_tier: getCoverageTier(row.rated_ratio ?? 0),
      }));
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
}
