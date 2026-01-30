/**
 * Time Block Group Component
 *
 * Groups timeline events by time period with collapsible sections.
 * Each block shows a time range header and contains events from that period.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import {
  EVENT_TYPE_LABELS,
  getSourceCategoryStyle,
  SOURCE_CATEGORY_STYLES,
  type SourceCategory,
  type TimelineCardCollapsed,
} from './types';

// === Types ===

export interface TimeBlock {
  /** Unique identifier for the block */
  id: string;
  /** Start time of the block (ISO string) */
  startTime: string;
  /** End time of the block (ISO string) */
  endTime: string;
  /** Events within this time block */
  events: TimelineCardCollapsed[];
  /** Categories present in this block */
  categories: SourceCategory[];
}

interface TimeBlockGroupProps {
  /** The time block data */
  block: TimeBlock;
  /** Whether this block is initially expanded */
  defaultExpanded?: boolean;
  /** Active category filter */
  activeCategory: SourceCategory | null;
  /** Callback when an event is clicked */
  onEventClick?: (event: TimelineCardCollapsed) => void;
  /** Additional class names */
  className?: string;
}

interface TimelineEventCardProps {
  card: TimelineCardCollapsed;
  isHighlighted?: boolean;
  onClick?: () => void;
}

// === Icon Mapping ===

const ICON_MAP: Record<string, LucideIcon> = {
  'log-in': LucideIcons.LogIn,
  'log-out': LucideIcons.LogOut,
  'refresh-cw': LucideIcons.RefreshCw,
  play: LucideIcons.Play,
  pause: LucideIcons.Pause,
  square: LucideIcons.Square,
  'arrow-down-circle': LucideIcons.ArrowDownCircle,
  'arrow-up-circle': LucideIcons.ArrowUpCircle,
  eye: LucideIcons.Eye,
  edit: LucideIcons.Edit,
  'plus-circle': LucideIcons.PlusCircle,
  gift: LucideIcons.Gift,
  settings: LucideIcons.Settings,
  ticket: LucideIcons.Ticket,
  'file-text': LucideIcons.FileText,
  tag: LucideIcons.Tag,
  'tag-x': LucideIcons.Tags,
  shield: LucideIcons.Shield,
  'user-plus': LucideIcons.UserPlus,
  'badge-check': LucideIcons.BadgeCheck,
};

function getIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? LucideIcons.Circle;
}

// === Utility Functions ===

/**
 * Format time for display (e.g., "2:45 PM")
 */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format time range for block header (e.g., "2:45 PM - 3:00 PM")
 */
function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

