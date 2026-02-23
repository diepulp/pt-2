/**
 * Import Report Hook
 *
 * TanStack Query wrapper for fetching batch detail and row listing
 * with pagination for the report step.
 *
 * @see PRD-037 CSV Player Import
 * @see services/player-import/http.ts
 * @see services/player-import/keys.ts
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type {
  ImportBatchReportV1,
  ImportRowDTO,
  ImportRowListFilters,
  ImportRowStatus,
} from '@/services/player-import/dtos';
import { getBatch, listRows } from '@/services/player-import/http';
import { playerImportKeys } from '@/services/player-import/keys';
import { toImportBatchReportV1 } from '@/services/player-import/mappers';

/**
 * Hook for fetching the batch detail including report summary.
 *
 * Polls every 3s while batch is in `executing` status to catch completion.
 */
export function useImportBatchDetail(batchId: string | null) {
  const query = useQuery({
    queryKey: batchId
      ? playerImportKeys.batches.detail(batchId)
      : ['player-import', 'noop'],
    queryFn: () => getBatch(batchId!),
    enabled: batchId !== null,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const batch = query.state.data;
      if (batch && batch.status === 'executing') {
        return 3_000;
      }
      return false;
    },
  });

  const report: ImportBatchReportV1 | null = query.data?.report_summary
    ? toImportBatchReportV1(query.data.report_summary)
    : null;

  return {
    batch: query.data ?? null,
    report,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Hook for fetching rows within a batch with optional status filter.
 */
export function useImportRows(
  batchId: string | null,
  filters: ImportRowListFilters = {},
) {
  const query = useQuery({
    queryKey: batchId
      ? playerImportKeys.batches.rows(batchId, filters)
      : ['player-import', 'rows-noop'],
    queryFn: () => listRows(batchId!, filters),
    enabled: batchId !== null,
    staleTime: 30_000,
  });

  return {
    rows: (query.data?.items ?? []) as ImportRowDTO[],
    cursor: query.data?.cursor ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Hook for fetching rows filtered by a specific status.
 */
export function useImportRowsByStatus(
  batchId: string | null,
  status: ImportRowStatus,
) {
  return useImportRows(batchId, { status, limit: 100 });
}
