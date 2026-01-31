'use client';

import { ShieldCheckIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercentage } from '@/lib/format';

export interface QualitySummaryCardProps {
  goodCoverageCount: number;
  lowCoverageCount: number;
  noCoverageCount: number;
  totalTables: number;
  isLoading?: boolean;
}

/**
 * Compact quality summary for the left rail (~80px).
 * Coverage percentage + grade distribution bar.
 */
export function QualitySummaryCard({
  goodCoverageCount,
  lowCoverageCount,
  noCoverageCount,
  totalTables,
  isLoading,
}: QualitySummaryCardProps) {
  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mt-2 h-2 w-full rounded-full" />
        <Skeleton className="mt-2 h-3 w-32" />
      </Card>
    );
  }

  const coveragePercent =
    totalTables > 0
      ? ((goodCoverageCount + lowCoverageCount) / totalTables) * 100
      : 0;

  const goodPct = totalTables > 0 ? (goodCoverageCount / totalTables) * 100 : 0;
  const lowPct = totalTables > 0 ? (lowCoverageCount / totalTables) * 100 : 0;
  const nonePct = totalTables > 0 ? (noCoverageCount / totalTables) * 100 : 0;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Quality
          </span>
        </div>
        <span className="text-sm font-semibold font-mono tabular-nums">
          {formatPercentage(coveragePercent)}
        </span>
      </div>

      {/* Grade distribution bar */}
      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {goodPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${goodPct}%` }}
          />
        )}
        {lowPct > 0 && (
          <div
            className="bg-amber-500 transition-all duration-300"
            style={{ width: `${lowPct}%` }}
          />
        )}
        {nonePct > 0 && (
          <div
            className="bg-slate-500 transition-all duration-300"
            style={{ width: `${nonePct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {goodCoverageCount}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {lowCoverageCount}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          {noCoverageCount}
        </span>
      </div>
    </Card>
  );
}
