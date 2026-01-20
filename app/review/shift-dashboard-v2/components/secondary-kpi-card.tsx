/**
 * Secondary KPI Card
 *
 * Reusable KPI card for secondary metrics (Fills, Credits, Est. Drop).
 * Supports trend indicators and count subtitles.
 *
 * @see IMPLEMENTATION_STRATEGY.md §7.3
 */

'use client';

import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { formatCurrency, formatCurrencyDelta } from '../lib/format';

export interface SecondaryKpiCardProps {
  /** KPI title */
  title: string;
  /** Value in cents */
  valueCents: number | null | undefined;
  /** Subtitle (e.g., "12 transactions") */
  subtitle?: string;
  /** Trend delta in cents */
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  /** Left border accent color class */
  accentColor: string;
  /** Loading state */
  isLoading?: boolean;
}

export function SecondaryKpiCard({
  title,
  valueCents,
  subtitle,
  trend,
  accentColor,
  isLoading,
}: SecondaryKpiCardProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />
        <div className="p-4 pl-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2 h-7 w-24" />
          <Skeleton className="mt-1 h-4 w-20" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Colored left accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />

      <div className="p-4 pl-5">
        {/* Title */}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        {/* Value */}
        <p className="mt-2 text-2xl font-semibold font-mono tabular-nums">
          {formatCurrency(valueCents)}
        </p>

        {/* Subtitle */}
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}

        {/* Trend indicator */}
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {trend.direction === 'up' ? (
              <>
                <TrendingUpIcon className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">
                  {formatCurrencyDelta(trend.value)}
                </span>
              </>
            ) : (
              <>
                <TrendingDownIcon className="h-3 w-3 text-rose-500" />
                <span className="text-rose-500">
                  {formatCurrencyDelta(-trend.value)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
