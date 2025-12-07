/**
 * Active Visit Hook
 *
 * Hook for checking if a player has an active visit.
 * Used for check-in/check-out UI flows.
 *
 * @see services/visit/http.ts - HTTP fetchers
 * @see services/visit/keys.ts - Query key factory
 * @see PRD-003 Player & Visit Management
 */

import { useQuery } from '@tanstack/react-query';

import type { ActiveVisitDTO } from '@/services/visit/dtos';
import { getActiveVisit } from '@/services/visit/http';
import { visitKeys } from '@/services/visit/keys';

export interface UseActiveVisitOptions {
  /** Whether to enable the query (default: true if playerId is provided) */
  enabled?: boolean;
  /** Refetch interval in ms (default: none) */
  refetchInterval?: number;
}

/**
 * Fetches the active visit for a player (if any).
 *
 * Returns { has_active_visit: boolean, visit: VisitDTO | null }
 *
 * @param playerId - Player UUID to check
 * @param options - Query options
 *
 * @example
 * ```tsx
 * function CheckInButton({ playerId }) {
 *   const { data, isLoading } = useActiveVisit(playerId);
 *
 *   if (isLoading) return <Spinner />;
 *
 *   if (data.has_active_visit) {
 *     return <Button onClick={() => closeVisit(data.visit.id)}>Check Out</Button>;
 *   }
 *
 *   return <Button onClick={() => startVisit(playerId)}>Check In</Button>;
 * }
 * ```
 */
export function useActiveVisit(
  playerId: string,
  options: UseActiveVisitOptions = {},
) {
  const { enabled = true, refetchInterval } = options;

  return useQuery({
    queryKey: visitKeys.activeByPlayer(playerId),
    queryFn: () => getActiveVisit(playerId),
    enabled: enabled && !!playerId,
    staleTime: 10_000, // 10 seconds - active visits should be fresh
    refetchInterval,
  });
}

// Re-export types for convenience
export type { ActiveVisitDTO };
