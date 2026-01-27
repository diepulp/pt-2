/**
 * Category Indicator Bar Component
 *
 * Sticky header showing which event categories are present in the timeline.
 * Filled dots indicate categories with events; clicking filters to that category.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import {
  Banknote,
  ClipboardCheck,
  Gamepad2,
  Gift,
  MessageSquare,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import {
  SOURCE_CATEGORY_STYLES,
  type SourceCategory,
  type TimelineCardCollapsed,
} from "./types";

// === Types ===

interface CategoryIndicatorBarProps {
  /** All cards currently loaded in the timeline */
  cards: TimelineCardCollapsed[];
  /** Currently active category filter (if any) */
  activeCategory: SourceCategory | null;
  /** Callback when category is clicked */
  onCategoryClick: (category: SourceCategory | null) => void;
  /** Callback to scroll to next occurrence of category */
  onScrollToCategory?: (category: SourceCategory) => void;
  /** Additional class names */
  className?: string;
}

interface CategoryIndicator {
  category: SourceCategory;
  label: string;
  icon: LucideIcon;
  count: number;
  hasEvents: boolean;
}

// === Category Configuration ===

const CATEGORY_CONFIG: Array<{
  category: SourceCategory;
  label: string;
  icon: LucideIcon;
}> = [
  { category: "session", label: "Session", icon: UserCheck },
  { category: "gaming", label: "Gaming", icon: Gamepad2 },
  { category: "financial", label: "Financial", icon: Banknote },
  { category: "loyalty", label: "Loyalty", icon: Gift },
  { category: "compliance", label: "Compliance", icon: ClipboardCheck },
  { category: "staff", label: "Notes", icon: MessageSquare },
];

// === Component ===

/**
 * Sticky category indicator bar for timeline navigation.
 *
 * Shows filled indicators for categories with events, allowing
 * quick filtering and navigation.
 */
export function CategoryIndicatorBar({
  cards,
  activeCategory,
  onCategoryClick,
  onScrollToCategory,
  className,
}: CategoryIndicatorBarProps) {
  // Calculate category counts
  const categoryData = React.useMemo(() => {
    const counts = new Map<SourceCategory, number>();

    for (const card of cards) {
      const count = counts.get(card.sourceCategory) ?? 0;
      counts.set(card.sourceCategory, count + 1);
    }

    return CATEGORY_CONFIG.map(({ category, label, icon }) => ({
      category,
      label,
      icon,
      count: counts.get(category) ?? 0,
      hasEvents: (counts.get(category) ?? 0) > 0,
    }));
  }, [cards]);

  const handleClick = (indicator: CategoryIndicator) => {
    if (activeCategory === indicator.category) {
      // Toggle off if already active
      onCategoryClick(null);
    } else if (indicator.hasEvents) {
      // Filter to this category
      onCategoryClick(indicator.category);
      // Optionally scroll to first occurrence
      onScrollToCategory?.(indicator.category);
    }
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-20",
        "flex items-center gap-1.5 px-4 py-2",
        "bg-background/95 backdrop-blur-sm",
        "border-b border-border/40",
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground mr-2">
        Categories:
      </span>

      <div className="flex items-center gap-1 flex-wrap">
        {categoryData.map((indicator) => {
          const style = SOURCE_CATEGORY_STYLES[indicator.category];
          const isActive = activeCategory === indicator.category;
          const IconComponent = indicator.icon;

          return (
            <button
              key={indicator.category}
              onClick={() => handleClick(indicator)}
              disabled={!indicator.hasEvents && !isActive}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1 rounded-full",
                "text-xs font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Active state
                isActive && [
                  style.bg,
                  style.text,
                  "ring-2 ring-offset-1 ring-offset-background",
                  style.border,
                ],
                // Has events but not active
                !isActive &&
                  indicator.hasEvents && [
                    "bg-muted/30 hover:bg-muted/50",
                    "text-foreground",
                    "border border-transparent hover:border-border/40",
                  ],
                // No events
                !isActive &&
                  !indicator.hasEvents && [
                    "bg-transparent",
                    "text-muted-foreground/50",
                    "cursor-not-allowed",
                  ],
              )}
              aria-pressed={isActive}
              aria-label={`${indicator.label}: ${indicator.count} events`}
              data-testid={`category-indicator-${indicator.category}`}
            >
              {/* Indicator dot */}
              <span
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  isActive && style.bg.replace("bg-", "bg-").replace("/50", ""),
                  !isActive && indicator.hasEvents && style.text,
                  !isActive && !indicator.hasEvents && "bg-muted-foreground/30",
                )}
                style={{
                  backgroundColor: indicator.hasEvents
                    ? undefined
                    : "currentColor",
                  opacity: indicator.hasEvents ? 1 : 0.3,
                }}
              />

              {/* Icon */}
              <IconComponent
                className={cn(
                  "w-3.5 h-3.5 transition-colors",
                  isActive && style.text,
                  !isActive && indicator.hasEvents && "text-foreground",
                  !isActive &&
                    !indicator.hasEvents &&
                    "text-muted-foreground/50",
                )}
              />

              {/* Label + Count */}
              <span className="hidden sm:inline">{indicator.label}</span>
              {indicator.count > 0 && (
                <span
                  className={cn(
                    "min-w-[1.25rem] px-1 py-0 text-[10px] rounded-full text-center",
                    isActive
                      ? "bg-background/20 text-current"
                      : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {indicator.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Clear filter button */}
      {activeCategory && (
        <button
          onClick={() => onCategoryClick(null)}
          className={cn(
            "ml-auto text-xs text-muted-foreground hover:text-foreground",
            "px-2 py-1 rounded hover:bg-muted/50 transition-colors",
          )}
        >
          Clear
        </button>
      )}
    </div>
  );
}
