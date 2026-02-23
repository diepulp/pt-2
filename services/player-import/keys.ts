/**
 * PlayerImportService React Query Key Factory
 *
 * @see PRD-037 CSV Player Import
 */

import { serializeKeyFilters } from '@/services/shared/key-utils';

import type { ImportBatchListFilters, ImportRowListFilters } from './dtos';

const ROOT = ['player-import'] as const;

export const playerImportKeys = {
  root: ROOT,
  batches: {
    list: Object.assign(
      (filters: ImportBatchListFilters = {}) =>
        [...ROOT, 'batches', 'list', serializeKeyFilters(filters)] as const,
      { scope: [...ROOT, 'batches', 'list'] as const },
    ),
    detail: (batchId: string) =>
      [...ROOT, 'batches', 'detail', batchId] as const,
    rows: Object.assign(
      (batchId: string, filters: ImportRowListFilters = {}) =>
        [
          ...ROOT,
          'batches',
          batchId,
          'rows',
          serializeKeyFilters(filters),
        ] as const,
      {
        scope: (batchId: string) =>
          [...ROOT, 'batches', batchId, 'rows'] as const,
      },
    ),
  },
};
