/**
 * MTL Entry Query Hooks
 *
 * Hooks for fetching MTL entries (individual transactions) and entry details.
 * Used by pit boss and admin to view AML/CTR transaction history.
 *
 * @see services/mtl/http.ts - HTTP fetchers
 * @see services/mtl/keys.ts - Query key factory
 * @see PRD-005 MTL Service
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  MtlEntryDTO,
  MtlEntryWithNotesDTO,
  MtlEntryFilters,
} from "@/services/mtl/dtos";
import { listMtlEntries, getMtlEntry } from "@/services/mtl/http";
import { mtlKeys } from "@/services/mtl/keys";
import type { MtlEntryQueryFilters } from "@/services/mtl/keys";

/**
 * Converts camelCase query filters to snake_case HTTP filters.
 */
function toHttpFilters(filters: MtlEntryQueryFilters): MtlEntryFilters {
  return {
    casino_id: filters.casinoId,
    patron_uuid: filters.patronId,
    gaming_day: filters.gamingDay,
    min_amount: filters.minAmount,
    txn_type: filters.txnType,
    source: filters.source,
    entry_badge: filters.entryBadge,
    cursor: filters.cursor,
    limit: filters.limit,
  };
}

/**
 * Fetches a paginated list of MTL entries with optional filters.
 *
 * @param filters - Query filters (casinoId required)
 *
 * @example
 * ```tsx
 * // Get all entries for a casino
 * const { data, isLoading } = useMtlEntries({ casinoId });
 *
 * // Get entries for a specific patron and gaming day
 * const { data } = useMtlEntries({
 *   casinoId,
 *   patronId: playerId,
 *   gamingDay: '2026-01-03',
 * });
 *
 * // Filter by threshold badge
 * const { data } = useMtlEntries({
 *   casinoId,
 *   entryBadge: 'ctr_met',
 * });
 * ```
 */
export function useMtlEntries(filters: MtlEntryQueryFilters) {
  const hasRequiredFilter = !!filters.casinoId;

  return useQuery({
    queryKey: mtlKeys.entries(filters),
    queryFn: async (): Promise<{
      items: MtlEntryDTO[];
      next_cursor: string | null;
    }> => {
      return listMtlEntries(toHttpFilters(filters));
    },
    enabled: hasRequiredFilter,
    staleTime: 30_000, // 30 seconds - append-only ledger
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches a single MTL entry by ID with its audit notes.
 *
 * @param entryId - Entry UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: entry, isLoading } = useMtlEntry(entryId);
 * if (entry) {
 *   console.log('Amount:', entry.amount);
 *   console.log('Audit Notes:', entry.audit_notes.length);
 * }
 * ```
 */
export function useMtlEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: mtlKeys.detail(entryId!),
    queryFn: (): Promise<MtlEntryWithNotesDTO> => getMtlEntry(entryId!),
    enabled: !!entryId,
    staleTime: 5 * 60_000, // 5 minutes - entries are immutable (notes can be added)
    refetchOnWindowFocus: true,
  });
}
