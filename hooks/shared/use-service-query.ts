/**
 * Service Query Hook Template
 * Following PT-2 canonical architecture
 *
 * Generic React Query hook that bridges ServiceResult<T> pattern with React Query
 * Handles success/error transformation and provides type-safe query interface
 *
 * @pattern Result<T> → React Query mapping
 * @see hooks/shared/README.md for query key patterns and usage examples
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import type { ServiceResult } from "@/services/shared/types";

/**
 * Type-safe query hook for service layer integration
 *
 * Maps ServiceResult<T> pattern to React Query's expected format:
 * - Success: Returns unwrapped data of type T
 * - Error: Throws ServiceError for React Query error handling
 *
 * @template TData - The expected data type returned by the service
 * @param queryKey - Unique identifier for the query following domain pattern
 * @param queryFn - Service function that returns ServiceResult<TData>
 * @param options - React Query options (omits queryKey and queryFn to prevent override)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const { data: player, isLoading, error } = useServiceQuery(
 *   ['player', 'detail', playerId],
 *   () => getPlayerAction(playerId)
 * )
 *
 * // With conditional fetching
 * const { data: casino } = useServiceQuery(
 *   ['casino', 'detail', casinoId],
 *   () => getCasinoAction(casinoId),
 *   { enabled: !!casinoId }
 * )
 *
 * // With pagination
 * const { data: visits } = useServiceQuery(
 *   ['visit', 'list', page, limit],
 *   () => listVisitsAction({ page, limit }),
 *   { keepPreviousData: true }
 * )
 *
 * // With domain-specific freshness overrides
 * const { data: tables } = useServiceQuery(
 *   ['table', 'available', casinoId],
 *   () => listAvailableTablesAction(casinoId),
 *   {
 *     staleTime: 1000 * 30,   // 30 seconds for near-real-time data
 *     gcTime: 1000 * 60 * 5,  // Trim cache sooner to avoid stale availability
 *   },
 * )
 * ```
 */
export function useServiceQuery<TData>(
  queryKey: ReadonlyArray<string | number | boolean | undefined | null>,
  queryFn: () => Promise<ServiceResult<TData>>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<TData, Error>({
    queryKey,
    queryFn: async () => {
      const result = await queryFn();

      // ServiceResult error → React Query error
      if (!result.success || result.error) {
        const error = new Error(result.error?.message || "Service error");
        // Attach ServiceError details for error handling
        (error as Error & { code?: string; details?: unknown }).code =
          result.error?.code;
        (error as Error & { code?: string; details?: unknown }).details =
          result.error?.details;
        throw error;
      }

      // ServiceResult success → unwrapped data
      if (result.data === null) {
        throw new Error("Service returned null data for successful result");
      }

      return result.data;
    },
    ...options,
  });
}
