/**
 * Player 360 Timeline Contracts
 *
 * UX type contracts for the Player 360 interaction timeline.
 * Exports card types, filter state, and pagination helpers.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS-UX-A/B/C
 */

// Card Contract (WS-UX-A)
export {
  EVENT_ICON_MAP,
  EVENT_TYPE_LABELS,
  EVENT_TYPES_BY_CATEGORY,
  getEventIcon,
  getEventTypeLabel,
  getSourceCategory,
  getSourceCategoryStyle,
  SOURCE_CATEGORY_STYLES,
  toCollapsedCard,
  toExpandedCard,
  type EventIcon,
  type SourceCategory,
  type SourceCategoryStyle,
  type TimelineCardCollapsed,
  type TimelineCardExpanded,
} from './types';

// Grouped Timeline Components
export { CategoryIndicatorBar } from './category-indicator-bar';
export {
  groupEventsIntoBlocks,
  TimeBlockGroup,
  type TimeBlock,
} from './time-block-group';
export { GroupedTimeline } from './grouped-timeline';

// Filter Contract (WS-UX-B)
export {
  countActiveEventTypeFilters,
  DATE_PRESET_LABELS,
  datePresetToRange,
  DEFAULT_TIMELINE_FILTERS,
  filtersToQuery,
  filtersToSearchParams,
  getFilterSummary,
  hasActiveFilters,
  searchParamsToFilters,
  type CustomDateRange,
  type DatePreset,
  type DateRangeFilter,
  type TimelineUIFilters,
} from './filters';

// Pagination Contract (WS-UX-C)
export {
  canLoadMore,
  createNextCursor,
  DEFAULT_VIRTUALIZATION_CONFIG,
  extractPaginationState,
  flattenTimelinePages,
  getLastPage,
  getLoadingState,
  getLoadingText,
  getPaginationText,
  TIMELINE_CARD_HEIGHT_COLLAPSED,
  TIMELINE_CARD_HEIGHT_EXPANDED,
  TIMELINE_LOAD_MORE_THRESHOLD,
  TIMELINE_OVERSCAN_COUNT,
  type PaginationCursor,
  type PaginationState,
  type TimelineLoadingState,
  type TimelineVirtualizationConfig,
  type UseInfiniteTimelineResult,
  type UseTimelineResult,
} from './pagination';
