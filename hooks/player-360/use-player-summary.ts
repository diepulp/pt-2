/**
 * Player Summary Query Hook
 *
 * Fetches aggregated player summary for Snapshot Band tiles.
 * Combines session value, cash velocity, engagement, and rewards eligibility.
 *
 * @see services/player360-dashboard - Service layer
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getPlayerSummary } from '@/services/player360-dashboard/crud';
import type { PlayerSummaryDTO } from '@/services/player360-dashboard/dtos';
import { player360DashboardKeys } from '@/services/player360-dashboard/keys';

// === Hook Options ===

/**
 * Options for player summary query.
 */
export interface UsePlayerSummaryOptions {
  /** Override gaming day context (YYYY-MM-DD) */
  gamingDay?: string;
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds (default: 30s) */
  staleTime?: number;
}

// === Hook Implementation ===

/**
 * Fetches player summary metrics for Snapshot Band.
 *
 * Returns aggregated data for all 4 tiles:
 * - Session Value: net win/loss, theoretical estimate
 * - Cash Velocity: rate per hour, session total
 * - Engagement: status, duration, last seen
 * - Rewards Eligibility: status, next eligible, guidance
 *
 * CRITICAL: Casino context is derived from RLS (ADR-024).
 * No casinoId parameter is required.
 *
 * @param playerId - Player UUID
 * @param options - Query options
 * @returns Query result with PlayerSummaryDTO
 *
 * @example
 * ```tsx
 * function SnapshotBand({ playerId }: { playerId: string }) {
 *   const { data, isLoading, error } = usePlayerSummary(playerId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorState message={error.message} />;
 *
 *   return (
 *     <div className="grid grid-cols-4 gap-3">
 *       <SessionValueTile data={data.sessionValue} />
 *       <CashVelocityTile data={data.cashVelocity} />
 *       <EngagementTile data={data.engagement} />
 *       <RewardsEligibilityTile data={data.rewardsEligibility} />
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerSummary(
  playerId: string,
  options: UsePlayerSummaryOptions = {},
) {
  const { gamingDay, enabled = true, staleTime = 30_000 } = options;

  const supabase = createBrowserComponentClient();

  return useQuery({
    queryKey: player360DashboardKeys.summary({ playerId, gamingDay }),
    queryFn: () => getPlayerSummary(supabase, playerId, gamingDay!),
    enabled: enabled && !!playerId && !!gamingDay,
    staleTime,
  });
}

// === Re-export Types for Convenience ===

export type { PlayerSummaryDTO };
export type {
  PlayerCashVelocityDTO,
  PlayerEngagementDTO,
  PlayerSessionValueDTO,
  RewardsEligibilityDTO,
} from '@/services/player360-dashboard/dtos';
