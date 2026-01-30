/**
 * Player Timeline Query Hooks
 *
 * React Query hooks for the Player 360 interaction timeline (ADR-029).
 * Provides both basic and infinite query patterns for timeline data.
 *
 * @see services/player-timeline - Timeline service layer
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS2-D
 */

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { createBrowserComponentClient } from '@/lib/supabase/client';
import { getPlayerTimeline } from '@/services/player-timeline/crud';
import type {
  TimelineCursor,
  TimelineFilters,
  TimelineResponse,
} from '@/services/player-timeline/dtos';
import { playerTimelineKeys } from '@/services/player-timeline/keys';

// === Hook Options ===

/**
 * Options for basic timeline query.
 */
export interface UsePlayerTimelineOptions extends TimelineFilters {
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds (default: 30s) */
  staleTime?: number;
}

/**
 * Options for infinite timeline query.
 */
export interface UseInfinitePlayerTimelineOptions {
  /** Filter options */
  filters?: TimelineFilters;
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds (default: 30s) */
  staleTime?: number;
}

// === Basic Timeline Query Hook ===

/**
 * Fetches a single page of player timeline events.
 *
 * Use this for simple, non-paginated timeline displays.
 * For infinite scroll or "Load More" functionality, use `useInfinitePlayerTimeline`.
 *
 * CRITICAL: Casino context is derived from RLS (ADR-024).
 * No casinoId parameter is required.
 *
 * @param playerId - Player UUID
 * @param options - Query options including filters and React Query config
 * @returns Query result with timeline data
 *
 * @example
 * ```tsx
 * function PlayerTimelinePanel({ playerId }: { playerId: string }) {
 *   const { data, isLoading, error } = usePlayerTimeline(playerId, {
 *     eventTypes: ['visit_start', 'cash_in', 'rating_start'],
 *     limit: 20,
 *   });
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return (
 *     <ul>
 *       {data?.events.map(event => (
 *         <TimelineItem key={event.eventId} event={event} />
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePlayerTimeline(
  playerId: string,
  options: UsePlayerTimelineOptions = {},
) {
  const {
    eventTypes,
    fromDate,
    toDate,
    limit,
    enabled = true,
    staleTime = 30_000, // 30 seconds
  } = options;

  const supabase = createBrowserComponentClient();

  return useQuery({
    queryKey: playerTimelineKeys.list(playerId, {
      eventTypes,
      fromDate,
      toDate,
      limit,
    }),
    queryFn: () =>
      getPlayerTimeline(supabase, {
        playerId,
        eventTypes,
        fromDate,
        toDate,
        limit,
      }),
    enabled: enabled && !!playerId,
    staleTime,
  });
}

// === Infinite Timeline Query Hook ===

/**
 * Fetches player timeline events with infinite scroll pagination.
 *
 * Uses keyset pagination with (occurredAt, eventId) cursor for stable results.
 * Ideal for "Load More" buttons or infinite scroll UIs.
 *
 * CRITICAL: Casino context is derived from RLS (ADR-024).
 * No casinoId parameter is required.
 *
 * @param playerId - Player UUID
 * @param options - Query options including filters and React Query config
 * @returns Infinite query result with pages of timeline data
 *
 * @example
 * ```tsx
 * function InfiniteTimelinePanel({ playerId }: { playerId: string }) {
 *   const {
 *     data,
 *     isLoading,
 *     error,
 *     fetchNextPage,
 *     hasNextPage,
 *     isFetchingNextPage,
 *   } = useInfinitePlayerTimeline(playerId, {
 *     filters: {
 *       eventTypes: ['visit_start', 'cash_in', 'rating_start'],
 *       limit: 20,
 *     },
 *   });
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *
 *   // Flatten pages to get all events
 *   const allEvents = data?.pages.flatMap(page => page.events) ?? [];
 *
 *   return (
 *     <div>
 *       <ul>
 *         {allEvents.map(event => (
 *           <TimelineItem key={event.eventId} event={event} />
 *         ))}
 *       </ul>
 *       {hasNextPage && (
 *         <Button
 *           onClick={() => fetchNextPage()}
 *           disabled={isFetchingNextPage}
 *         >
 *           {isFetchingNextPage ? 'Loading...' : 'Load More'}
 *         </Button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useInfinitePlayerTimeline(
  playerId: string,
  options: UseInfinitePlayerTimelineOptions = {},
) {
  const { filters = {}, enabled = true, staleTime = 30_000 } = options;
  const { eventTypes, fromDate, toDate, limit } = filters;

  const supabase = createBrowserComponentClient();

  return useInfiniteQuery({
    queryKey: playerTimelineKeys.infinite(playerId, filters),
    queryFn: ({ pageParam }) =>
      getPlayerTimeline(supabase, {
        playerId,
        eventTypes,
        fromDate,
        toDate,
        limit,
        cursorAt: pageParam?.cursorAt,
        cursorId: pageParam?.cursorId,
      }),
    initialPageParam: null as TimelineCursor | null,
    getNextPageParam: (lastPage: TimelineResponse) => {
      // Return null if no more pages
      if (
        !lastPage.hasMore ||
        !lastPage.nextCursorAt ||
        !lastPage.nextCursorId
      ) {
        return null;
      }
      // Return cursor for next page
      return {
        cursorAt: lastPage.nextCursorAt,
        cursorId: lastPage.nextCursorId,
      };
    },
    enabled: enabled && !!playerId,
    staleTime,
  });
}

// === Re-export Types for Convenience ===

export type {
  InteractionEventDTO,
  InteractionEventType,
  Phase1EventType,
  TimelineFilters,
  TimelineResponse,
} from '@/services/player-timeline/dtos';
