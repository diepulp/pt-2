import { serializeKeyFilters } from '@/services/shared/key-utils';

export type TableListFilters = {
  casinoId?: string;
  status?: 'inactive' | 'active' | 'closed';
  game?: string;
  pitId?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['table'] as const;
const serialize = (filters: TableListFilters = {}) =>
  serializeKeyFilters(filters);

export const tableKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: TableListFilters = {}) =>
      [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (tableId: string) => [...ROOT, 'detail', tableId] as const,
  availability: (tableId: string) =>
    [...ROOT, 'availability', tableId] as const,
  assignments: (tableId: string) =>
    [...ROOT, 'assignments', tableId] as const,
  create: () => [...ROOT, 'create'] as const,
  update: (tableId: string) => [...ROOT, 'update', tableId] as const,
};
