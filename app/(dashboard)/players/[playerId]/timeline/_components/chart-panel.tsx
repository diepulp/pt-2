/**
 * Chart Panel — Isolated subscription boundary
 *
 * Owns usePlayerWeeklySeries hook.
 * Renders ActivityChart inside a collapsible card.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 */

'use client';

import { ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { usePlayerWeeklySeries } from '@/hooks/player-360';
import { useTimelineFilterStore } from '@/hooks/player-360/use-timeline-filter';

// Lazy-load ActivityChart to remove Recharts (~480KB) from initial bundle (PERF-006 WS5)
const ActivityChart = dynamic(
  () =>
    import('@/components/player-360/charts/activity-chart').then((m) => ({
      default: m.ActivityChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
    ),
  },
);

interface ChartPanelProps {
  playerId: string;
  onBucketClick?: (weekStart: string) => void;
}

export function ChartPanel({ playerId, onBucketClick }: ChartPanelProps) {
  const timeLens = useTimelineFilterStore((s) => s.timeLens);
  const [isChartCollapsed, setIsChartCollapsed] = React.useState(false);

  const { data: weeklyData, isLoading: isWeeklyLoading } =
    usePlayerWeeklySeries(playerId, { timeLens });

  return (
    <div id="chart" className="px-4 pb-4">
      <Collapsible
        open={!isChartCollapsed}
        onOpenChange={(open) => setIsChartCollapsed(!open)}
      >
        <Card>
          <CardHeader className="py-3 px-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <CardTitle className="text-sm font-semibold">Activity</CardTitle>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isChartCollapsed ? '' : 'rotate-180'}`}
              />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              {isWeeklyLoading ? (
                <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
              ) : weeklyData ? (
                <ActivityChart
                  data={weeklyData}
                  height={180}
                  onBucketClick={onBucketClick}
                />
              ) : null}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
