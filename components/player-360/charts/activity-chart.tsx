/**
 * Activity Chart Component
 *
 * Combined bar chart showing visits and rewards over time.
 * Implements Trend Pattern B: single chart with dual series.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { format, parseISO } from 'date-fns';
import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { WeeklySeriesDTO } from '@/hooks/player-360';
import { cn } from '@/lib/utils';

// === Props ===

export interface ActivityChartProps {
  /** Weekly series data */
  data: WeeklySeriesDTO;
  /** Handler for bucket click (to filter timeline by date range) */
  onBucketClick?: (weekStart: string) => void;
  /** Chart height (default: 200) */
  height?: number;
  /** Additional class names */
  className?: string;
}

// === Chart Colors ===

const VISIT_COLOR = 'hsl(217, 91%, 60%)'; // blue-500
const REWARD_COLOR = 'hsl(45, 93%, 47%)'; // amber-500

// === Formatters ===

function formatWeekLabel(weekStart: string): string {
  try {
    return format(parseISO(weekStart), 'MMM d');
  } catch {
    return weekStart;
  }
}

// === Custom Tooltip ===

interface TooltipPayload {
  value: number;
  dataKey: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover border border-border rounded-md shadow-md p-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {entry.dataKey === 'visitCount' ? 'Visits' : 'Rewards'}:
          </span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// === Component ===

/**
 * Activity chart with visits and rewards series.
 *
 * @example
 * ```tsx
 * function ActivityPanel({ playerId }: { playerId: string }) {
 *   const { timeLens } = useTimelineFilter();
 *   const { data } = usePlayerWeeklySeries(playerId, { timeLens });
 *
 *   if (!data) return <ChartSkeleton />;
 *
 *   return (
 *     <ActivityChart
 *       data={data}
 *       onBucketClick={(weekStart) => {
 *         // Apply date filter to timeline
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export const ActivityChart = memo(function ActivityChart({
  data,
  onBucketClick,
  height = 200,
  className,
}: ActivityChartProps) {
  // Transform data for chart
  const chartData = data.buckets.map((bucket) => ({
    ...bucket,
    weekLabel: formatWeekLabel(bucket.weekStart),
  }));

  return (
    <div
      className={cn('w-full', className)}
      data-testid="activity-chart"
      role="img"
      aria-label={`Activity chart showing visits and rewards from ${data.periodStart} to ${data.periodEnd}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
            opacity={0.3}
          />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-xs text-muted-foreground">
                {value === 'visitCount' ? 'Visits' : 'Rewards'}
              </span>
            )}
          />
          <Bar
            dataKey="visitCount"
            fill={VISIT_COLOR}
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
            cursor={onBucketClick ? 'pointer' : undefined}
            onClick={(_data, _index, e) => {
              // Access weekStart from the original data payload
              const payload = (
                e as unknown as { payload?: { weekStart?: string } }
              )?.payload;
              if (onBucketClick && payload?.weekStart) {
                onBucketClick(payload.weekStart);
              }
            }}
          />
          <Bar
            dataKey="rewardCount"
            fill={REWARD_COLOR}
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
            cursor={onBucketClick ? 'pointer' : undefined}
            onClick={(_data, _index, e) => {
              const payload = (
                e as unknown as { payload?: { weekStart?: string } }
              )?.payload;
              if (onBucketClick && payload?.weekStart) {
                onBucketClick(payload.weekStart);
              }
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
