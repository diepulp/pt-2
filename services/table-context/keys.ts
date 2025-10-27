import { serializeKeyFilters } from '@/services/shared/key-utils';

export type TableContextFilters = {
  casinoId?: string;
  status?: 'inactive' | 'active' | 'closed';
  cursor?: string;
  limit?: number;
};

const ROOT = ['table-context'] as const;
const serialize = (filters: TableContextFilters = {}) =>
  serializeKeyFilters(filters);

export const tableContextKeys = {
  root: ROOT,
  tables: Object.assign(
    (filters: TableContextFilters = {}) =>
      [...ROOT, 'tables', serialize(filters)] as const,
    { scope: [...ROOT, 'tables'] as const },
  ),
  active: (casinoId: string) =>
    [...ROOT, 'active', casinoId] as const,
  byTable: (tableId: string) => [...ROOT, 'by-table', tableId] as const,
  dealerRotations: (tableId: string) =>
    [...ROOT, 'dealer-rotations', tableId] as const,
  startRotation: (tableId: string) =>
    [...ROOT, 'start-rotation', tableId] as const,
};
