/**
 * Summary Band Component
 *
 * Horizontal band of 4 metric tiles for the Snapshot Panel.
 * Displays session value, cash velocity, engagement, and rewards eligibility.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import { memo } from 'react';

import type { PlayerSummaryDTO, SourceCategory } from '@/hooks/player-360';
import { cn } from '@/lib/utils';

import { SummaryTile } from './summary-tile';

// === Props ===

export interface SummaryBandProps {
  /** Player summary data */
  data: PlayerSummaryDTO;
  /** Currently active filter category */
  activeCategory: SourceCategory | null;
  /** Filter category change handler */
  onCategoryChange: (category: SourceCategory | null) => void;
  /** Additional class names */
  className?: string;
}

// === Formatters ===

function formatDollars(value: number): string {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? '-' : '';
  if (absValue >= 1000) {
    return `${prefix}$${(absValue / 1000).toFixed(1)}k`;
  }
  return `${prefix}$${absValue.toFixed(0)}`;
}

function formatRate(value: number): string {
  return `$${value.toFixed(0)}/hr`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTimeAgo(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
  } catch {
    return '';
  }
}

function getEngagementLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'cooling':
      return 'Cooling';
    case 'dormant':
      return 'Dormant';
    default:
      return status;
  }
}

function getEligibilityLabel(status: string): string {
  switch (status) {
    case 'available':
      return 'Eligible';
    case 'not_available':
      return 'Not Eligible';
    case 'unknown':
      return 'Unknown';
    default:
      return status;
  }
}

// === Component ===

/**
 * Summary band displaying 4 action tiles in a responsive grid.
 *
 * @example
 * ```tsx
 * function SnapshotPanel({ playerId }: { playerId: string }) {
 *   const { data } = usePlayerSummary(playerId);
 *   const { activeCategory, setCategory } = useTimelineFilter();
 *
 *   if (!data) return <Skeleton />;
 *
 *   return (
 *     <SummaryBand
 *       data={data}
 *       activeCategory={activeCategory}
 *       onCategoryChange={setCategory}
 *     />
 *   );
 * }
 * ```
 */
export const SummaryBand = memo(function SummaryBand({
  data,
  activeCategory,
  onCategoryChange,
  className,
}: SummaryBandProps) {
  const handleTileClick = (category: SourceCategory) => {
    if (activeCategory === category) {
      onCategoryChange(null); // Toggle off
    } else {
      onCategoryChange(category);
    }
  };

  return (
    <div
      className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}
      data-testid="summary-band"
    >
      {/* Session Value Tile */}
      <SummaryTile
        title="Session Value"
        primaryValue={formatDollars(data.sessionValue.netWinLoss)}
        secondaryValue={`Theo: ${formatDollars(data.sessionValue.theoEstimate)}`}
        microDetail={
          data.sessionValue.lastActionAt
            ? formatTimeAgo(data.sessionValue.lastActionAt)
            : undefined
        }
        trend={data.sessionValue.trendPercent}
        category="session"
        isActive={activeCategory === 'session'}
        onClick={() => handleTileClick('session')}
      />

      {/* Cash Velocity Tile */}
      <SummaryTile
        title="Cash Velocity"
        primaryValue={formatRate(data.cashVelocity.ratePerHour)}
        secondaryValue={`Total: ${formatDollars(data.cashVelocity.sessionTotal)}`}
        microDetail={
          data.cashVelocity.lastBuyInAt
            ? `Last buy-in ${formatTimeAgo(data.cashVelocity.lastBuyInAt)}`
            : undefined
        }
        category="financial"
        isActive={activeCategory === 'financial'}
        onClick={() => handleTileClick('financial')}
      />

      {/* Engagement Tile */}
      <SummaryTile
        title="Engagement"
        primaryValue={getEngagementLabel(data.engagement.status)}
        secondaryValue={formatDuration(data.engagement.durationMinutes)}
        microDetail={
          data.engagement.lastSeenAt
            ? `Last seen ${formatTimeAgo(data.engagement.lastSeenAt)}`
            : undefined
        }
        category="gaming"
        isActive={activeCategory === 'gaming'}
        onClick={() => handleTileClick('gaming')}
      />

      {/* Rewards Eligibility Tile */}
      <SummaryTile
        title="Rewards"
        primaryValue={getEligibilityLabel(data.rewardsEligibility.status)}
        secondaryValue={data.rewardsEligibility.guidance ?? undefined}
        microDetail={
          data.rewardsEligibility.nextEligibleAt
            ? `Next: ${formatTimeAgo(data.rewardsEligibility.nextEligibleAt)}`
            : undefined
        }
        category="loyalty"
        isActive={activeCategory === 'loyalty'}
        onClick={() => handleTileClick('loyalty')}
      />
    </div>
  );
});
