/**
 * Summary Panel — Isolated subscription boundary
 *
 * Owns usePlayerSummary + useRecentEvents hooks.
 * Renders SummaryBand, RecentEventsStrip, and loading/error states.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 */

'use client';

import * as React from 'react';

import {
  RecentEventsStrip,
  SummaryBand,
  TimeLensControl,
} from '@/components/player-360';
import { Card, CardContent } from '@/components/ui/card';
import {
  usePlayerSummary,
  useRecentEvents,
  useTimelineFilter,
  type SourceCategory,
} from '@/hooks/player-360';

interface SummaryPanelProps {
  playerId: string;
  gamingDay: string;
  onScrollToTimeline: () => void;
}

export function SummaryPanel({
  playerId,
  gamingDay,
  onScrollToTimeline,
}: SummaryPanelProps) {
  const { activeCategory, setCategory, timeLens, setTimeLens } =
    useTimelineFilter();

  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = usePlayerSummary(playerId, { gamingDay });

  const { data: recentEventsData } = useRecentEvents(playerId);
  const recentEvents = recentEventsData ?? {
    lastBuyIn: null,
    lastReward: null,
    lastNote: null,
  };

  const handleCategoryChange = React.useCallback(
    (category: SourceCategory | null) => {
      setCategory(category);
    },
    [setCategory],
  );

  return (
    <>
      {/* Summary Section */}
      <div id="summary" className="p-4 space-y-4">
        {/* Time Lens Control */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Session Summary</h2>
          <TimeLensControl value={timeLens} onChange={setTimeLens} />
        </div>

        {/* Summary Band */}
        {isSummaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-muted/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : summaryError ? (
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="p-4 text-sm text-destructive">
              Failed to load summary: {summaryError.message}
            </CardContent>
          </Card>
        ) : summaryData ? (
          <SummaryBand
            data={summaryData}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
        ) : null}
      </div>

      {/* Recent Events Strip */}
      <RecentEventsStrip
        data={recentEvents}
        onEventClick={(type) => {
          if (type === 'buyIn') setCategory('financial');
          if (type === 'reward') setCategory('loyalty');
          if (type === 'note') setCategory('staff');
          onScrollToTimeline();
        }}
      />
    </>
  );
}
