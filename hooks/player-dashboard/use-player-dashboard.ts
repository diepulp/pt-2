/**
 * Player Dashboard Composite Hook
 *
 * Aggregates all data requirements for the player dashboard.
 * Coordinates multiple service queries in a single hook.
 *
 * Data availability status:
 * - Player profile: AVAILABLE (player service)
 * - Active visit/session: AVAILABLE (visit service)
 * - Loyalty balance: AVAILABLE (loyalty service)
 * - Rating slips: AVAILABLE (rating-slip service)
 * - Performance metrics: DEFERRED (requires player-analytics service)
 * - Compliance data: DEFERRED (requires player-compliance service)
 * - Player notes: DEFERRED (requires player-note service)
 *
 * @see components/player-dashboard/player-dashboard.tsx
 */

"use client";

import { usePlayerLoyalty } from "@/hooks/loyalty/use-loyalty-queries";
import { usePlayer } from "@/hooks/player/use-player";
import { useRatingSlipList } from "@/hooks/rating-slip/use-rating-slip";
import { useActiveVisit } from "@/hooks/visit/use-active-visit";

export interface UsePlayerDashboardOptions {
  /** Player ID to fetch dashboard data for */
  playerId: string | null;
  /** Casino ID for loyalty and other context-specific queries */
  casinoId: string | null;
  /** Whether to enable real-time refetching for active sessions */
  enableRealtime?: boolean;
}

export interface UsePlayerDashboardResult {
  /** Player profile data */
  player: ReturnType<typeof usePlayer>;
  /** Active visit status and data */
  activeVisit: ReturnType<typeof useActiveVisit>;
  /** Loyalty balance and tier information */
  loyalty: ReturnType<typeof usePlayerLoyalty>;
  /** Rating slips for active visit (if any) */
  ratingSlips: ReturnType<typeof useRatingSlipList>;
  /** Combined loading state - true if any critical query is loading */
  isLoading: boolean;
  /** Combined error state - true if any query has errored */
  hasError: boolean;
}

/**
 * Composite hook for player dashboard data.
 *
 * Fetches all available data for the player dashboard in a coordinated manner.
 * Handles loading states, error states, and dependencies between queries.
 *
 * @example
 * ```tsx
 * function PlayerDashboard() {
 *   const [playerId, setPlayerId] = useState<string | null>(null);
 *   const casinoId = 'casino-uuid'; // From casino context
 *
 *   const dashboard = usePlayerDashboard({
 *     playerId,
 *     casinoId,
 *     enableRealtime: true,
 *   });
 *
 *   if (dashboard.isLoading) return <Spinner />;
 *
 *   return (
 *     <div>
 *       <PlayerProfilePanel data={dashboard.player.data} />
 *       <SessionControlPanel
 *         activeVisit={dashboard.activeVisit.data}
 *         ratingSlips={dashboard.ratingSlips.data}
 *       />
 *       <LoyaltyPanel data={dashboard.loyalty.data} />
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerDashboard(
  options: UsePlayerDashboardOptions,
): UsePlayerDashboardResult {
  const { playerId, casinoId, enableRealtime = false } = options;

  // Core player identity
  const player = usePlayer(playerId ?? "");

  // Active visit status (for session controls)
  const activeVisit = useActiveVisit(playerId ?? "", {
    enabled: !!playerId,
    refetchInterval: enableRealtime ? 10_000 : undefined, // Poll every 10s if realtime enabled
  });

  // Loyalty balance and tier
  const loyalty = usePlayerLoyalty(
    playerId ?? undefined,
    casinoId ?? undefined,
  );

  // Rating slips for active visit (if player has active visit)
  const activeVisitId = activeVisit.data?.visit?.id;
  const ratingSlips = useRatingSlipList(
    activeVisitId
      ? {
          visit_id: activeVisitId,
          status: undefined, // Get all statuses (open, paused, closed)
        }
      : undefined,
  );

  // Derived states
  const isLoading =
    player.isLoading ||
    activeVisit.isLoading ||
    loyalty.isLoading ||
    (activeVisitId ? ratingSlips.isLoading : false);

  const hasError =
    player.isError ||
    activeVisit.isError ||
    loyalty.isError ||
    ratingSlips.isError;

  return {
    player,
    activeVisit,
    loyalty,
    ratingSlips,
    isLoading,
    hasError,
  };
}
