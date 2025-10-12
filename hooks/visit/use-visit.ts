/**
 * Query hook for fetching a single visit by ID
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['visit', 'detail', id]
 * @staleTime 5 minutes - Visit details change infrequently
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { getVisit } from "@/app/actions/visit-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { VisitDTO } from "@/services/visit";

/**
 * Fetches a single visit by ID with automatic caching and refetching
 *
 * @param id - Visit UUID (undefined disables the query)
 * @returns React Query result with visit data
 *
 * @example
 * ```typescript
 * function VisitDetail({ visitId }: { visitId: string }) {
 *   const { data: visit, isLoading, error } = useVisit(visitId);
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!visit) return <div>Visit not found</div>;
 *
 *   return <div>Visit at {visit.casinoName} - {visit.status}</div>;
 * }
 * ```
 */
export function useVisit(id: string | undefined) {
  return useServiceQuery<VisitDTO>(
    ["visit", "detail", id] as const,
    () => getVisit(id!),
    {
      enabled: !!id, // Only run query if id exists
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );
}
