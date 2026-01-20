import { serializeKeyFilters } from '@/services/shared/key-utils';

import type { MtlTxnType, MtlSource, EntryBadge, AggBadge } from './dtos';

/**
 * Filters for MTL entry list queries
 */
export type MtlEntryQueryFilters = {
  casinoId: string;
  patronId?: string;
  gamingDay?: string;
  minAmount?: number;
  txnType?: MtlTxnType;
  source?: MtlSource;
  entryBadge?: EntryBadge;
  cursor?: string;
  limit?: number;
};

/**
 * Filters for Gaming Day Summary queries (React Query key format - camelCase)
 */
export type MtlGamingDaySummaryQueryFilters = {
  casinoId: string;
  gamingDay: string;
  patronId?: string;
  aggBadgeIn?: AggBadge;
  aggBadgeOut?: AggBadge;
  minTotalIn?: number;
  minTotalOut?: number;
  cursor?: string;
  limit?: number;
};

const ROOT = ['mtl'] as const;
const serializeEntry = (filters: Partial<MtlEntryQueryFilters> = {}) =>
  serializeKeyFilters(filters);
const serializeSummary = (
  filters: Partial<MtlGamingDaySummaryQueryFilters> = {},
) => serializeKeyFilters(filters);

export const mtlKeys = {
  root: ROOT,

  // Entry keys
  entries: Object.assign(
    (filters: Partial<MtlEntryQueryFilters> = {}) =>
      [...ROOT, 'entries', serializeEntry(filters)] as const,
    { scope: [...ROOT, 'entries'] as const },
  ),
  detail: (entryId: string) => [...ROOT, 'detail', entryId] as const,
  create: () => [...ROOT, 'create'] as const,

  // Audit note keys
  auditNotes: (entryId: string) => [...ROOT, 'audit-notes', entryId] as const,
  createAuditNote: (entryId: string) =>
    [...ROOT, 'create-audit-note', entryId] as const,

  // Gaming Day Summary keys (COMPLIANCE AUTHORITY)
  gamingDaySummary: Object.assign(
    (filters: Partial<MtlGamingDaySummaryQueryFilters> = {}) =>
      [...ROOT, 'gaming-day-summary', serializeSummary(filters)] as const,
    { scope: [...ROOT, 'gaming-day-summary'] as const },
  ),
};
