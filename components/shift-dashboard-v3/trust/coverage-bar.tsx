'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPercentage } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CoverageTier } from '@/services/table-context/shift-metrics/snapshot-rules';

export interface CoverageBarProps {
  /** Coverage ratio 0.0 to 1.0 */
  ratio: number;
  /** Coverage tier for color coding */
  tier: CoverageTier;
  /** Breakdown counts for tooltip */
  tablesWithOpening?: number;
  tablesWithClosing?: number;
  totalTables?: number;
  /** Height variant */
  size?: 'sm' | 'md';
  className?: string;
}

const TIER_COLORS: Record<CoverageTier, string> = {
  HIGH: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-red-500',
  NONE: 'bg-zinc-400',
};

const TIER_LABELS: Record<CoverageTier, string> = {
  HIGH: 'High coverage',
  MEDIUM: 'Medium coverage',
  LOW: 'Low coverage',
  NONE: 'No coverage',
};

/**
 * Coverage bar — displays snapshot coverage ratio as a progress bar.
 *
 * Color-coded by coverage tier:
 * - GREEN (>=80%): High coverage
 * - AMBER (50-79%): Medium coverage
 * - RED (1-49%): Low coverage
 * - GRAY (0%): No coverage
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §3.4
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md §1.3
 */
export function CoverageBar({
  ratio,
  tier,
  tablesWithOpening,
  tablesWithClosing,
  totalTables,
  size = 'sm',
  className,
}: CoverageBarProps) {
  const percentage = Math.round(ratio * 100);
  const barHeight = size === 'sm' ? 'h-1.5' : 'h-2';
  const hasBreakdown =
    tablesWithOpening != null &&
    tablesWithClosing != null &&
    totalTables != null;

  const bar = (
    <div
      data-testid="coverage-bar"
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${TIER_LABELS[tier]}: ${percentage}%`}
      className={cn(
        'flex w-full overflow-hidden rounded-full bg-muted',
        barHeight,
        className,
      )}
    >
      {percentage > 0 && (
        <div
          className={cn(
            TIER_COLORS[tier],
            'transition-all duration-300 rounded-full',
          )}
          style={{ width: `${percentage}%` }}
        />
      )}
    </div>
  );

  if (!hasBreakdown) return bar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{bar}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <div className="text-xs font-medium">
            {TIER_LABELS[tier]} ({formatPercentage(ratio * 100)})
          </div>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>
              Opening snapshots: {tablesWithOpening}/{totalTables}
            </div>
            <div>
              Closing snapshots: {tablesWithClosing}/{totalTables}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
