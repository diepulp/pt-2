/**
 * Filter Tile Component
 *
 * Compact interactive tile for timeline filtering.
 * Shows metric value with active state indicator.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import { X } from "lucide-react";

import type { SourceCategory } from "@/hooks/player-360";
import { cn } from "@/lib/utils";

// === Props ===

export interface FilterTileProps {
  /** Tile title */
  title: string;
  /** Metric value to display */
  value: string;
  /** Optional delta/change indicator */
  delta?: string;
  /** Category for filtering */
  category: SourceCategory;
  /** Whether this filter is active */
  isActive?: boolean;
  /** Click handler to activate filter */
  onFilter: () => void;
  /** Click handler to clear filter */
  onClear: () => void;
  /** Additional class names */
  className?: string;
}

// === Component ===

/**
 * Compact filter tile for Left Rail.
 *
 * @example
 * ```tsx
 * <FilterTile
 *   title="Sessions"
 *   value="12"
 *   delta="+3"
 *   category="session"
 *   isActive={activeCategory === 'session'}
 *   onFilter={() => setCategory('session')}
 *   onClear={() => clearFilter()}
 * />
 * ```
 */
export function FilterTile({
  title,
  value,
  delta,
  category,
  isActive = false,
  onFilter,
  onClear,
  className,
}: FilterTileProps) {
  const handleClick = () => {
    if (isActive) {
      onClear();
    } else {
      onFilter();
    }
  };

  const handleClearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClear();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-between w-full px-3 py-2 rounded-md",
        "border border-border/40 bg-card/30 transition-all",
        "hover:bg-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "ring-2 ring-primary bg-primary/5",
        className,
      )}
      data-testid={`filter-tile-${category}`}
      aria-pressed={isActive}
    >
      {/* Left: Title + Value */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className="text-sm font-medium">{value}</span>
        {delta && (
          <span
            className={cn(
              "text-xs",
              delta.startsWith("+") ? "text-emerald-400" : "text-red-400",
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {/* Right: Clear button when active */}
      {isActive && (
        <button
          type="button"
          onClick={handleClearClick}
          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </button>
  );
}
