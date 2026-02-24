'use client';

/**
 * Delta Badge (PRD-038)
 *
 * Displays "+$X since HH:MM" or "-$X since HH:MM" delta from checkpoint.
 * Hidden when no checkpoint exists.
 * NULL delta renders as em dash, not "$0".
 *
 * @see hooks/table-context/use-checkpoint-delta.ts
 * @see EXEC-038 WS5
 */

import { TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useCheckpointDelta } from '@/hooks/table-context/use-checkpoint-delta';
import { formatCentsDelta } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DeltaBadgeProps {
  className?: string;
}

export function DeltaBadge({ className }: DeltaBadgeProps) {
  const { data: delta } = useCheckpointDelta();

  if (!delta) return null;

  const winDelta = delta.delta.win_loss_cents;
  const checkpointTime = new Date(delta.checkpoint_time).toLocaleTimeString(
    'en-US',
    { hour: '2-digit', minute: '2-digit' },
  );

  const isPositive = winDelta != null && winDelta > 0;
  const isNegative = winDelta != null && winDelta < 0;
  const Icon = isNegative ? TrendingDown : TrendingUp;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-mono text-xs',
        isPositive && 'border-green-500/30 text-green-600 dark:text-green-400',
        isNegative && 'border-red-500/30 text-red-600 dark:text-red-400',
        !isPositive && !isNegative && 'text-muted-foreground',
        className,
      )}
    >
      {winDelta != null && <Icon className="h-3 w-3" />}
      {formatCentsDelta(winDelta)} since {checkpointTime}
    </Badge>
  );
}
