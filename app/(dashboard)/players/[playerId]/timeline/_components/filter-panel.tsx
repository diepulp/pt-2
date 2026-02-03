/**
 * Filter Panel — Isolated subscription boundary
 *
 * Owns usePlayerSummary (read-only for filter tiles) + useTimelineFilter.
 * Renders FilterTileStack, RewardsEligibilityCard, JumpToNav.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 */

'use client';

import * as React from 'react';

import {
  FilterTileStack,
  JumpToNav,
  RewardsEligibilityCard,
} from '@/components/player-360';
import { usePlayerSummary, type SourceCategory } from '@/hooks/player-360';
import { useTimelineFilterStore } from '@/hooks/player-360/use-timeline-filter';

interface FilterPanelProps {
  playerId: string;
  gamingDay: string;
  onScrollToTimeline: () => void;
}

export function FilterPanel({
  playerId,
  gamingDay,
  onScrollToTimeline,
}: FilterPanelProps) {
  const activeCategory = useTimelineFilterStore((s) => s.activeCategory);
  const setCategory = useTimelineFilterStore((s) => s.setCategory);

  const { data: summaryData, isLoading: isSummaryLoading } = usePlayerSummary(
    playerId,
    { gamingDay },
  );

  const handleCategoryChange = React.useCallback(
    (category: SourceCategory | null) => {
      setCategory(category);
    },
    [setCategory],
  );

  const handleShowLoyaltyEvents = React.useCallback(() => {
    setCategory('loyalty');
    onScrollToTimeline();
  }, [setCategory, onScrollToTimeline]);

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Filter Tiles */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Quick Filters
        </h3>
        {isSummaryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 bg-muted/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : summaryData ? (
          <FilterTileStack
            data={summaryData}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
        ) : null}
      </div>

      {/* Rewards Eligibility */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Rewards
        </h3>
        {isSummaryLoading ? (
          <div className="h-24 bg-muted/30 rounded-lg animate-pulse" />
        ) : summaryData ? (
          <RewardsEligibilityCard
            data={summaryData.rewardsEligibility}
            onShowRelatedEvents={handleShowLoyaltyEvents}
          />
        ) : null}
      </div>

      {/* Jump To Navigation */}
      <div className="mt-auto">
        <JumpToNav
          targets={[
            { id: 'summary', label: 'Summary' },
            { id: 'chart', label: 'Activity Chart' },
            { id: 'timeline', label: 'Timeline' },
          ]}
        />
      </div>
    </div>
  );
}
