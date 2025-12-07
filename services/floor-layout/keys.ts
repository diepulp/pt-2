import type { KeyFilter } from '@/services/shared/key-utils';
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type FloorLayoutFilters = KeyFilter & {
  casinoId?: string;
  status?: 'draft' | 'review' | 'approved' | 'archived';
  cursor?: string;
  limit?: number;
};

export type FloorLayoutVersionFilters = KeyFilter & {
  layoutId?: string;
  includeSlots?: boolean;
  status?: 'draft' | 'pending_activation' | 'active' | 'retired';
};

const ROOT = ['floor-layout'] as const;
const serialize = <T extends KeyFilter>(filters?: T) =>
  serializeKeyFilters(filters);

export const floorLayoutKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: FloorLayoutFilters = {}) =>
      [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (layoutId: string) => [...ROOT, 'detail', layoutId] as const,
  versions: Object.assign(
    (filters: FloorLayoutVersionFilters = {}) =>
      [...ROOT, 'versions', serialize(filters)] as const,
    { scope: [...ROOT, 'versions'] as const },
  ),
  versionDetail: (layoutId: string, versionId: string) =>
    [...ROOT, 'version', layoutId, versionId] as const,
  pits: (layoutVersionId: string) =>
    [...ROOT, 'pits', layoutVersionId] as const,
  slots: (layoutVersionId: string) =>
    [...ROOT, 'slots', layoutVersionId] as const,
  create: [...ROOT, 'mutations', 'create'] as const,
  update: (layoutId: string) =>
    [...ROOT, 'mutations', 'update', layoutId] as const,
  upsertVersion: (layoutId: string) =>
    [...ROOT, 'mutations', 'upsert-version', layoutId] as const,
  submitForReview: (layoutId: string) =>
    [...ROOT, 'mutations', 'submit', layoutId] as const,
  approve: (layoutId: string) =>
    [...ROOT, 'mutations', 'approve', layoutId] as const,
  activateVersion: (layoutId: string, versionId: string) =>
    [...ROOT, 'mutations', 'activate', layoutId, versionId] as const,
};
