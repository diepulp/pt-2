/**
 * Player Eligibility Query Hook
 *
 * Fetches detailed rewards eligibility status for a player.
 * Used in Left Rail rewards card and eligibility indicators.
 *
 * @see services/player360-dashboard - Service layer
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getPlayerSummary } from '@/services/player360-dashboard/crud';
import type { RewardsEligibilityDTO } from '@/services/player360-dashboard/dtos';
import { player360DashboardKeys } from '@/services/player360-dashboard/keys';

// === Hook Options ===

/**
 * Options for player eligibility query.
 */
export interface UsePlayerEligibilityOptions {
  /** Override gaming day context (YYYY-MM-DD) */
  gamingDay?: string;
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds (default: 30s) */
  staleTime?: number;
}

// === Hook Implementation ===

/**
 * Fetches detailed rewards eligibility for a player.
 *
 * Returns eligibility status with reason codes and guidance text.
 * This hook extracts the eligibility portion from the summary query
 * to provide a focused API for eligibility-only consumers.
 *
 * CRITICAL: Casino context is derived from RLS (ADR-024).
 * No casinoId parameter is required.
 *
 * @param playerId - Player UUID
 * @param options - Query options
 * @returns Query result with RewardsEligibilityDTO
 *
 * @example
 * ```tsx
 * function RewardsEligibilityCard({ playerId }: { playerId: string }) {
 *   const { data, isLoading, error } = usePlayerEligibility(playerId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorState />;
 *
 *   return (
 *     <div>
 *       <StatusBadge status={data.status} />
 *       {data.guidance && <p>{data.guidance}</p>}
 *       {data.nextEligibleAt && (
 *         <Countdown until={data.nextEligibleAt} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerEligibility(
  playerId: string,
  options: UsePlayerEligibilityOptions = {},
) {
  const { gamingDay, enabled = true, staleTime = 30_000 } = options;

  const supabase = createBrowserComponentClient();

  return useQuery({
    // Use summary query key - data will be shared/cached with usePlayerSummary
    queryKey: player360DashboardKeys.summary({ playerId, gamingDay }),
    queryFn: () => getPlayerSummary(supabase, playerId, gamingDay!),
    enabled: enabled && !!playerId && !!gamingDay,
    staleTime,
    // Select only the eligibility portion
    select: (data): RewardsEligibilityDTO => data.rewardsEligibility,
  });
}

// === Re-export Types for Convenience ===

export type {
  ReasonCode,
  RewardsEligibilityDTO,
} from '@/services/player360-dashboard/dtos';
