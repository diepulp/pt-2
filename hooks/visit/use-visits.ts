/**
 * Query hook for fetching visits list with optional filters
 * Following PT-2 canonical architecture with React Query integration
 *
 * @pattern Query Key: ['visit', 'list', filters]
 * @staleTime 2 minutes - Visit lists may change with ongoing activity
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { getVisits } from "@/app/actions/visit-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";
import type { VisitDTO, VisitFilters } from "@/services/visit";

/**
 * Fetches a list of visits with optional filtering
 *
 * @param filters - Optional filters (playerId, casinoId, status, mode)
 * @returns React Query result with array of visits
 *
 * Filters support:
 * - playerId: Filter by specific player
 * - casinoId: Filter by specific casino
 * - status: Filter by visit status (active, completed, cancelled)
 * - mode: Filter by game mode (poker, craps, blackjack, slots, roulette)
 *
 * @example
 * ```typescript
 * // All visits
 * function VisitsList() {
 *   const { data: visits, isLoading } = useVisits();
 *   return <VisitTable visits={visits || []} />;
 * }
 *
 * // Filtered by player
 * function PlayerVisits({ playerId }: { playerId: string }) {
 *   const { data: visits } = useVisits({ playerId });
 *   return <VisitHistory visits={visits || []} />;
 * }
 *
 * // Filtered by casino and status
 * function ActiveCasinoVisits({ casinoId }: { casinoId: string }) {
 *   const { data: visits } = useVisits({ casinoId, status: 'active' });
 *   return <div>Active visits: {visits?.length || 0}</div>;
 * }
 * ```
 */
export function useVisits(filters?: VisitFilters) {
  // Serialize filters into query key for proper caching
  const queryKey = [
    "visit",
    "list",
    filters?.playerId,
    filters?.casinoId,
    filters?.status,
    filters?.mode,
  ] as const;

  return useServiceQuery<VisitDTO[]>(queryKey, () => getVisits(filters), {
    staleTime: 1000 * 60 * 2, // 2 minutes - shorter for potentially changing visit lists
  });
}
