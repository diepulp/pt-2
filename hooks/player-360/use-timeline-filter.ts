/**
 * Timeline Filter State Hook
 *
 * Zustand store for shared filter state between Left Rail and Center Panel.
 * Single source of truth for active category filters and time lens.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import { create } from "zustand";

import type { TimeLensRange } from "./use-player-weekly-series";

// === Source Category Types ===

/**
 * Source categories for timeline event filtering.
 * Maps to the event taxonomy from ADR-029.
 */
export type SourceCategory =
  | "session" // Session-related: visit_start, visit_end, table_change
  | "gaming" // Gaming-related: rating_start, rating_end
  | "financial" // Financial: cash_in, cash_out
  | "loyalty" // Loyalty: points_earned, points_redeemed, promo_issued
  | "compliance" // Compliance: self_exclusion, id_verified
  | "note"; // Staff notes: note_added

// === Filter State Interface ===

/**
 * Timeline filter state shape.
 */
export interface TimelineFilterState {
  /** Currently active category filter (null = show all) */
  activeCategory: SourceCategory | null;
  /** Time lens for activity chart and summary metrics */
  timeLens: TimeLensRange;
  /** ID of timeline event to scroll to (transient) */
  scrollToEventId: string | null;
}

/**
 * Timeline filter actions.
 */
export interface TimelineFilterActions {
  /** Set active category filter */
  setCategory: (category: SourceCategory | null) => void;
  /** Set time lens period */
  setTimeLens: (lens: TimeLensRange) => void;
  /** Clear all filters (reset to defaults) */
  clearFilter: () => void;
  /** Trigger scroll to specific event */
  scrollToEvent: (eventId: string) => void;
  /** Clear scroll target after animation */
  clearScrollTarget: () => void;
}

// === Default State ===

const defaultState: TimelineFilterState = {
  activeCategory: null,
  timeLens: "12w",
  scrollToEventId: null,
};

// === Zustand Store ===

/**
 * Zustand store for timeline filter state.
 *
 * Provides shared state between:
 * - Left Rail filter tiles
 * - Center Panel summary tiles
 * - Activity chart time lens control
 * - Timeline scroll coordination
 */
export const useTimelineFilterStore = create<
  TimelineFilterState & TimelineFilterActions
>((set) => ({
  // State
  ...defaultState,

  // Actions
  setCategory: (category) => set({ activeCategory: category }),

  setTimeLens: (lens) => set({ timeLens: lens }),

  clearFilter: () => set({ activeCategory: null }),

  scrollToEvent: (eventId) => set({ scrollToEventId: eventId }),

  clearScrollTarget: () => set({ scrollToEventId: null }),
}));

// === Convenience Hook ===

/**
 * Hook for consuming timeline filter state.
 *
 * Provides a clean API for components to read and update filter state.
 *
 * @example
 * ```tsx
 * function FilterTile({ category }: { category: SourceCategory }) {
 *   const { activeCategory, setCategory, clearFilter } = useTimelineFilter();
 *   const isActive = activeCategory === category;
 *
 *   return (
 *     <button
 *       onClick={() => isActive ? clearFilter() : setCategory(category)}
 *       className={isActive ? 'ring-2 ring-primary' : ''}
 *     >
 *       {category}
 *       {isActive && <span onClick={clearFilter}>×</span>}
 *     </button>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * function TimeLensControl() {
 *   const { timeLens, setTimeLens } = useTimelineFilter();
 *
 *   return (
 *     <ToggleGroup value={timeLens} onValueChange={setTimeLens}>
 *       <ToggleGroupItem value="30d">30d</ToggleGroupItem>
 *       <ToggleGroupItem value="90d">90d</ToggleGroupItem>
 *       <ToggleGroupItem value="12w">12w</ToggleGroupItem>
 *     </ToggleGroup>
 *   );
 * }
 * ```
 */
export function useTimelineFilter() {
  const store = useTimelineFilterStore();

  return {
    // State
    activeCategory: store.activeCategory,
    timeLens: store.timeLens,
    scrollToEventId: store.scrollToEventId,

    // Actions
    setCategory: store.setCategory,
    setTimeLens: store.setTimeLens,
    clearFilter: store.clearFilter,
    scrollToEvent: store.scrollToEvent,
    clearScrollTarget: store.clearScrollTarget,

    // Derived
    hasActiveFilter: store.activeCategory !== null,
  };
}

// === Re-export Types ===

export type { TimeLensRange };
