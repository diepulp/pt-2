'use client';

import { cn } from '@/lib/utils';

export type TelemetryQualityLevel = 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';

export interface TelemetryQualityIndicatorProps {
  quality: TelemetryQualityLevel;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const QUALITY_CONFIG: Record<
  TelemetryQualityLevel,
  { color: string; label: string; filled: 'full' | 'half' | 'empty' }
> = {
  GOOD_COVERAGE: {
    color: 'bg-emerald-500',
    label: 'Good',
    filled: 'full',
  },
  LOW_COVERAGE: {
    color: 'bg-amber-500',
    label: 'Low',
    filled: 'half',
  },
  NONE: {
    color: 'bg-zinc-400',
    label: 'None',
    filled: 'empty',
  },
};

/**
 * Telemetry quality indicator — colored dot showing data quality level.
 *
 * - Filled green: GOOD_COVERAGE
 * - Half amber: LOW_COVERAGE
 * - Empty gray: NONE
 *
 * @see TRUST_LAYER_RULES.md §3
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md §3
 */
export function TelemetryQualityIndicator({
  quality,
  showLabel = false,
  size = 'sm',
  className,
}: TelemetryQualityIndicatorProps) {
  const config = QUALITY_CONFIG[quality];
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  return (
    <span
      data-testid="telemetry-quality-indicator"
      className={cn('inline-flex items-center gap-1', className)}
      {...(!showLabel && {
        'aria-label': `Telemetry quality: ${config.label}`,
      })}
    >
      <span
        className="relative flex items-center justify-center"
        aria-hidden="true"
      >
        {/* Base circle (always visible) */}
        <span
          className={cn(
            'rounded-full border',
            dotSize,
            config.filled === 'full' && cn(config.color, 'border-transparent'),
            config.filled === 'half' && 'border-amber-500 bg-amber-500/40',
            config.filled === 'empty' && 'border-zinc-400 bg-transparent',
          )}
        />
      </span>
      {showLabel && (
        <span className={cn(textSize, 'text-muted-foreground')}>
          {config.label}
        </span>
      )}
    </span>
  );
}
