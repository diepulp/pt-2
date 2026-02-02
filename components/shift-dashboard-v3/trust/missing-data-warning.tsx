'use client';

import { AlertTriangleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface MissingDataWarningProps {
  /** Reason the data is missing — shown as tooltip text */
  reason?: string;
  /** Display variant */
  variant?: 'inline' | 'block';
  className?: string;
}

/**
 * Missing data warning — displays em-dash with optional warning indicator.
 *
 * Used when a metric value is NULL (cannot compute).
 * NULL means "cannot compute" — never silently show 0 or blank.
 *
 * @see TRUST_LAYER_RULES.md §5
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md §5
 */
export function MissingDataWarning({
  reason,
  variant = 'inline',
  className,
}: MissingDataWarningProps) {
  if (variant === 'block') {
    return (
      <div
        data-testid="missing-data-warning"
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1',
          'bg-amber-50/50 dark:bg-amber-950/20',
          'border border-dashed border-amber-500/30',
          className,
        )}
      >
        <AlertTriangleIcon className="h-3 w-3 shrink-0 text-amber-500" />
        <span className="text-[10px] text-amber-700 dark:text-amber-400">
          {reason ?? 'Data unavailable'}
        </span>
      </div>
    );
  }

  return (
    <span
      data-testid="missing-data-warning"
      className={cn(
        'inline-flex items-center gap-0.5 text-muted-foreground',
        className,
      )}
      title={reason ?? 'Data unavailable'}
    >
      <span className="font-mono">&mdash;</span>
      <AlertTriangleIcon className="h-2.5 w-2.5 text-amber-500" />
    </span>
  );
}