/**
 * Format date for display (e.g., "Jan 15")
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// === Timeline Event Card ===

function TimelineEventCard({
  card,
  isHighlighted = false,
  onClick,
}: TimelineEventCardProps) {
  const style = getSourceCategoryStyle(card.sourceCategory);
  const IconComponent = getIconComponent(card.icon);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left',
        'border-l-2 ml-4',
        'hover:bg-accent/5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        isHighlighted && 'bg-accent/10',
        style.border,
      )}
    >
      {/* Category indicator dot */}
      <div
        className={cn(
          'absolute -left-[5px] w-2 h-2 rounded-full mt-2',
          style.bg,
          style.border,
          'border',
        )}
      />

      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
          style.bg,
          style.border,
          'border',
        )}
      >
        <IconComponent className={cn('w-4 h-4', style.text)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Category badge */}
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
              style.bg,
              style.text,
            )}
          >
            {SOURCE_CATEGORY_STYLES[card.sourceCategory].label}
          </span>

          {/* Event type */}
          <span className="text-xs text-muted-foreground">
            {EVENT_TYPE_LABELS[card.eventType]}
          </span>

          {/* Time */}
          <span className="text-xs text-muted-foreground ml-auto">
            {formatTime(card.occurredAt)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm text-foreground">{card.summary}</p>

        {/* Amount if present */}
        {card.amount !== null && card.amount !== undefined && (
          <span
            className={cn(
              'text-xs font-semibold',
              card.amount >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {card.amount >= 0 ? '+' : ''}$
            {Math.abs(card.amount).toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}

// === Time Block Group Component ===

/**
 * Collapsible time block containing grouped events.
 */
export function TimeBlockGroup({
  block,
  defaultExpanded = true,
  activeCategory,
  onEventClick,
  className,
}: TimeBlockGroupProps) {
  const [isOpen, setIsOpen] = React.useState(defaultExpanded);

  // Filter events if category is active
  const filteredEvents = React.useMemo(() => {
    if (!activeCategory) return block.events;
    return block.events.filter((e) => e.sourceCategory === activeCategory);
  }, [block.events, activeCategory]);

  // Category summary for header (must be called before early return to follow rules of hooks)
  const categorySummary = React.useMemo(() => {
    const counts = new Map<SourceCategory, number>();
    for (const event of filteredEvents) {
      counts.set(
        event.sourceCategory,
        (counts.get(event.sourceCategory) ?? 0) + 1,
      );
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [filteredEvents]);

  // Don't render empty blocks when filtered
  if (filteredEvents.length === 0) {
    return null;
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('relative', className)}
    >
      {/* Block Header */}
      <CollapsibleTrigger
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2',
          'bg-muted/30 hover:bg-muted/50 transition-colors',
          'border-y border-border/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        {/* Expand/Collapse indicator */}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />

        {/* Time range */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {formatTimeRange(block.startTime, block.endTime)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(block.startTime)}
          </span>
        </div>

        {/* Category summary dots */}
        <div className="flex items-center gap-1 ml-auto">
          {categorySummary.map(([category, count]) => {
            const style = SOURCE_CATEGORY_STYLES[category];
            return (
              <div
                key={category}
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]',
                  style.bg,
                  style.text,
                )}
                title={`${SOURCE_CATEGORY_STYLES[category].label}: ${count}`}
              >
                <span
                  className={cn('w-1.5 h-1.5 rounded-full', style.text)}
                  style={{ backgroundColor: 'currentColor' }}
                />
                <span className="font-medium">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Total event count */}
        <span className="text-xs text-muted-foreground">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
        </span>
      </CollapsibleTrigger>

      {/* Events */}
      <CollapsibleContent>
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[1.125rem] top-0 bottom-0 w-px bg-border/60" />

          {/* Event cards */}
          {filteredEvents.map((event) => (
            <TimelineEventCard
              key={event.eventId}
              card={event}
              isHighlighted={activeCategory === event.sourceCategory}
              onClick={() => onEventClick?.(event)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// === Grouping Utility ===

/**
 * Group timeline events into time blocks.
 *
 * @param events - Array of timeline events
 * @param intervalMinutes - Time interval for grouping (default: 30 minutes)
 * @returns Array of TimeBlock objects
 */
export function groupEventsIntoBlocks(
  events: TimelineCardCollapsed[],
  intervalMinutes: number = 30,
): TimeBlock[] {
  if (events.length === 0) return [];

  // Sort events by time (most recent first for typical timeline display)
  const sortedEvents = [...events].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const blocks: TimeBlock[] = [];
  let currentBlock: TimeBlock | null = null;

  for (const event of sortedEvents) {
    const eventTime = new Date(event.occurredAt);

    // Calculate block boundaries
    const blockStartMinutes =
      Math.floor(eventTime.getMinutes() / intervalMinutes) * intervalMinutes;
    const blockStart = new Date(eventTime);
    blockStart.setMinutes(blockStartMinutes, 0, 0);

    const blockEnd = new Date(blockStart);
    blockEnd.setMinutes(blockEnd.getMinutes() + intervalMinutes);

    const blockId = blockStart.toISOString();

    // Check if we need a new block
    if (!currentBlock || currentBlock.id !== blockId) {
      currentBlock = {
        id: blockId,
        startTime: blockStart.toISOString(),
        endTime: blockEnd.toISOString(),
        events: [],
        categories: [],
      };
      blocks.push(currentBlock);
    }

    // Add event to current block
    currentBlock.events.push(event);

    // Track categories
    if (!currentBlock.categories.includes(event.sourceCategory)) {
      currentBlock.categories.push(event.sourceCategory);
    }
  }

  return blocks;
}
