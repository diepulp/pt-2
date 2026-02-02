'use client';

import * as React from 'react';
import { CartesianGrid, LabelList, Line, LineChart, XAxis } from 'recharts';

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
import { formatCents } from '@/lib/format';
import type { ShiftPitMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

export interface WinLossTrendChartProps {
  pitsData: ShiftPitMetricsDTO[] | undefined;
  isLoading?: boolean;
  visibleSeries?: Array<'winLoss' | 'fills' | 'credits'>;
}

type SeriesKey = 'winLoss' | 'fills' | 'credits';

const chartConfig = {
  winLoss: {
    label: 'Win/Loss',
    color: 'var(--color-emerald-500, #10b981)',
  },
  fills: {
    label: 'Fills',
    color: 'var(--color-blue-500, #3b82f6)',
  },
  credits: {
    label: 'Credits',
    color: 'var(--color-violet-500, #8b5cf6)',
  },
} satisfies ChartConfig;

const SERIES_COLORS: Record<SeriesKey, string> = {
  winLoss: 'var(--color-winLoss)',
  fills: 'var(--color-fills)',
  credits: 'var(--color-credits)',
};

function formatLabel(value: number): string {
  return formatCents(value);
}

/**
 * Win/Loss Trend Line Chart showing per-pit comparison
 * with optional fills/credits series toggle.
 */
export function WinLossTrendChart({
  pitsData,
  isLoading,
  visibleSeries: controlledSeries,
}: WinLossTrendChartProps) {
  const [internalSeries, setInternalSeries] = React.useState<SeriesKey[]>([
    'winLoss',
  ]);

  const activeSeries = controlledSeries ?? internalSeries;

  const toggleSeries = React.useCallback((series: SeriesKey) => {
    setInternalSeries((prev) => {
      if (prev.includes(series)) {
        // Don't allow removing all series
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== series);
      }
      return [...prev, series];
    });
  }, []);

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-[250px] w-full" />
      </Card>
    );
  }

  if (!pitsData || pitsData.length < 2) {
    return (
      <Card className="p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Win/Loss Trend
        </p>
        <div className="mt-4 flex min-h-[250px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Pit data unavailable for trend visualization
          </p>
        </div>
      </Card>
    );
  }

  const chartData = pitsData.map((pit) => ({
    pitLabel: pit.pit_id,
    winLoss: pit.win_loss_estimated_total_cents,
    fills: pit.fills_total_cents,
    credits: pit.credits_total_cents,
  }));

  const allButtons: { key: SeriesKey; label: string }[] = [
    { key: 'winLoss', label: 'Win/Loss' },
    { key: 'fills', label: 'Fills' },
    { key: 'credits', label: 'Credits' },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Win/Loss Trend
        </p>

        {/* Series toggle pills */}
        {!controlledSeries && (
          <div className="flex gap-1">
            {allButtons.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSeries(key)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  activeSeries.includes(key)
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ChartContainer
        config={chartConfig}
        className="mt-4 min-h-[250px] w-full"
      >
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="pitLabel"
            tickLine={false}
            axisLine={false}
            className="text-xs"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatCents(value as number)}
              />
            }
          />
          {activeSeries.includes('winLoss') && (
            <Line
              name="winLoss"
              type="natural"
              dataKey="winLoss"
              stroke={SERIES_COLORS.winLoss}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            >
              <LabelList
                dataKey="winLoss"
                position="top"
                offset={12}
                formatter={formatLabel}
                className="text-[10px] fill-foreground"
              />
            </Line>
          )}
          {activeSeries.includes('fills') && (
            <Line
              name="fills"
              type="natural"
              dataKey="fills"
              stroke={SERIES_COLORS.fills}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          )}
          {activeSeries.includes('credits') && (
            <Line
              name="credits"
              type="natural"
              dataKey="credits"
              stroke={SERIES_COLORS.credits}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          )}
          {activeSeries.length > 1 && (
            <ChartLegend content={<ChartLegendContent />} />
          )}
        </LineChart>
      </ChartContainer>
    </Card>
  );
}
