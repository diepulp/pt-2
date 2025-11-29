import { serializeKeyFilters } from "@/services/shared/key-utils";

export type MtlEntryFilters = {
  casinoId?: string;
  patronId?: string;
  ratingSlipId?: string;
  visitId?: string;
  minAmount?: number;
  cursor?: string;
  limit?: number;
};

const ROOT = ["mtl"] as const;
const serialize = (filters: MtlEntryFilters = {}) =>
  serializeKeyFilters(filters);

export const mtlKeys = {
  root: ROOT,
  entries: Object.assign(
    (filters: MtlEntryFilters = {}) =>
      [...ROOT, "entries", serialize(filters)] as const,
    { scope: [...ROOT, "entries"] as const },
  ),
  detail: (entryId: string) => [...ROOT, "detail", entryId] as const,
  create: () => [...ROOT, "create"] as const,
  auditTrail: (entryId: string) => [...ROOT, "audit-trail", entryId] as const,
};
