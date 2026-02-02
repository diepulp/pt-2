/**
 * Recent Events Strip Component
 *
 * Displays the 3 most recent events (last buy-in, last reward, last note)
 * above the timeline filter bar for quick context.
 *
 * @see PRD-023 Player 360 Panels v0 - WS6
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import { DollarSign, Gift, FileText, Minus } from 'lucide-react';

import { formatDollars } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RecentEventsDTO } from '@/services/player360-dashboard/dtos';

// === Props ===

export interface RecentEventsStripProps {
  /** Recent events data */
  data: RecentEventsDTO;
  /** Handler for clicking an event item (scrolls timeline to event) */
  onEventClick?: (eventType: 'buyIn' | 'reward' | 'note') => void;
  /** Additional class names */
  className?: string;
}

// === Event Item Component ===

interface EventItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  detail: string | null;
  onClick?: () => void;
}

function EventItem({ icon, label, value, detail, onClick }: EventItemProps) {
  const isEmpty = value === null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isEmpty || !onClick}
      className={cn(
        'flex items-center gap-2 p-2 rounded-md transition-colors text-left w-full',
        isEmpty
          ? 'opacity-50 cursor-default'
          : 'hover:bg-accent/10 cursor-pointer',
      )}
      data-testid={`recent-event-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/30 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">
            <Minus className="w-3 h-3 inline" />
          </p>
        ) : (
          <>
            <p className="text-sm font-medium truncate">{value}</p>
            {detail && (
              <p className="text-[10px] text-muted-foreground truncate">
                {detail}
              </p>
            )}
          </>
        )}
      </div>
    </button>
  );
}

// === Formatters ===

function formatTimeAgo(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
  } catch {
    return '';
  }
}

// === Component ===

/**
 * Strip showing 3 most recent events for quick context.
 *
 * @example
 * ```tsx
 * function TimelineHeader({ playerId }: { playerId: string }) {
 *   const { data } = useRecentEvents(playerId);
 *   const { scrollToEvent } = useTimelineFilter();
 *
 *   if (!data) return <Skeleton />;
 *
 *   return (
 *     <RecentEventsStrip
 *       data={data}
 *       onEventClick={(type) => {
 *         // Scroll timeline to the event
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function RecentEventsStrip({
  data,
  onEventClick,
  className,
}: RecentEventsStripProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-2 px-3 py-2 border-b border-border/40 bg-background/50',
        className,
      )}
      data-testid="recent-events-strip"
    >
      {/* Last Buy-In */}
      <EventItem
        icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
        label="Last Buy-In"
        value={data.lastBuyIn ? formatDollars(data.lastBuyIn.amount) : null}
        detail={data.lastBuyIn ? formatTimeAgo(data.lastBuyIn.at) : null}
        onClick={data.lastBuyIn ? () => onEventClick?.('buyIn') : undefined}
      />

      {/* Last Reward */}
      <EventItem
        icon={<Gift className="w-4 h-4 text-amber-400" />}
        label="Last Reward"
        value={data.lastReward ? data.lastReward.type : null}
        detail={data.lastReward ? formatTimeAgo(data.lastReward.at) : null}
        onClick={data.lastReward ? () => onEventClick?.('reward') : undefined}
      />

      {/* Last Note */}
      <EventItem
        icon={<FileText className="w-4 h-4 text-blue-400" />}
        label="Last Note"
        value={data.lastNote ? data.lastNote.preview : null}
        detail={data.lastNote ? formatTimeAgo(data.lastNote.at) : null}
        onClick={data.lastNote ? () => onEventClick?.('note') : undefined}
      />
    </div>
  );
}
