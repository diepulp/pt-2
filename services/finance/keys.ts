import { serializeKeyFilters } from '@/services/shared/key-utils';

export type FinancialTransactionFilters = {
  casinoId?: string;
  playerId?: string;
  gamingDay?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ['finance'] as const;
const serialize = (filters: FinancialTransactionFilters = {}) =>
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
};
