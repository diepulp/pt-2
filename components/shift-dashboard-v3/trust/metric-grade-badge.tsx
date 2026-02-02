'use client';

import { CheckCircle2Icon, CircleDashedIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface MetricGradeBadgeProps {
  grade: 'ESTIMATE' | 'AUTHORITATIVE';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Metric grade badge — shows ESTIMATE vs AUTHORITATIVE confidence level.
 *
 * - AUTHORITATIVE (green): Full snapshot coverage, inventory-based
 * - ESTIMATE (amber): Partial data, telemetry-based
 *
 * @see TRUST_LAYER_RULES.md §2
 * @see SHIFT_METRICS_UX_CONTRACT_v1.md §2
 */
export function MetricGradeBadge({
  grade,
  size = 'sm',
  className,
}: MetricGradeBadgeProps) {
  const isAuthoritative = grade === 'AUTHORITATIVE';
  const Icon = isAuthoritative ? CheckCircle2Icon : CircleDashedIcon;

  const sizeClasses = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const textClasses = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  return (
    <span
      data-testid="metric-grade-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1 py-0.5',
        isAuthoritative
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Icon className={sizeClasses} />
      <span className={cn(textClasses, 'font-medium uppercase tracking-wider')}>
        {isAuthoritative ? 'Auth' : 'Est'}
      </span>
    </span>
  );
}
