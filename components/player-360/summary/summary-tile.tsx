/**
 * Summary Tile Component
 *
 * Individual metric tile for the Snapshot Band.
 * Displays primary value, secondary detail, and optional trend indicator.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';

import type { SourceCategory } from '@/hooks/player-360';
import { cn } from '@/lib/utils';

// === Design Tokens ===

const categoryStyles: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  session: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  financial: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  gaming: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/20',
  },
  loyalty: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
};

// === Props ===

export interface SummaryTileProps {
  /** Tile title */
  title: string;
  /** Primary metric value */
  primaryValue: string;
  /** Secondary detail text */
  secondaryValue?: string;
  /** Micro detail (e.g., timestamp) */
  microDetail?: string;
  /** Trend percentage (-100 to +100) */
  trend?: number;
  /** Category for styling and filtering */
  category: SourceCategory;
  /** Whether this tile's filter is active */
  isActive?: boolean;
  /** Click handler for filter activation */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

// === Component ===

/**
 * Summary tile displaying a single metric with optional trend.
 *
 * @example
 * ```tsx
 * <SummaryTile
 *   title="Session Value"
 *   primaryValue="$1,250"
 *   secondaryValue="Theo: $890"
 *   microDetail="Updated 2m ago"
 *   trend={12.5}
 *   category="session"
 *   isActive={activeCategory === 'session'}
 *   onClick={() => setCategory('session')}
 * />
 * ```
 */
export function SummaryTile({
  title,
  primaryValue,
  secondaryValue,
  microDetail,
  trend,
  category,
  isActive = false,
  onClick,
  className,
}: SummaryTileProps) {
  const styles = categoryStyles[category] ?? categoryStyles.gaming;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start p-3 rounded-lg border transition-all',
        'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        styles.bg,
        styles.border,
        isActive && 'ring-2 ring-primary',
        className,
      )}
      data-testid={`summary-tile-${category}`}
      aria-pressed={isActive}
    >
      {/* Title */}
      <span className="text-xs font-medium text-muted-foreground mb-1">
        {title}
      </span>

      {/* Primary Value + Trend */}
      <div className="flex items-center gap-2">
        <span className={cn('text-xl font-semibold', styles.text)}>
          {primaryValue}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span
            className={cn(
              'flex items-center text-xs',
              trend > 0 ? 'text-emerald-400' : 'text-red-400',
            )}
            aria-label={`${trend > 0 ? 'Up' : 'Down'} ${Math.abs(trend)}%`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3 mr-0.5" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-0.5" />
            )}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Secondary Value */}
      {secondaryValue && (
        <span className="text-xs text-muted-foreground mt-1">
          {secondaryValue}
        </span>
      )}

      {/* Micro Detail */}
      {microDetail && (
        <span className="text-[10px] text-muted-foreground/60 mt-1">
          {microDetail}
        </span>
      )}

      {/* Active Indicator */}
      {isActive && (
        <span className="absolute top-1 right-1 text-xs text-muted-foreground">
          ×
        </span>
      )}
    </button>
  );
}
