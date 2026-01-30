/**
 * Player Weekly Series Query Hook
 *
 * Fetches weekly activity series for Activity chart.
 * Aggregates visits and rewards by week over a configurable period.
 *
 * @see services/player360-dashboard - Service layer
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getWeeklySeries } from '@/services/player360-dashboard/crud';
import type { WeeklySeriesDTO } from '@/services/player360-dashboard/dtos';
import { player360DashboardKeys } from '@/services/player360-dashboard/keys';

// === Time Lens Types ===

/**
 * Time lens options for activity chart period.
 * - 30d: Last 30 days (~4 weeks)
 * - 90d: Last 90 days (~13 weeks)
 * - 12w: Last 12 weeks
 */
export type TimeLensRange = '30d' | '90d' | '12w';

/**
 * Converts time lens to number of weeks.
 */
function timeLensToWeeks(timeLens: TimeLensRange): number {
  switch (timeLens) {
    case '30d':
      return 4;
    case '90d':
      return 13;
    case '12w':
      return 12;
    default:
      return 12;
  }
}

// === Hook Options ===

/**
 * Options for weekly series query.
 */
export interface UsePlayerWeeklySeriesOptions {
  /** Time lens period (default: '12w') */
  timeLens?: TimeLensRange;
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
}

// === Hook Implementation ===

/**
 * Fetches weekly activity series for Activity chart.
 *
 * Returns visit and reward counts aggregated by week.
 * The time period is controlled by the timeLens parameter.
 *
 * CRITICAL: Casino context is derived from RLS (ADR-024).
 * No casinoId parameter is required.
 *
 * @param playerId - Player UUID
 * @param options - Query options including time lens
 * @returns Query result with WeeklySeriesDTO
 *
 * @example
 * ```tsx
 * function ActivityChart({ playerId }: { playerId: string }) {
 *   const { timeLens } = useTimelineFilter();
 *   const { data, isLoading } = usePlayerWeeklySeries(playerId, { timeLens });
 *
 *   if (isLoading) return <ChartSkeleton />;
 *
 *   return (
 *     <BarChart data={data.buckets}>
 *       <Bar dataKey="visitCount" fill="blue" />
 *       <Bar dataKey="rewardCount" fill="amber" />
 *     </BarChart>
 *   );
 * }
 * ```
 */
export function usePlayerWeeklySeries(
  playerId: string,
  options: UsePlayerWeeklySeriesOptions = {},
) {
  const { timeLens = '12w', enabled = true, staleTime = 300_000 } = options;

  const supabase = createBrowserComponentClient();
  const weeks = timeLensToWeeks(timeLens);

  return useQuery({
    queryKey: player360DashboardKeys.activity({ playerId, weeks }),
    queryFn: () => getWeeklySeries(supabase, playerId, weeks),
    enabled: enabled && !!playerId,
    staleTime,
  });
}

// === Re-export Types for Convenience ===

export type {
  WeeklyBucketDTO,
  WeeklySeriesDTO,
} from '@/services/player360-dashboard/dtos';
