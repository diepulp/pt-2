/**
 * Recent Events Query Hook
 *
 * Fetches recent events (last buy-in, reward, note) for Player 360 timeline strip.
 *
 * @see services/player360-dashboard/crud.ts - getRecentEvents
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getRecentEvents } from '@/services/player360-dashboard/crud';
import type { RecentEventsDTO } from '@/services/player360-dashboard/dtos';

import { player360Keys } from './keys';

/**
 * Hook to fetch recent events (last buy-in, reward, note) for Player 360 timeline strip.
 *
 * @param playerId - Player UUID
 * @returns Query result with RecentEventsDTO
 *
 * @example
 * ```tsx
 * const { data: recentEvents } = useRecentEvents(playerId);
 * ```
 */
export function useRecentEvents(playerId: string) {
  const supabase = createBrowserComponentClient();

  return useQuery<RecentEventsDTO>({
    queryKey: player360Keys.recentEvents(playerId),
    queryFn: () => getRecentEvents(supabase, playerId),
    enabled: !!playerId,
    staleTime: 30_000, // 30 seconds
  });
}
