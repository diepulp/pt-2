/**
 * Visit Query Hooks
 *
 * Hooks for fetching visit list and detail data.
 *
 * @see services/visit/http.ts - HTTP fetchers
 * @see services/visit/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useQuery } from '@tanstack/react-query';

import type {
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from '@/services/visit/dtos';
import { getVisit, getVisits } from '@/services/visit/http';
import { visitKeys } from '@/services/visit/keys';

/**
 * Fetches a paginated list of visits.
 *
 * @param filters - Optional filters for player_id, status, date range, cursor, limit
 */
export function useVisits(filters: VisitListFilters = {}) {
  return useQuery({
    queryKey: visitKeys.list(filters),
    queryFn: () => getVisits(filters),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetches a single visit by ID.
 *
 * @param visitId - Visit UUID
 */
export function useVisit(visitId: string) {
  return useQuery({
    queryKey: visitKeys.detail(visitId),
    queryFn: () => getVisit(visitId),
    enabled: !!visitId,
    staleTime: 60_000, // 1 minute
  });
}

// Re-export types for convenience
export type { VisitDTO, VisitListFilters, VisitWithPlayerDTO };
