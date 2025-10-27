import { serializeKeyFilters } from '@/services/shared/key-utils';

export type VisitListFilters = {
  casinoId?: string;
  playerId?: string;
  status?: 'open' | 'closed';
  cursor?: string;
  limit?: number;
};

const ROOT = ['visit'] as const;
const serialize = (filters: VisitListFilters = {}) =>
  serializeKeyFilters(filters);

export const visitKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: VisitListFilters = {}) =>
      [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  infinite: (filters: VisitListFilters = {}) =>
    [...ROOT, 'infinite', serialize(filters)] as const,
  detail: (visitId: string) => [...ROOT, 'detail', visitId] as const,
  timeline: (visitId: string) => [...ROOT, 'timeline', visitId] as const,
  activeByPlayer: (playerId: string) =>
    [...ROOT, 'active-by-player', playerId] as const,
  create: () => [...ROOT, 'create'] as const,
  close: (visitId: string) => [...ROOT, 'close', visitId] as const,
};
