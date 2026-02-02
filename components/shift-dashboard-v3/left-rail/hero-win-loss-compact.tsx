'use client';

import { MetricGradeBadge } from '@/components/shift-dashboard-v3/trust';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWinLossColor } from '@/lib/colors';
import { formatCents } from '@/lib/format';

export interface HeroWinLossCompactProps {
  winLossCents: number | null | undefined;
  metricGrade?: 'ESTIMATE' | 'AUTHORITATIVE';
  isLoading?: boolean;
}

/**
 * Compact hero win/loss card for the left rail (~120px height).
 * Stripped-down variant: text-3xl value, color accent bar only.
 */
export function HeroWinLossCompact({
  winLossCents,
  metricGrade,
  isLoading,
}: HeroWinLossCompactProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden p-4">
        <Skeleton className="h-1 w-full absolute left-0 top-0" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-9 w-32" />
      </Card>
    );
  }

  const value = winLossCents ?? 0;
  const colorConfig = getWinLossColor(value);

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-1 w-full ${colorConfig.bg}`} />
      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Win/Loss
          </p>
          {metricGrade && <MetricGradeBadge grade={metricGrade} size="sm" />}
        </div>
        <p
          className={`mt-2 text-3xl font-semibold font-mono tabular-nums ${colorConfig.text}`}
        >
          {formatCents(value)}
        </p>
      </div>
    </Card>
  );
}
