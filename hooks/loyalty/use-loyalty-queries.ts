/**
 * Loyalty Query Hooks
 *
 * Hooks for fetching loyalty balances, ledger entries, and session reward suggestions.
 * Used by pit bosses, cashiers, and floor managers to view player loyalty activity.
 *
 * @see services/loyalty/http.ts - HTTP fetchers
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-004 Loyalty Service
 */

'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';

import type {
  LedgerListQuery,
  LedgerPageResponse,
  PlayerLoyaltyDTO,
  SessionRewardSuggestionOutput,
} from '@/services/loyalty/dtos';
import {
  getPlayerLoyalty,
  getLedger,
  evaluateSuggestion,
} from '@/services/loyalty/http';
import { loyaltyKeys } from '@/services/loyalty/keys';

/**
 * Fetches player loyalty balance and tier information.
 *
 * @param playerId - Player UUID (required, undefined disables query)
 * @param casinoId - Casino UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: loyalty, isLoading } = usePlayerLoyalty(playerId, casinoId);
 * if (loyalty) {
 *   console.log('Balance:', loyalty.currentBalance);
 *   console.log('Tier:', loyalty.tier);
 * }
 * ```
 */
export function usePlayerLoyalty(
  playerId: string | undefined,
  casinoId: string | undefined,
) {
  return useQuery({
    queryKey: loyaltyKeys.balance(playerId!, casinoId!),
    queryFn: () => getPlayerLoyalty(playerId!, casinoId!),
    enabled: !!(playerId && casinoId),
    staleTime: 5 * 60_000, // 5 minutes - balance doesn't change frequently
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches paginated ledger entries for a player with optional filters.
 *
 * @param query - Ledger query params (playerId and casinoId required)
 *
 * @example
 * ```tsx
 * // Get all ledger entries for a player
 * const { data, isLoading } = useLoyaltyLedger({
 *   playerId,
 *   casinoId,
 *   limit: 50,
 * });
 *
 * // Filter by rating slip
 * const { data } = useLoyaltyLedger({
 *   playerId,
 *   casinoId,
 *   ratingSlipId,
 * });
 *
 * // Filter by date range and reason
 * const { data } = useLoyaltyLedger({
 *   playerId,
 *   casinoId,
 *   fromDate: '2025-12-01',
 *   toDate: '2025-12-13',
 *   reason: 'base_accrual',
 * });
 * ```
 */
export function useLoyaltyLedger(query: LedgerListQuery) {
  const { playerId, casinoId, ...filters } = query;

  return useQuery({
    queryKey: loyaltyKeys.ledger(playerId, casinoId, filters),
    queryFn: (): Promise<LedgerPageResponse> => getLedger(query),
    enabled: !!(playerId && casinoId),
    staleTime: 30_000, // 30 seconds - append-only ledger
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches ledger entries with infinite scroll (cursor-based pagination).
 *
 * @param playerId - Player UUID (required, undefined disables query)
 * @param casinoId - Casino UUID (required, undefined disables query)
 * @param filters - Optional filters (ratingSlipId, visitId, reason, dates)
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useLoyaltyLedgerInfinite(playerId, casinoId, {
 *   reason: 'base_accrual',
 * });
 *
 * // Render all pages
 * const allEntries = data?.pages.flatMap(page => page.entries) ?? [];
 * ```
 */
export function useLoyaltyLedgerInfinite(
  playerId: string | undefined,
  casinoId: string | undefined,
  filters: Omit<LedgerListQuery, 'playerId' | 'casinoId' | 'cursor'> = {},
) {
  return useInfiniteQuery({
    queryKey: loyaltyKeys.ledgerInfinite(playerId!, casinoId!, filters),
    queryFn: ({ pageParam }): Promise<LedgerPageResponse> =>
      getLedger({
        playerId: playerId!,
        casinoId: casinoId!,
        cursor: pageParam,
        ...filters,
      }),
    enabled: !!(playerId && casinoId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches session reward suggestion for a rating slip (read-only preview).
 * Does NOT mint points - used for UI preview during active session.
 *
 * @param ratingSlipId - Rating slip UUID (required, undefined disables query)
 * @param asOfTs - Optional timestamp for "what-if" calculations (ISO 8601)
 *
 * @example
 * ```tsx
 * // Get current suggestion for active rating slip
 * const { data: suggestion, isLoading } = useLoyaltySuggestion(ratingSlipId);
 * if (suggestion) {
 *   console.log('Estimated points:', suggestion.suggestedPoints);
 *   console.log('Based on theo:', suggestion.suggestedTheo);
 * }
 *
 * // Get suggestion at specific timestamp (what-if scenario)
 * const { data } = useLoyaltySuggestion(ratingSlipId, '2025-12-13T10:00:00Z');
 * ```
 */
export function useLoyaltySuggestion(
  ratingSlipId: string | undefined,
  asOfTs?: string,
) {
  return useQuery({
    queryKey: loyaltyKeys.suggestion(ratingSlipId!),
    queryFn: (): Promise<SessionRewardSuggestionOutput> =>
      evaluateSuggestion(ratingSlipId!, asOfTs),
    enabled: !!ratingSlipId,
    staleTime: 10_000, // 10 seconds - live preview during session
    refetchOnWindowFocus: true,
  });
}
