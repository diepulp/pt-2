/**
 * Query hook for fetching player loyalty data (READ-ONLY)
 * Following PT-2 canonical architecture with React Query integration
 *
 * CRITICAL: This hook is READ-ONLY for MTL domain
 * MTL components can display loyalty data but CANNOT mutate it
 *
 * @pattern Query Key: ['loyalty', 'player', playerId]
 * @staleTime 2 minutes - Loyalty data changes periodically
 * @see hooks/shared/use-service-query.ts for base template
 * @see docs/adr/ADR-003-state-management-strategy.md for query key patterns
 */

import { getPlayerLoyalty } from "@/app/actions/loyalty-actions";
import { useServiceQuery } from "@/hooks/shared/use-service-query";

/**
 * Player Loyalty DTO (Read-Only)
 */
export interface PlayerLoyaltyDTO {
  id: string;
  playerId: string;
  tier: string;
  currentBalance: number;
  lifetimePoints: number;
  tierProgress: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches player loyalty data (READ-ONLY)
 *
 * @param playerId - Player UUID (undefined disables the query)
 * @returns React Query result with loyalty data
 *
 * @example
 * ```typescript
 * function PlayerLoyaltyWidget({ playerId }: { playerId: string }) {
 *   const { data: loyalty, isLoading, error } = usePlayerLoyalty(playerId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Alert>Error loading loyalty data</Alert>;
 *   if (!loyalty) return <div>No loyalty data</div>;
 *
 *   return (
 *     <div>
 *       <div>Tier: {loyalty.tier}</div>
 *       <div>Balance: {loyalty.currentBalance} points</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlayerLoyalty(playerId: string | undefined) {
  return useServiceQuery<PlayerLoyaltyDTO>(
    ["loyalty", "player", playerId] as const,
    () => getPlayerLoyalty(playerId!),
    {
      enabled: !!playerId, // Only run query if playerId exists
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
  );
}
