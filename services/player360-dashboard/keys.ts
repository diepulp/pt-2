/**
 * Player360DashboardService Query Keys
 *
 * React Query key factory for cache management.
 * Follows PT-2 key structure with serialized filters.
 *
 * @see PRD-023 Player 360 Panels v0
 */

import type {
  ActivityFilters,
  RewardHistoryFilters,
  SummaryFilters,
} from './dtos';

const ROOT = ['player360-dashboard'] as const;

/**
 * Serializes filter objects to a stable string key.
 * Uses local implementation for flexibility with filter types.
 */
const serialize = <T extends object>(filters: T = {} as T): string => {
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined,
  );
  entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

/**
 * Player360Dashboard query keys factory.
 *
 * Structure:
 * - root: ['player360-dashboard']
 * - summary: ['player360-dashboard', 'summary', serialized-filters]
 * - activity: ['player360-dashboard', 'activity', serialized-filters]
 * - rewardHistory: ['player360-dashboard', 'reward-history', serialized-filters]
 * - recentEvents: ['player360-dashboard', 'recent-events', playerId]
 */
export const player360DashboardKeys = {
  /** Root key for all player360-dashboard queries */
  root: ROOT,

  /**
   * Summary query key (Snapshot Band data).
   * @param filters - Summary query filters
   */
  summary: Object.assign(
    (filters: SummaryFilters) =>
      [...ROOT, 'summary', serialize(filters)] as const,
    { scope: [...ROOT, 'summary'] as const },
  ),

  /**
   * Activity query key (Weekly series for chart).
   * @param filters - Activity query filters
   */
  activity: Object.assign(
    (filters: ActivityFilters) =>
      [...ROOT, 'activity', serialize(filters)] as const,
    { scope: [...ROOT, 'activity'] as const },
  ),

  /**
   * Reward history query key (Recent rewards strip).
   * @param filters - Reward history query filters
   */
  rewardHistory: Object.assign(
    (filters: RewardHistoryFilters) =>
      [...ROOT, 'reward-history', serialize(filters)] as const,
    { scope: [...ROOT, 'reward-history'] as const },
  ),

  /**
   * Recent events query key (Timeline strip preview).
   * @param playerId - Player ID
   */
  recentEvents: (playerId: string) =>
    [...ROOT, 'recent-events', playerId] as const,
};
