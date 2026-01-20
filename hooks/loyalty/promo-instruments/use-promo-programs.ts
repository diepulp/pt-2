/**
 * Promo Programs Query Hooks
 *
 * React Query hooks for fetching promo program data.
 * Used by pit bosses to view and manage promotional instrument programs.
 *
 * @see services/loyalty/promo/http.ts - HTTP fetchers
 * @see services/loyalty/keys.ts - Query key factory
 * @see PRD-LOYALTY-PROMO
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { loyaltyKeys } from '@/services/loyalty/keys';
import type {
  PromoProgramDTO,
  PromoProgramListQuery,
} from '@/services/loyalty/promo/dtos';
import {
  getPromoProgram,
  listPromoPrograms,
} from '@/services/loyalty/promo/http';

/**
 * Fetches list of promo programs with optional filters.
 *
 * @param query - Optional filters (status, activeOnly, limit, offset)
 * @param options - Additional query options (enabled, etc.)
 *
 * @example
 * ```tsx
 * // List all programs
 * const { data: programs, isLoading } = usePromoPrograms();
 *
 * // List only active programs
 * const { data } = usePromoPrograms({ activeOnly: true });
 *
 * // Filter by status
 * const { data } = usePromoPrograms({ status: 'active' });
 * ```
 */
export function usePromoPrograms(
  query: PromoProgramListQuery = {},
  options?: { enabled?: boolean },
) {
  const { status, activeOnly } = query;

  return useQuery({
    queryKey: loyaltyKeys.promoPrograms({ status, activeOnly }),
    queryFn: (): Promise<PromoProgramDTO[]> => listPromoPrograms(query),
    enabled: options?.enabled ?? true,
    staleTime: 60_000, // 1 minute - programs don't change frequently
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches a single promo program by ID.
 *
 * @param programId - Program UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: program, isLoading } = usePromoProgram(programId);
 * if (program) {
 *   console.log('Program:', program.name);
 *   console.log('Face Value:', program.faceValueAmount);
 * }
 * ```
 */
export function usePromoProgram(programId: string | undefined) {
  return useQuery({
    queryKey: loyaltyKeys.promoProgram(programId!),
    queryFn: (): Promise<PromoProgramDTO | null> => getPromoProgram(programId!),
    enabled: !!programId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}
