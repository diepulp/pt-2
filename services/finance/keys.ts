import type { KeyFilter } from '@/services/shared/key-utils';
import { serializeKeyFilters } from '@/services/shared/key-utils';

export type FinancialTransactionFilters = KeyFilter & {
  casinoId?: string;
  playerId?: string;
  gamingDay?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['finance'] as const;
const serialize = <T extends KeyFilter>(filters?: T) =>
  serializeKeyFilters(filters);

export const financeKeys = {
  root: ROOT,
  transactions: Object.assign(
    (filters: FinancialTransactionFilters = {}) =>
      [...ROOT, 'transactions', serialize(filters)] as const,
    { scope: [...ROOT, 'transactions'] as const },
  ),
  detail: (transactionId: string) =>
    [...ROOT, 'detail', transactionId] as const,
  create: () => [...ROOT, 'create'] as const,
  dropCounts: Object.assign(
    (filters: { casinoId?: string; gamingDay?: string } = {}) =>
      [...ROOT, 'drop-counts', serialize(filters)] as const,
    { scope: [...ROOT, 'drop-counts'] as const },
  ),
  recordDropCount: [...ROOT, 'mutations', 'record-drop-count'] as const,
};
