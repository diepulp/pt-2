/**
 * Reward Catalog Query Hooks
 *
 * React Query hooks for fetching reward catalog data.
 * Used by pit bosses to view and manage reward catalog entries.
 *
 * @see services/loyalty/reward/http.ts - HTTP fetchers
 * @see services/loyalty/reward/keys.ts - Query key factory (rewardKeys)
 * @see PRD-LOYALTY-ADMIN-CATALOG
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type {
  RewardCatalogDTO,
  RewardDetailDTO,
  RewardListQuery,
} from '@/services/loyalty/reward/dtos';
import { getReward, listRewards } from '@/services/loyalty/reward/http';
import { rewardKeys } from '@/services/loyalty/reward/keys';

/**
 * Fetches list of rewards with optional filters.
 *
 * @param query - Optional filters (family, kind, isActive, search, limit, offset)
 * @param options - Additional query options (enabled, etc.)
 *
 * @example
 * ```tsx
 * // List all rewards
 * const { data: rewards, isLoading } = useRewards();
 *
 * // List only active rewards
 * const { data } = useRewards({ isActive: true });
 *
 * // Filter by family
 * const { data } = useRewards({ family: 'points_comp' });
 * ```
 */
export function useRewards(
  query: RewardListQuery = {},
  options?: { enabled?: boolean },
) {
  const { family, kind, isActive, search } = query;

  return useQuery({
    queryKey: rewardKeys.list({ family, kind, isActive, search }),
    queryFn: (): Promise<RewardCatalogDTO[]> => listRewards(query),
    enabled: options?.enabled ?? true,
    staleTime: 60_000, // 1 minute - catalog doesn't change frequently
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetches a single reward by ID with full details.
 *
 * @param rewardId - Reward UUID (required, undefined disables query)
 *
 * @example
 * ```tsx
 * const { data: reward, isLoading } = useReward(rewardId);
 * if (reward) {
 *   console.log('Reward:', reward.name);
 *   console.log('Family:', reward.family);
 * }
 * ```
 */
export function useReward(rewardId: string | undefined) {
  return useQuery({
    queryKey: rewardKeys.detail(rewardId!),
    queryFn: (): Promise<RewardDetailDTO | null> => getReward(rewardId!),
    enabled: !!rewardId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}
