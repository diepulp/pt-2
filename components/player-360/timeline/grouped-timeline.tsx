/**
 * Grouped Timeline Component
 *
 * Orchestrates the grouped timeline view with:
 * - Sticky category indicator bar
 * - Time-block grouped events
 * - Infinite scroll support
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CategoryIndicatorBar } from "./category-indicator-bar";
import { groupEventsIntoBlocks, TimeBlockGroup } from "./time-block-group";
import type { SourceCategory, TimelineCardCollapsed } from "./types";

// === Types ===

interface GroupedTimelineProps {
  /** All loaded timeline events */
  cards: TimelineCardCollapsed[];
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** Error message if any */
  errorMessage?: string;
  /** Whether more data is available */
  hasNextPage: boolean;
  /** Whether currently fetching next page */
  isFetchingNextPage: boolean;
  /** Callback to fetch next page */
  onFetchNextPage: () => void;
  /** Callback for retry on error */
  onRetry: () => void;
  /** Active category filter from parent */
  activeCategory: SourceCategory | null;
  /** Callback when category filter changes */
  onCategoryChange: (category: SourceCategory | null) => void;
  /** Callback when an event card is clicked */
  onEventClick?: (event: TimelineCardCollapsed) => void;
  /** Time interval for grouping in minutes */
  groupIntervalMinutes?: number;
  /** Additional class names */
  className?: string;
}

// === Empty State ===

function TimelineEmptyState({ type }: { type: "no-events" | "no-matches" }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {type === "no-events" ? "No activity yet" : "No matching events"}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        {type === "no-events"
          ? "This player doesn't have any recorded events in the selected time range."
          : "Try adjusting your category filter to see more events."}
      </p>
    </div>
  );
}

// === Error State ===

function TimelineErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        Failed to load timeline
      </h3>
      <p className="text-xs text-muted-foreground max-w-[240px] mb-4">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

// === Loading Skeleton ===

function TimelineLoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Fake category bar */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 bg-muted/30 rounded-full animate-pulse"
          />
        ))}
      </div>

      {/* Fake time blocks */}
      {Array.from({ length: 3 }).map((_, blockIndex) => (
        <div key={blockIndex} className="space-y-2">
          <div className="h-10 bg-muted/30 rounded animate-pulse" />
          {Array.from({ length: 2 + blockIndex }).map((_, eventIndex) => (
            <div
              key={eventIndex}
              className="h-16 bg-muted/20 rounded ml-4 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// === Main Component ===

/**
 * Grouped timeline with sticky category indicators and time-block grouping.
 */
export function GroupedTimeline({
  cards,
  isLoading,
  isError,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onRetry,
  activeCategory,
  onCategoryChange,
  onEventClick,
  groupIntervalMinutes = 30,
  className,
}: GroupedTimelineProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Group events into time blocks
  const timeBlocks = React.useMemo(
    () => groupEventsIntoBlocks(cards, groupIntervalMinutes),
    [cards, groupIntervalMinutes],
  );

  // Handle infinite scroll
  const handleScroll = React.useCallback(() => {
    if (!scrollContainerRef.current || isFetchingNextPage || !hasNextPage) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const scrollThreshold = 200;

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      onFetchNextPage();
    }
  }, [onFetchNextPage, hasNextPage, isFetchingNextPage]);

  // Scroll to first occurrence of a category
  const handleScrollToCategory = React.useCallback(
    (category: SourceCategory) => {
      // Find first event with this category
      const firstEvent = cards.find((c) => c.sourceCategory === category);
      if (firstEvent) {
        // Find the block containing this event
        const block = timeBlocks.find((b) =>
          b.events.some((e) => e.eventId === firstEvent.eventId),
        );
        if (block) {
          // Scroll to block (could be enhanced with individual event refs)
          const blockElement = document.getElementById(`block-${block.id}`);
          blockElement?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [cards, timeBlocks],
  );

  // Filter blocks based on active category
  const filteredBlocks = React.useMemo(() => {
    if (!activeCategory) return timeBlocks;
    return timeBlocks
      .map((block) => ({
        ...block,
        events: block.events.filter((e) => e.sourceCategory === activeCategory),
      }))
      .filter((block) => block.events.length > 0);
  }, [timeBlocks, activeCategory]);

  // Check if filter results in empty state
  const hasNoMatches =
    activeCategory && filteredBlocks.length === 0 && cards.length > 0;

  // Loading state
  if (isLoading) {
    return <TimelineLoadingSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <TimelineErrorState
        message={errorMessage ?? "An unexpected error occurred"}
        onRetry={onRetry}
      />
    );
  }

  // Empty state
  if (cards.length === 0) {
    return <TimelineEmptyState type="no-events" />;
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Sticky Category Indicator Bar */}
      <CategoryIndicatorBar
        cards={cards}
        activeCategory={activeCategory}
        onCategoryClick={onCategoryChange}
        onScrollToCategory={handleScrollToCategory}
      />

      {/* Timeline Content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {hasNoMatches ? (
          <TimelineEmptyState type="no-matches" />
        ) : (
          <>
            {/* Time Blocks */}
            {filteredBlocks.map((block, index) => (
              <div key={block.id} id={`block-${block.id}`}>
                <TimeBlockGroup
                  block={block}
                  defaultExpanded={index < 5} // Collapse older blocks
                  activeCategory={activeCategory}
                  onEventClick={onEventClick}
                />
              </div>
            ))}

            {/* Load More / Fetching Indicator */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading more events...
                </span>
              </div>
            )}

            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Button variant="outline" size="sm" onClick={onFetchNextPage}>
                  Load More
                </Button>
              </div>
            )}

            {!hasNextPage && cards.length > 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground border-t border-border/40">
                <span className="inline-flex items-center gap-2">
                  <span className="w-8 h-px bg-border/60" />
                  End of timeline
                  <span className="w-8 h-px bg-border/60" />
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
