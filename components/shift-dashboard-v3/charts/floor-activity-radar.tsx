'use client';

import { useCallback, useState } from 'react';
import { Pie, PieChart, Sector } from 'recharts';
import type { SectorProps } from 'recharts';

import { Card } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
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

function ActiveShape(props: SectorProps) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle,
    endAngle,
    fill,
  } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 5}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

export function FloorActivityRadar({
  ratedCount,
  unratedCount,
  ratedPercentage,
  isLoading,
}: FloorActivityRadarProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const onMouseEnter = useCallback(
    (_: unknown, index: number) => setActiveIndex(index),
    [],
  );

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-[88px] shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </Card>
    );
  }

  const total = ratedCount + unratedCount;
  const computedPercentage =
    ratedPercentage ?? (total > 0 ? (ratedCount / total) * 100 : 0);

  const chartData = [
    { name: 'rated', value: ratedCount, fill: 'var(--color-rated)' },
    { name: 'unrated', value: unratedCount, fill: 'var(--color-unrated)' },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Floor Activity
        </p>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {total} active
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ChartContainer config={chartConfig} className="size-[88px] shrink-0">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={26}
              outerRadius={38}
              activeIndex={activeIndex}
              activeShape={ActiveShape}
              onMouseEnter={onMouseEnter}
            />
          </PieChart>
        </ChartContainer>

        <div className="flex min-w-0 flex-col gap-2">
          <div>
            <p
              className="text-2xl font-bold tabular-nums text-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              {formatPercentage(computedPercentage)}
            </p>
            <p
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              of floor rated
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono text-xs text-foreground">
                {ratedCount} rated
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-slate-500" />
              <span className="font-mono text-xs text-muted-foreground">
                {unratedCount} unrated
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
