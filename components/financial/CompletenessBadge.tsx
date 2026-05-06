import { cn } from '@/lib/utils';
import type { CompletenessStatus } from '@/types/financial';

export interface CompletenessBadgeProps {
  status: CompletenessStatus;
  /** 0.0–1.0; must NOT be labeled "Attribution Ratio" */
  coverage?: number;
  className?: string;
}

const STATUS_CONFIG: Record<
  CompletenessStatus,
  { label: string; colorClass: string }
> = {
  complete: {
    label: 'Complete',
    colorClass:
      'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
  },
  partial: {
    label: 'Partial',
    colorClass:
      'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  },
  unknown: {
    label: 'Not computed',
    colorClass: 'bg-muted/50 text-muted-foreground border-border/50',
  },
};

export function CompletenessBadge({
  status,
  coverage,
  className,
}: CompletenessBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        config.colorClass,
        className,
      )}
      style={{ fontFamily: 'monospace' }}
      data-testid="completeness-badge"
      data-status={status}
    >
      {config.label}
      {coverage !== undefined && status !== 'unknown' && (
        <span className="font-normal normal-case tracking-normal">
          {Math.round(coverage * 100)}%
        </span>
      )}
    </span>
  );
}
