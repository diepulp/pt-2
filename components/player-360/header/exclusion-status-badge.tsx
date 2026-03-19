/**
 * Exclusion Status Badge
 *
 * Severity-colored badge for player exclusion status.
 * Hidden when status is 'clear' (no visual clutter).
 *
 * @see PRD-052 GAP-1
 * @see EXEC-052 WS4
 */

'use client';

import { AlertTriangle, Ban, Eye } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ExclusionStatus = 'blocked' | 'alert' | 'watchlist' | 'clear';

interface ExclusionStatusBadgeProps {
  status: ExclusionStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  Exclude<ExclusionStatus, 'clear'>,
  { label: string; icon: typeof Ban; colors: string }
> = {
  blocked: {
    label: 'Blocked',
    icon: Ban,
    colors: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  alert: {
    label: 'Alert',
    icon: AlertTriangle,
    colors: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  watchlist: {
    label: 'Watchlist',
    icon: Eye,
    colors: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
};

export function ExclusionStatusBadge({
  status,
  className,
}: ExclusionStatusBadgeProps) {
  if (status === 'clear') return null;

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] h-5 px-1.5 gap-1 shrink-0',
        config.colors,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
