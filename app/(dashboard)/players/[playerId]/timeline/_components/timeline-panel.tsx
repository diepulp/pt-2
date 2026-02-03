/**
 * Timeline Panel — Isolated subscription boundary
 *
 * Owns useInfinitePlayerTimeline + useTimelineFilter hooks.
 * Renders GroupedTimeline with infinite scroll.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 */

'use client';

import * as React from 'react';

import {
  GroupedTimeline,
  toCollapsedCard,
} from '@/components/player-360/timeline';
import type { SourceCategory } from '@/hooks/player-360';
import { useTimelineFilterStore } from '@/hooks/player-360/use-timeline-filter';
import { useInfinitePlayerTimeline } from '@/hooks/player-timeline';
import type { InteractionEventType } from '@/services/player-timeline/dtos';

// === Category to Event Types Mapping ===

const CATEGORY_EVENT_TYPE_MAP: Record<SourceCategory, InteractionEventType[]> =
  {
    session: ['visit_start', 'visit_end', 'visit_resume'],
    gaming: ['rating_start', 'rating_pause', 'rating_resume', 'rating_close'],
    financial: [
      'cash_in',
      'cash_out',
      'cash_observation',
      'financial_adjustment',
    ],
    loyalty: [
      'points_earned',
      'points_redeemed',
      'points_adjusted',
      'promo_issued',
      'promo_redeemed',
    ],
    staff: ['note_added', 'tag_applied', 'tag_removed'],
    compliance: ['mtl_recorded'],
    identity: ['player_enrolled', 'identity_verified'],
  };

interface TimelinePanelProps {
  playerId: string;
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

export function TimelinePanel({ playerId, timelineRef }: TimelinePanelProps) {
  const activeCategory = useTimelineFilterStore((s) => s.activeCategory);
  const setCategory = useTimelineFilterStore((s) => s.setCategory);

  // Derive event type filters from active category
  const eventTypeFilters = React.useMemo(() => {
    if (!activeCategory) return undefined;
    return CATEGORY_EVENT_TYPE_MAP[activeCategory] ?? undefined;
  }, [activeCategory]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePlayerTimeline(playerId, {
    filters: {
      eventTypes: eventTypeFilters,
      limit: 50,
    },
  });

  // Flatten pages to get all events
  const allEvents = React.useMemo(
    () => data?.pages.flatMap((page) => page.events) ?? [],
    [data],
  );

  // Map to card format
  const cards = React.useMemo(
    () => allEvents.map(toCollapsedCard),
    [allEvents],
  );

  const handleCategoryChange = React.useCallback(
    (category: SourceCategory | null) => {
      setCategory(category);
    },
    [setCategory],
  );

  return (
    <div ref={timelineRef} id="timeline" className="flex-1 min-h-0">
      <GroupedTimeline
        cards={cards}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        hasNextPage={hasNextPage ?? false}
        isFetchingNextPage={isFetchingNextPage}
        onFetchNextPage={fetchNextPage}
        onRetry={() => {
          void refetch();
        }}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        onEventClick={(_event) => {
          // TODO: Open event detail panel
        }}
        groupIntervalMinutes={30}
      />
    </div>
  );
}
