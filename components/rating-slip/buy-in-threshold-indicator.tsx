/**
 * Buy-In Threshold Indicator Component
 *
 * Visual feedback showing projected daily total during buy-in entry.
 * Displays current total, new amount, and projected total with color-coded
 * threshold status per compliance requirements.
 *
 * Threshold Tiers:
 * - Default: < $2,500 (muted, no highlight)
 * - Warning: ≥ $2,500, < $3,000 (yellow - "Approaching")
 * - Watchlist: ≥ $3,000, ≤ $9,000 (amber - "Watchlist")
 * - CTR Near: > $9,000, ≤ $10,000 (orange - "CTR Near")
 * - CTR Met: > $10,000 (red - "CTR REQUIRED")
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS4
 * @see hooks/mtl/use-threshold-notifications.ts
 */

'use client';

import { AlertCircle, TrendingUp, ChevronRight } from 'lucide-react';

import {
  checkCumulativeThreshold,
  type ThresholdLevel,
} from '@/hooks/mtl/use-threshold-notifications';
import { formatDollars } from '@/lib/format';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface BuyInThresholdIndicatorProps {
  /** Current daily total before this transaction */
  currentDailyTotal: number;
  /** New buy-in amount being entered */
  newBuyInAmount: number;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Visual configuration for each threshold level
 */
const LEVEL_CONFIG: Record<
  ThresholdLevel,
  {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: 'alert' | 'trending' | null;
  }
> = {
  none: {
    label: '',
    bgClass: 'bg-muted/30',
    textClass: 'text-muted-foreground',
    borderClass: 'border-muted',
    icon: null,
  },
  warning: {
    label: 'Approaching',
    bgClass: 'bg-yellow-50 dark:bg-yellow-950/30',
    textClass: 'text-yellow-800 dark:text-yellow-200',
    borderClass: 'border-yellow-300 dark:border-yellow-700',
    icon: 'trending',
  },
  watchlist_met: {
    label: 'Watchlist',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    textClass: 'text-amber-800 dark:text-amber-200',
    borderClass: 'border-amber-300 dark:border-amber-700',
    icon: 'alert',
  },
  ctr_near: {
    label: 'CTR Near',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    textClass: 'text-orange-800 dark:text-orange-200',
    borderClass: 'border-orange-300 dark:border-orange-700',
    icon: 'alert',
  },
  ctr_met: {
    label: 'CTR REQUIRED',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-300 dark:border-red-700',
    icon: 'alert',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Component
// ============================================================================

/**
 * Buy-In Threshold Indicator
 *
 * Shows current daily total, new buy-in amount, and projected total
 * with color-coded visual feedback based on threshold level.
 *
 * Renders nothing when newBuyInAmount <= 0.
 *
 * @example
 * ```tsx
 * <BuyInThresholdIndicator
 *   currentDailyTotal={2800}
 *   newBuyInAmount={500}
 * />
 * // Shows: "$2,800 + $500 = $3,300" with amber "Watchlist" styling
 * ```
 */
export function BuyInThresholdIndicator({
  currentDailyTotal,
  newBuyInAmount,
  className,
}: BuyInThresholdIndicatorProps) {
  // Don't render if no new buy-in amount
  if (newBuyInAmount <= 0) {
    return null;
  }

  // Calculate projected total and threshold status
  const projectedTotal = currentDailyTotal + newBuyInAmount;
  const result = checkCumulativeThreshold(currentDailyTotal, newBuyInAmount);
  const config = LEVEL_CONFIG[result.level];

  // Always show indicator when there's a buy-in amount
  const showLabel = result.level !== 'none';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md border text-sm',
        config.bgClass,
        config.borderClass,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Daily total projection: ${formatDollars(projectedTotal)}`}
    >
      {/* Status Icon */}
      {config.icon === 'alert' && (
        <AlertCircle
          className={cn('h-4 w-4 flex-shrink-0', config.textClass)}
          aria-hidden="true"
        />
      )}
      {config.icon === 'trending' && (
        <TrendingUp
          className={cn('h-4 w-4 flex-shrink-0', config.textClass)}
          aria-hidden="true"
        />
      )}

      {/* Amount Breakdown */}
      <div
        className={cn('flex items-center gap-1 font-mono', config.textClass)}
      >
        <span className="text-muted-foreground">
          {formatDollars(currentDailyTotal)}
        </span>
        <span className="text-muted-foreground/60">+</span>
        <span className="font-medium">{formatDollars(newBuyInAmount)}</span>
        <ChevronRight
          className="h-3 w-3 text-muted-foreground/60"
          aria-hidden="true"
        />
        <span className={cn('font-semibold', showLabel && config.textClass)}>
          {formatDollars(projectedTotal)}
        </span>
      </div>

      {/* Threshold Label */}
      {showLabel && (
        <span
          className={cn(
            'ml-auto px-2 py-0.5 rounded-full text-xs font-semibold',
            config.textClass,
            result.level === 'ctr_met'
              ? 'bg-red-200 dark:bg-red-900/50'
              : result.level === 'ctr_near'
                ? 'bg-orange-200 dark:bg-orange-900/50'
                : result.level === 'watchlist_met'
                  ? 'bg-amber-200 dark:bg-amber-900/50'
                  : 'bg-yellow-200 dark:bg-yellow-900/50',
          )}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
