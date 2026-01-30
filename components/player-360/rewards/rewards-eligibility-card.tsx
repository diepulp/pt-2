/**
 * Rewards Eligibility Card Component
 *
 * Compact card showing rewards eligibility status with countdown.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import { Gift, HelpCircle, Clock, CheckCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { RewardsEligibilityDTO } from '@/hooks/player-360';
import { cn } from '@/lib/utils';

// === Props ===

export interface RewardsEligibilityCardProps {
  /** Eligibility data */
  data: RewardsEligibilityDTO;
  /** Handler for "Show related events" action */
  onShowRelatedEvents?: () => void;
  /** Additional class names */
  className?: string;
}

// === Status Config ===

const statusConfig = {
  available: {
    icon: CheckCircle,
    label: 'Eligible',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  not_available: {
    icon: XCircle,
    label: 'Not Eligible',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  unknown: {
    icon: HelpCircle,
    label: 'Unknown',
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
  },
};

// === Component ===

/**
 * Card displaying rewards eligibility status.
 *
 * @example
 * ```tsx
 * function LeftRail({ playerId }: { playerId: string }) {
 *   const { data } = usePlayerEligibility(playerId);
 *   const { setCategory, scrollToEvent } = useTimelineFilter();
 *
 *   const handleShowRelated = () => {
 *     setCategory('loyalty');
 *     // Optionally scroll to timeline
 *   };
 *
 *   return (
 *     <RewardsEligibilityCard
 *       data={data}
 *       onShowRelatedEvents={handleShowRelated}
 *     />
 *   );
 * }
 * ```
 */
export function RewardsEligibilityCard({
  data,
  onShowRelatedEvents,
  className,
}: RewardsEligibilityCardProps) {
  const config = statusConfig[data.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 p-3',
        config.bg,
        className,
      )}
      data-testid="rewards-eligibility-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Gift className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium">Rewards Eligibility</span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-2">
        <StatusIcon className={cn('h-4 w-4', config.color)} />
        <span className={cn('text-sm font-semibold', config.color)}>
          {config.label}
        </span>
      </div>

      {/* Guidance */}
      {data.guidance && (
        <p className="text-xs text-muted-foreground mb-2">{data.guidance}</p>
      )}

      {/* Countdown */}
      {data.nextEligibleAt && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Clock className="h-3 w-3" />
          <span>
            Next eligible{' '}
            {formatDistanceToNow(new Date(data.nextEligibleAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      )}

      {/* Reason Codes (for debugging/detail) */}
      {data.reasonCodes.length > 0 && data.reasonCodes[0] !== 'AVAILABLE' && (
        <div className="text-[10px] text-muted-foreground/60 mb-2">
          {data.reasonCodes.join(', ')}
        </div>
      )}

      {/* Action */}
      {onShowRelatedEvents && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowRelatedEvents}
          className="w-full text-xs h-7"
          data-testid="show-related-events"
        >
          Show related events
        </Button>
      )}
    </div>
  );
}
