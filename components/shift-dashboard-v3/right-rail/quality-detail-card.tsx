'use client';

import { ShieldCheckIcon } from 'lucide-react';

import { TelemetryQualityIndicator } from '@/components/shift-dashboard-v3/trust';
import { Skeleton } from '@/components/ui/skeleton';

export interface QualityDetailCardProps {
  goodCount: number;
  lowCount: number;
  noneCount: number;
  isLoading?: boolean;
}

/**
 * Per-quality-tier breakdown for the right rail.
 * Shows GOOD/LOW/NONE counts with visual indicators.
 */
export function QualityDetailCard({
  goodCount,
  lowCount,
  noneCount,
  isLoading,
}: QualityDetailCardProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const tiers: Array<{
    quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
    count: number;
    textColor: string;
  }> = [
    {
      quality: 'GOOD_COVERAGE',
      count: goodCount,
      textColor: 'text-emerald-500',
    },
    {
      quality: 'LOW_COVERAGE',
      count: lowCount,
      textColor: 'text-amber-500',
    },
    {
      quality: 'NONE',
      count: noneCount,
      textColor: 'text-slate-400',
    },
  ];

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-1.5">
        <ShieldCheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Quality Detail
        </span>
      </div>
      {tiers.map((tier) => (
        <div
          key={tier.quality}
          className="flex items-center justify-between rounded bg-muted/20 px-2 py-1.5"
        >
          <TelemetryQualityIndicator
            quality={tier.quality}
            showLabel
            size="sm"
          />
          <span className={`text-xs font-mono tabular-nums ${tier.textColor}`}>
            {tier.count}
          </span>
        </div>
      ))}
    </div>
  );
}
