/**
 * Player 360 Timeline Pagination Contract (WS-UX-C)
 *
 * Type definitions for timeline pagination UI.
 * Defines cursor semantics, hook return types, and infinite scroll contracts.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS-UX-C
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 */

import type {
  InteractionEventDTO,
  TimelineResponse,
} from "@/services/player-timeline/dtos";

// === Pagination Cursor ===

/**
 * Keyset pagination cursor for timeline queries.
 * Uses (occurredAt, eventId) tuple for stable ordering.
 *
 * Pagination Behavior:
 * 1. Initial load: cursorAt=null, cursorId=null
 * 2. Next page: pass (cursorAt, cursorId) from previous response
 * 3. Stop when: hasMore=false
 */
export interface PaginationCursor {
  /** Cursor timestamp (ISO 8601) - from next_cursor_at */
  cursorAt: string;
  /** Cursor event ID - from next_cursor_id */
  cursorId: string;
}

/**
 * Pagination state from RPC response.
 */
export interface PaginationState {
  /** True if more pages exist */
  hasMore: boolean;
  /** Next page cursor timestamp */
  nextCursorAt: string | null;
  /** Next page cursor event ID */
  nextCursorId: string | null;
}

/**
 * Extracts pagination state from a timeline response.
 */
export function extractPaginationState(
  response: TimelineResponse,
): PaginationState {
  return {
    hasMore: response.hasMore,
    nextCursorAt: response.nextCursorAt,
    nextCursorId: response.nextCursorId,
  };
}

/**
 * Creates a cursor from pagination state.
 * Returns null if no more pages.
 */
export function createNextCursor(
  state: PaginationState,
): PaginationCursor | null {
  if (!state.hasMore || !state.nextCursorAt || !state.nextCursorId) {
    return null;
  }
  return {
    cursorAt: state.nextCursorAt,
    cursorId: state.nextCursorId,
  };
}

// === Hook Return Types ===

/**
 * Return type for usePlayerTimeline hook (basic query).
 * Single page of events with loading/error states.
 */
export interface UseTimelineResult {
  /** Timeline events for current page */
  events: InteractionEventDTO[];
  /** True while fetching initial data */
  isLoading: boolean;
  /** True while refetching */
  isRefetching: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** True if query is in error state */
  isError: boolean;
  /** True if query has completed successfully */
  isSuccess: boolean;
  /** Pagination state */
  pagination: PaginationState;
  /** Manually refetch data */
  refetch: () => void;
}

/**
 * Return type for useInfinitePlayerTimeline hook.
 * Multiple pages with infinite scroll support.
 */
export interface UseInfiniteTimelineResult {
  /** All events across all loaded pages */
  events: InteractionEventDTO[];
  /** True while fetching initial data */
  isLoading: boolean;
  /** True while fetching next page */
  isFetchingNextPage: boolean;
  /** True if more pages exist */
  hasNextPage: boolean;
  /** Fetch next page of results */
  fetchNextPage: () => void;
  /** Error object if query failed */
  error: Error | null;
  /** True if query is in error state */
  isError: boolean;
  /** True if query has completed successfully */
  isSuccess: boolean;
  /** Manually refetch all pages */
  refetch: () => void;
  /** Number of pages loaded */
  pageCount: number;
  /** Total events loaded */
  totalEvents: number;
}

// === Infinite Scroll Helpers ===

/**
 * Flattens paginated timeline responses into a single event array.
 * Used for infinite scroll rendering.
 */
export function flattenTimelinePages(
  pages: TimelineResponse[] | undefined,
): InteractionEventDTO[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.events);
}

/**
 * Gets the last page from paginated responses.
 * Used for determining hasMore status.
 */
export function getLastPage(
  pages: TimelineResponse[] | undefined,
): TimelineResponse | undefined {
  if (!pages || pages.length === 0) return undefined;
  return pages[pages.length - 1];
}

/**
 * Determines if more pages can be loaded.
 */
export function canLoadMore(pages: TimelineResponse[] | undefined): boolean {
  const lastPage = getLastPage(pages);
  return lastPage?.hasMore ?? false;
}

// === Virtualization Support ===

/**
 * Estimated row height for virtualized list.
 * Collapsed card height in pixels.
 */
export const TIMELINE_CARD_HEIGHT_COLLAPSED = 72;

/**
 * Estimated expanded card height in pixels.
 */
export const TIMELINE_CARD_HEIGHT_EXPANDED = 200;

/**
 * Overscan count for virtualized list.
 * Number of items to render above/below visible area.
 */
export const TIMELINE_OVERSCAN_COUNT = 5;

/**
 * Threshold for triggering next page load.
 * Load more when this many items from end.
 */
export const TIMELINE_LOAD_MORE_THRESHOLD = 10;

/**
 * Configuration for timeline virtualization.
 */
export interface TimelineVirtualizationConfig {
  /** Height of collapsed card */
  collapsedHeight: number;
  /** Height of expanded card */
  expandedHeight: number;
  /** Number of items to overscan */
  overscanCount: number;
  /** Items from end to trigger load more */
  loadMoreThreshold: number;
}

/**
 * Default virtualization configuration.
 */
export const DEFAULT_VIRTUALIZATION_CONFIG: TimelineVirtualizationConfig = {
  collapsedHeight: TIMELINE_CARD_HEIGHT_COLLAPSED,
  expandedHeight: TIMELINE_CARD_HEIGHT_EXPANDED,
  overscanCount: TIMELINE_OVERSCAN_COUNT,
  loadMoreThreshold: TIMELINE_LOAD_MORE_THRESHOLD,
};

// === Loading States ===

/**
 * Loading state for timeline UI.
 */
export type TimelineLoadingState =
  | "idle"
  | "loading-initial"
  | "loading-more"
  | "refetching"
  | "error";

/**
 * Determines the loading state from hook result.
 */
export function getLoadingState(
  isLoading: boolean,
  isFetchingNextPage: boolean,
  isRefetching: boolean,
  isError: boolean,
): TimelineLoadingState {
  if (isError) return "error";
  if (isLoading) return "loading-initial";
  if (isFetchingNextPage) return "loading-more";
  if (isRefetching) return "refetching";
  return "idle";
}

// === Pagination UI Text ===

/**
 * Generates "Showing X of Y" text for pagination.
 */
export function getPaginationText(
  loadedCount: number,
  hasMore: boolean,
): string {
  if (loadedCount === 0) {
    return "No events found";
  }
  if (hasMore) {
    return `Showing ${loadedCount} events (more available)`;
  }
  return `Showing all ${loadedCount} events`;
}

/**
 * Generates loading indicator text.
 */
export function getLoadingText(state: TimelineLoadingState): string {
  switch (state) {
    case "loading-initial":
      return "Loading timeline...";
    case "loading-more":
      return "Loading older events...";
    case "refetching":
      return "Refreshing...";
    case "error":
      return "Failed to load timeline";
    default:
      return "";
  }
}
