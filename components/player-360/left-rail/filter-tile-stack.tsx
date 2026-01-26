/**
 * Filter Tile Stack Component
 *
 * Vertical stack of filter tiles for Left Rail.
 * Provides quick access to category filters.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import type { PlayerSummaryDTO, SourceCategory } from "@/hooks/player-360";
import { cn } from "@/lib/utils";

import { FilterTile } from "./filter-tile";

// === Props ===

export interface FilterTileStackProps {
  /** Player summary data for values */
  data: PlayerSummaryDTO;
  /** Currently active filter category */
  activeCategory: SourceCategory | null;
  /** Filter category change handler */
  onCategoryChange: (category: SourceCategory | null) => void;
  /** Additional class names */
  className?: string;
}

// === Formatters ===

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absValue >= 1000) {
    return `${prefix}$${(absValue / 1000).toFixed(1)}k`;
  }
  return `${prefix}$${absValue.toFixed(0)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

// === Component ===

/**
 * Stack of filter tiles showing key metrics.
 *
 * @example
 * ```tsx
 * function LeftRail({ playerId }: { playerId: string }) {
 *   const { data } = usePlayerSummary(playerId);
 *   const { activeCategory, setCategory, clearFilter } = useTimelineFilter();
 *
 *   if (!data) return <Skeleton />;
 *
 *   return (
 *     <FilterTileStack
 *       data={data}
 *       activeCategory={activeCategory}
 *       onCategoryChange={setCategory}
 *     />
 *   );
 * }
 * ```
 */
export function FilterTileStack({
  data,
  activeCategory,
  onCategoryChange,
  className,
}: FilterTileStackProps) {
  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      data-testid="filter-tile-stack"
    >
      <FilterTile
        title="Session"
        value={formatCurrency(data.sessionValue.netWinLoss)}
        delta={
          data.sessionValue.trendPercent !== 0
            ? `${data.sessionValue.trendPercent > 0 ? "+" : ""}${data.sessionValue.trendPercent.toFixed(0)}%`
            : undefined
        }
        category="session"
        isActive={activeCategory === "session"}
        onFilter={() => onCategoryChange("session")}
        onClear={() => onCategoryChange(null)}
      />

      <FilterTile
        title="Financial"
        value={formatCurrency(data.cashVelocity.sessionTotal)}
        category="financial"
        isActive={activeCategory === "financial"}
        onFilter={() => onCategoryChange("financial")}
        onClear={() => onCategoryChange(null)}
      />

      <FilterTile
        title="Gaming"
        value={formatDuration(data.engagement.durationMinutes)}
        category="gaming"
        isActive={activeCategory === "gaming"}
        onFilter={() => onCategoryChange("gaming")}
        onClear={() => onCategoryChange(null)}
      />

      <FilterTile
        title="Loyalty"
        value={
          data.rewardsEligibility.status === "available" ? "Eligible" : "—"
        }
        category="loyalty"
        isActive={activeCategory === "loyalty"}
        onFilter={() => onCategoryChange("loyalty")}
        onClear={() => onCategoryChange(null)}
      />
    </div>
  );
}
