/**
 * Dashboard Tables Hook
 *
 * Fetches all gaming tables for a casino with dashboard-specific metadata
 * including active slips count per table.
 *
 * ISSUE-DD2C45CA: Uses batch RPC to replace N×2 HTTP pattern (8 requests → 1).
 * RPC: rpc_get_dashboard_tables_with_counts
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 * @see ISSUE-DD2C45CA Dashboard HTTP Request Cascade Remediation
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';

import { fetchDashboardTables } from './http';
import { dashboardKeys } from './keys';
import type { DashboardTableDTO, DashboardTablesFilters } from './types';

/**
 * Fetches all tables for a casino with active slips count.
 *
 * ISSUE-DD2C45CA: Refactored to use single RPC call instead of N×2 HTTP pattern.
 * Before: 8 HTTP requests (4 tables × 2 status queries)
 * After: 1 RPC call (87.5% reduction)
 *
 * This hook:
 * 1. Calls rpc_get_dashboard_tables_with_counts RPC
 * 2. Applies client-side filters if needed
 * 3. Returns DashboardTableDTO array
 *
 * @param casinoId - Casino UUID (required)
 * @param filters - Optional filters for status, type, pit.
 *   Defaults to `{ status: 'active' }` per ADR-047 D2 (active-only dashboard).
 *
 * @example
 * ```tsx
 * const { data: tables, isLoading, error } = useDashboardTables(casinoId);
 *
 * // With filters
 * const { data } = useDashboardTables(casinoId, { status: 'active' });
 * ```
 */
export function useDashboardTables(
  casinoId: string | undefined,
  filters: DashboardTablesFilters = { status: 'active' },
) {
  return useQuery({
    queryKey: dashboardKeys.tables(casinoId!, filters),
    queryFn: async (): Promise<DashboardTableDTO[]> => {
      const supabase = createBrowserComponentClient();

      // Extracted to http.ts for RSC prefetch reuse (PRD-048 WS1)
      let tables = await fetchDashboardTables(supabase);

      // Apply client-side filters if needed
      if (filters.status) {
        tables = tables.filter((t) => t.status === filters.status);
      }
      if (filters.type) {
        tables = tables.filter((t) => t.type === filters.type);
      }
      if (filters.pit) {
        tables = tables.filter((t) => t.pit === filters.pit);
      }

      return tables;
    },
    enabled: !!casinoId,
    staleTime: 30_000, // 30 seconds - tables don't change frequently
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });
}

/**
 * Fetches only active tables for a casino (status = 'active').
 * Convenience wrapper for the common dashboard use case.
 *
 * @param casinoId - Casino UUID (required)
 */
export function useDashboardActiveTables(casinoId: string | undefined) {
  return useDashboardTables(casinoId, { status: 'active' });
}
