'use client';

import {
  MetricGradeBadge,
  MissingDataWarning,
  OpeningSourceBadge,
} from '@/components/shift-dashboard-v3/trust';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWinLossColor } from '@/lib/colors';
import { formatCents } from '@/lib/format';
import type { OpeningSource } from '@/services/table-context/shift-metrics/provenance';

export interface HeroWinLossCompactProps {
  winLossCents: number | null | undefined;
  metricGrade?: 'ESTIMATE' | 'AUTHORITATIVE';
  isLoading?: boolean;
  /** PRD-036: Opening source for provenance badge at casino level */
  openingSource?: OpeningSource | null;
  /** PRD-036: Number of tables missing a baseline */
  tablesMissingBaselineCount?: number;
  /** PRD-036: Total number of tables */
  tablesCount?: number;
}

/**
 * Compact hero win/loss card for the left rail (~120px height).
 * Stripped-down variant: text-3xl value, color accent bar only.
 *
 * PRD-036: Null-aware rendering and provenance indicators.
 */
export function HeroWinLossCompact({
  winLossCents,
  metricGrade,
  isLoading,
  openingSource,
  tablesMissingBaselineCount = 0,
  tablesCount = 0,
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

  // PRD-036: Null means no baseline — show N/A + CTA
  if (winLossCents == null) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-1 w-full bg-muted" />
        <div className="p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Win/Loss
            </p>
            {metricGrade && <MetricGradeBadge grade={metricGrade} size="sm" />}
          </div>
          <p className="mt-2 text-3xl font-semibold font-mono tabular-nums text-muted-foreground">
            N/A
          </p>
          <MissingDataWarning
            reason="Record opening count to calculate win/loss"
            variant="block"
            className="mt-2"
          />
        </div>
      </Card>
    );
  }

  const colorConfig = getWinLossColor(winLossCents);
  const hasMissingTables = tablesMissingBaselineCount > 0 && tablesCount > 0;

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-1 w-full ${colorConfig.bg}`} />
      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Win/Loss
          </p>
          {metricGrade && <MetricGradeBadge grade={metricGrade} size="sm" />}
          {openingSource && <OpeningSourceBadge source={openingSource} />}
        </div>
        <p
          className={`mt-2 text-3xl font-semibold font-mono tabular-nums ${colorConfig.text}`}
        >
          {formatCents(winLossCents)}
        </p>
        {hasMissingTables && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            {tablesMissingBaselineCount} of {tablesCount} tables missing
            baseline
          </p>
        )}
      </div>
    </Card>
  );
}
