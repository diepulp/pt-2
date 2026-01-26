/**
 * Rewards History List Component
 *
 * List of recent rewards with type filter chips.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { RewardHistoryItemDTO } from "@/services/player360-dashboard/dtos";

import { RewardsHistoryItem } from "./rewards-history-item";

// === Types ===

type FilterType = "all" | "matchplay" | "freeplay";

// === Props ===

export interface RewardsHistoryListProps {
  /** Reward history items */
  items: RewardHistoryItemDTO[];
  /** Click handler for item (to scroll to timeline) */
  onItemClick?: (item: RewardHistoryItemDTO) => void;
  /** Max items to show (default: 3) */
  maxItems?: number;
  /** Additional class names */
  className?: string;
}

// === Filter Chips ===

const filterOptions: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "matchplay", label: "Match Play" },
  { value: "freeplay", label: "Free Play" },
];

// === Component ===

/**
 * List of recent rewards with filtering.
 *
 * @example
 * ```tsx
 * function RewardsPanel({ playerId }: { playerId: string }) {
 *   const { data } = useRewardHistory(playerId);
 *   const { scrollToEvent } = useTimelineFilter();
 *
 *   return (
 *     <RewardsHistoryList
 *       items={data ?? []}
 *       onItemClick={(item) => scrollToEvent(item.id)}
 *     />
 *   );
 * }
 * ```
 */
export function RewardsHistoryList({
  items,
  onItemClick,
  maxItems = 3,
  className,
}: RewardsHistoryListProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  // Filter items
  const filteredItems = items.filter((item) => {
    if (filter === "all") return true;
    return item.rewardType === filter;
  });

  // Limit display
  const displayItems = filteredItems.slice(0, maxItems);

  return (
    <div className={cn("", className)} data-testid="rewards-history-list">
      {/* Filter Chips */}
      <div className="flex items-center gap-1 mb-2">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "px-2 py-0.5 text-[10px] rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
            data-testid={`rewards-filter-${option.value}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {displayItems.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {displayItems.map((item) => (
            <RewardsHistoryItem
              key={item.id}
              item={item}
              onClick={() => onItemClick?.(item)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No rewards found
        </p>
      )}

      {/* Show more indicator */}
      {filteredItems.length > maxItems && (
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
          +{filteredItems.length - maxItems} more
        </p>
      )}
    </div>
  );
}
