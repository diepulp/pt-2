/**
 * Freshness Badge
 *
 * Visual indicator for metric data freshness.
 * - "request-time" → Live badge
 * - "periodic" → "As of {date}" badge
 *
 * @see EXEC-046 WS5 — Widget Components
 */

import { Badge } from '@/components/ui/badge';

export interface FreshnessBadgeProps {
  freshness: 'request-time' | 'periodic';
  snapshotDate?: string;
}

export function FreshnessBadge({
  freshness,
  snapshotDate,
}: FreshnessBadgeProps) {
  if (freshness === 'request-time') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-[10px] font-medium"
      >
        Live
      </Badge>
    );
  }

  const formatted = snapshotDate
    ? new Date(snapshotDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown';

  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px] font-medium"
    >
      As of {formatted}
    </Badge>
  );
}
