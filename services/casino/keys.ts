import { serializeKeyFilters } from '@/services/shared/key-utils';

export type CasinoFilters = {
  status?: 'active' | 'inactive';
  cursor?: string;
  limit?: number;
};

export type CasinoStaffFilters = {
  status?: 'active' | 'inactive';
  role?: 'dealer' | 'pit_boss' | 'admin'; // Note: dealer role is non-authenticated
  authenticated?: boolean; // Filter for authenticated staff only (excludes dealers)
  cursor?: string;
  limit?: number;
};

const ROOT = ['casino'] as const;
const serialize = (filters: CasinoStaffFilters = {}) =>
  serializeKeyFilters(filters);

export const casinoKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: CasinoFilters = {}) =>
      [...ROOT, 'list', serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, 'list'] as const },
  ),
  detail: (casinoId: string) => [...ROOT, 'detail', casinoId] as const,
  staff: (
    casinoId: string,
    filters: CasinoStaffFilters = {},
  ) => [...ROOT, 'staff', casinoId, serialize(filters)] as const,
  settings: (casinoId: string) => [...ROOT, 'settings', casinoId] as const,
  updateSettings: (casinoId: string) =>
    [...ROOT, 'settings', casinoId, 'update'] as const,
};
