'use client';

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import { Card } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercentage } from '@/lib/format';

export interface FloorActivityRadarProps {
  ratedCount: number;
  unratedCount: number;
  ratedPercentage?: number;
  isLoading?: boolean;
  pitBreakdown?: Array<{
    pitLabel: string;
    pitId: string;
    ratedCount: number;
    unratedCount: number;
  }>;
}

const chartConfig = {
  rated: {
    label: 'Rated',
    color: 'var(--color-emerald-500, #10b981)',
  },
  unrated: {
    label: 'Unrated',
    color: 'var(--color-slate-500, #64748b)',
  },
} satisfies ChartConfig;

/**
 * Floor Activity Radar Chart replacing the custom SVG donut.
 * Dual-mode: multi-axis per-pit breakdown or simple 2-axis fallback.
 */
export function FloorActivityRadar({
  ratedCount,
  unratedCount,
  ratedPercentage,
  isLoading,
  pitBreakdown,
}: FloorActivityRadarProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="mt-4 h-[200px] w-full" />
        <Skeleton className="mt-4 h-5 w-full" />
      </Card>
    );
  }

  const total = ratedCount + unratedCount;
  const computedPercentage =
    ratedPercentage ?? (total > 0 ? (ratedCount / total) * 100 : 0);

  // Build chart data based on available breakdown
  const chartData =
    pitBreakdown && pitBreakdown.length > 0
      ? pitBreakdown.map((pit) => ({
          axis: pit.pitLabel,
          rated: pit.ratedCount,
          unrated: pit.unratedCount,
        }))
      : [
          { axis: 'Rated', rated: ratedCount, unrated: 0 },
          { axis: 'Unrated', rated: 0, unrated: unratedCount },
        ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Floor Activity
        </p>
        <span className="text-sm font-mono tabular-nums text-muted-foreground">
          {total} active
        </span>
      </div>

      <ChartContainer
        config={chartConfig}
        className="mt-4 min-h-[200px] w-full"
      >
        <RadarChart data={chartData}>
          <PolarGrid gridType="circle" />
          <PolarAngleAxis dataKey="axis" className="text-xs" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Radar
            name="rated"
            dataKey="rated"
            fill="var(--color-rated)"
            fillOpacity={0.6}
            stroke="var(--color-rated)"
            strokeWidth={2}
          />
          <Radar
            name="unrated"
            dataKey="unrated"
            fill="var(--color-unrated)"
            fillOpacity={0.3}
            stroke="var(--color-unrated)"
            strokeWidth={1}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </RadarChart>
      </ChartContainer>

      {/* Key insight callout */}
      <div className="mt-4 rounded-md bg-emerald-500/10 px-3 py-2 text-center">
        <span className="text-sm font-medium text-emerald-500">
          {formatPercentage(computedPercentage)} of floor generating value
        </span>
      </div>
    </Card>
  );
}
