'use client';

import { cn } from '@/lib/utils';
import type { OpeningSource } from '@/services/table-context/shift-metrics/provenance';

export interface OpeningSourceBadgeProps {
  source: OpeningSource | null;
  className?: string;
}

/**
 * Opening source provenance badge — indicates the baseline source used for win/loss.
 *
 * - 'snapshot:prior_count' → no badge (normal case)
 * - 'bootstrap:par_target' → amber "Est. from par"
 * - 'fallback:earliest_in_window' → amber "Partial window"
 * - 'none' → red "No baseline"
 *
 * @see PRD-036 §WS3
 */
export function OpeningSourceBadge({
  source,
  className,
}: OpeningSourceBadgeProps) {
  if (!source || source === 'snapshot:prior_count') return null;

  const config = BADGE_CONFIG[source];
  if (!config) return null;

  return (
    <span
      data-testid="opening-source-badge"
      className={cn(
        'inline-flex items-center rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

const BADGE_CONFIG: Record<
  Exclude<OpeningSource, 'snapshot:prior_count'>,
  { label: string; classes: string }
> = {
  'bootstrap:par_target': {
    label: 'Est. from par',
    classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  'fallback:earliest_in_window': {
    label: 'Partial window',
    classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  none: {
    label: 'No baseline',
    classes: 'bg-red-500/10 text-red-700 dark:text-red-400',
  },
};
