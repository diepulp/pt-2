/**
 * Rating Slip Query Hooks
 *
 * Hooks for fetching rating slip list, detail, and duration data.
 * Uses React Query with surgical cache invalidation via key factories.
 *
 * @see services/rating-slip/http.ts - HTTP fetchers
 * @see services/rating-slip/keys.ts - Query key factory
 * @see PRD-002 Rating Slip Service
 */

import { useQuery } from '@tanstack/react-query';

import type {
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipWithPausesDTO,
} from '@/services/rating-slip/dtos';
import {
  getRatingSlip,
  getRatingSlipDuration,
  listRatingSlips,
} from '@/services/rating-slip/http';
import { ratingSlipKeys } from '@/services/rating-slip/keys';

/**
 * Fetches a single rating slip by ID with pause history.
 *
 * @param slipId - Rating slip UUID (undefined disables the query)
 */
export function useRatingSlip(slipId: string | undefined) {
  return useQuery({
    queryKey: ratingSlipKeys.detail(slipId!),
    queryFn: () => getRatingSlip(slipId!),
    enabled: !!slipId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetches a paginated list of rating slips with optional filters.
 *
 * @param filters - Optional filters for table_id, visit_id, status, pagination
 */
export function useRatingSlipList(filters?: RatingSlipListFilters) {
  return useQuery({
    queryKey: ratingSlipKeys.list(filters),
    queryFn: () => listRatingSlips(filters),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetches rating slips for a specific gaming table.
 *
 * @param tableId - Gaming table UUID (undefined disables the query)
 * @param filters - Optional additional filters (status, pagination)
 */
export function useRatingSlipsForTable(
  tableId: string | undefined,
  filters?: Omit<RatingSlipListFilters, 'table_id' | 'visit_id'>,
) {
  return useQuery({
    queryKey: ratingSlipKeys.forTable(tableId!, filters),
    queryFn: () => listRatingSlips({ ...filters, table_id: tableId }),
    enabled: !!tableId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetches the calculated duration for a rating slip.
 * Duration excludes paused intervals.
 *
 * For open/paused slips, auto-refreshes every minute.
 * For closed slips, returns the finalized duration.
 *
 * @param slipId - Rating slip UUID (undefined disables the query)
 */
export function useRatingSlipDuration(slipId: string | undefined) {
  return useQuery({
    queryKey: ratingSlipKeys.duration(slipId!),
    queryFn: () => getRatingSlipDuration(slipId!),
    enabled: !!slipId,
    refetchInterval: 60_000, // Refresh every minute for active slips
    staleTime: 30_000, // 30 seconds
  });
}

// Re-export types for convenience
export type { RatingSlipDTO, RatingSlipListFilters, RatingSlipWithPausesDTO };
