/**
 * Batch Polling Hook (PRD-039 Server Flow)
 *
 * Polls the batch detail endpoint with adaptive backoff while the worker
 * is processing:
 *   - 4s while status = 'uploaded' or 'parsing'
 *   - 12s after 60 seconds of polling
 *   - Stop on 'staging' or 'failed'
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 * @see services/player-import/keys.ts — playerImportKeys.batches.detail
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';

import type {
  ImportBatchDTO,
  ImportBatchStatus,
} from '@/services/player-import/dtos';
import { getBatch } from '@/services/player-import/http';
import { playerImportKeys } from '@/services/player-import/keys';

const FAST_INTERVAL_MS = 4_000;
const SLOW_INTERVAL_MS = 12_000;
const BACKOFF_THRESHOLD_MS = 60_000;

/** Statuses the worker cycles through before reaching a terminal state */
const ACTIVE_STATUSES: ReadonlySet<ImportBatchStatus> = new Set([
  'uploaded',
  'parsing',
]);

/** Terminal statuses that stop polling */
const TERMINAL_STATUSES: ReadonlySet<ImportBatchStatus> = new Set([
  'staging',
  'failed',
  'executing',
  'completed',
]);

/**
 * Hook that polls batch status during worker processing.
 *
 * Returns the latest batch DTO plus derived state flags.
 */
export function useBatchPolling(batchId: string | null, enabled: boolean) {
  const pollingStartRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey: batchId
      ? playerImportKeys.batches.detail(batchId)
      : ['player-import', 'polling-noop'],
    queryFn: () => getBatch(batchId!),
    enabled: enabled && batchId !== null,
    staleTime: 2_000,
    refetchInterval: (q) => {
      const batch = q.state.data as ImportBatchDTO | undefined;
      if (!batch) return FAST_INTERVAL_MS;

      if (TERMINAL_STATUSES.has(batch.status)) {
        pollingStartRef.current = null;
        return false;
      }

      if (ACTIVE_STATUSES.has(batch.status)) {
        if (pollingStartRef.current === null) {
          pollingStartRef.current = Date.now();
        }

        const elapsed = Date.now() - pollingStartRef.current;
        return elapsed > BACKOFF_THRESHOLD_MS
          ? SLOW_INTERVAL_MS
          : FAST_INTERVAL_MS;
      }

      return false;
    },
  });

  const batch = query.data ?? null;
  const status = batch?.status ?? null;

  return {
    batch,
    status,
    isProcessing: status !== null && ACTIVE_STATUSES.has(status),
    isComplete: status === 'staging',
    isFailed: status === 'failed',
    isLoading: query.isLoading,
    error: query.error,
  };
}
