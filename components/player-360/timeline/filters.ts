/**
 * Player 360 Timeline Filter Contract (WS-UX-B)
 *
 * Type definitions for timeline filter UI components.
 * Defines filter state, date presets, and query mapping.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS-UX-B
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 */

import type {
  InteractionEventType,
  TimelineQuery,
} from '@/services/player-timeline/dtos';

// === Date Presets ===

/**
 * Predefined date range presets for quick filtering.
 * Per UX baseline: date presets dropdown + custom range modal.
 */
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_gaming_day'
  | 'custom';

/**
 * Human-readable labels for date presets.
 */
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 Days',
  last_30_days: 'Last 30 Days',
  this_gaming_day: 'This Gaming Day',
  custom: 'Custom Range',
};

/**
 * Custom date range for 'custom' preset.
 */
export interface CustomDateRange {
  /** Start date (ISO date string YYYY-MM-DD) */
  fromDate: string;
  /** End date (ISO date string YYYY-MM-DD) */
  toDate: string;
}

/**
 * Date range filter state.
 * Either a preset or custom range.
 */
export type DateRangeFilter =
  | { type: 'preset'; preset: Exclude<DatePreset, 'custom'> }
  | { type: 'custom'; range: CustomDateRange };

// === Timeline Filters ===

/**
 * Complete filter state for timeline UI.
 * Maps to RPC parameters via filtersToQuery().
 */
export interface TimelineUIFilters {
  /** Selected event types (multi-select chips) */
  eventTypes: InteractionEventType[];

  /** Date range selection */
  dateRange: DateRangeFilter;

  /** Show only exception events (stub for MVP, future: compliance alerts) */
  exceptionsOnly: boolean;

  /** Results per page */
  limit: number;
}

/**
 * Default filter values.
 */
export const DEFAULT_TIMELINE_FILTERS: TimelineUIFilters = {
  eventTypes: [],
  dateRange: { type: 'preset', preset: 'last_7_days' },
  exceptionsOnly: false,
  limit: 50,
};

// === Filter to Query Mapper ===

/**
 * Converts a date preset to ISO date strings.
 * Note: Gaming day calculation requires casino timezone from context.
 *
 * @param preset - Date preset to convert
 * @param gamingDayDate - Current gaming day date (optional, for this_gaming_day preset)
 * @returns Object with fromDate and toDate ISO strings
 */
export function datePresetToRange(
  preset: Exclude<DatePreset, 'custom'>,
  gamingDayDate?: string,
): { fromDate: string; toDate: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (preset) {
    case 'today':
      return { fromDate: today, toDate: today };

    case 'yesterday': {
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      return { fromDate: yesterdayStr, toDate: yesterdayStr };
    }

    case 'last_7_days': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        fromDate: weekAgo.toISOString().split('T')[0],
        toDate: today,
      };
    }

    case 'last_30_days': {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return {
        fromDate: monthAgo.toISOString().split('T')[0],
        toDate: today,
      };
    }

    case 'this_gaming_day': {
      // Gaming day is provided by casino context
      // If not available, fall back to today
      const gd = gamingDayDate ?? today;
      return { fromDate: gd, toDate: gd };
    }

    default:
      // TypeScript exhaustiveness check - should never reach here
      return preset satisfies never;
  }
}

/**
 * Converts UI filter state to TimelineQuery parameters.
 * Used when constructing RPC calls.
 *
 * @param playerId - Player UUID (required)
 * @param filters - UI filter state
 * @param gamingDayDate - Current gaming day date (optional)
 * @returns TimelineQuery for RPC call
 */
export function filtersToQuery(
  playerId: string,
  filters: TimelineUIFilters,
  gamingDayDate?: string,
): Omit<TimelineQuery, 'cursorAt' | 'cursorId'> {
  // Resolve date range
  let fromDate: string | undefined;
  let toDate: string | undefined;

  if (filters.dateRange.type === 'preset') {
    const range = datePresetToRange(filters.dateRange.preset, gamingDayDate);
    fromDate = range.fromDate;
    toDate = range.toDate;
  } else {
    fromDate = filters.dateRange.range.fromDate;
    toDate = filters.dateRange.range.toDate;
  }

  return {
    playerId,
    eventTypes: filters.eventTypes.length > 0 ? filters.eventTypes : undefined,
    fromDate,
    toDate,
    limit: filters.limit,
  };
}

// === Filter Chip Helpers ===

/**
 * Checks if any filters are active (non-default).
 * Used for "Clear all" button visibility.
 */
export function hasActiveFilters(filters: TimelineUIFilters): boolean {
  const defaults = DEFAULT_TIMELINE_FILTERS;

  // Check event types
  if (filters.eventTypes.length > 0) return true;

  // Check date range (comparing preset/custom type)
  if (filters.dateRange.type !== defaults.dateRange.type) return true;
  if (
    filters.dateRange.type === 'preset' &&
    defaults.dateRange.type === 'preset' &&
    filters.dateRange.preset !== defaults.dateRange.preset
  ) {
    return true;
  }

  // Check exceptions toggle
  if (filters.exceptionsOnly !== defaults.exceptionsOnly) return true;

  // Check limit
  if (filters.limit !== defaults.limit) return true;

  return false;
}

/**
 * Counts the number of active event type filters.
 * Used for badge display on filter button.
 */
export function countActiveEventTypeFilters(
  filters: TimelineUIFilters,
): number {
  return filters.eventTypes.length;
}

/**
 * Returns a human-readable summary of active filters.
 * Used for accessibility and screen readers.
 */
export function getFilterSummary(filters: TimelineUIFilters): string {
  const parts: string[] = [];

  if (filters.eventTypes.length > 0) {
    parts.push(`${filters.eventTypes.length} event type(s)`);
  }

  if (filters.dateRange.type === 'preset') {
    parts.push(DATE_PRESET_LABELS[filters.dateRange.preset]);
  } else {
    parts.push(
      `${filters.dateRange.range.fromDate} to ${filters.dateRange.range.toDate}`,
    );
  }

  if (filters.exceptionsOnly) {
    parts.push('Exceptions only');
  }

  return parts.join(', ') || 'No filters applied';
}

// === URL Serialization ===

/**
 * Serializes filters to URL search params.
 * Used for shareable filter state.
 */
export function filtersToSearchParams(
  filters: TimelineUIFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.eventTypes.length > 0) {
    params.set('eventTypes', filters.eventTypes.join(','));
  }

  if (filters.dateRange.type === 'preset') {
    params.set('datePreset', filters.dateRange.preset);
  } else {
    params.set('fromDate', filters.dateRange.range.fromDate);
    params.set('toDate', filters.dateRange.range.toDate);
  }

  if (filters.exceptionsOnly) {
    params.set('exceptionsOnly', 'true');
  }

  if (filters.limit !== DEFAULT_TIMELINE_FILTERS.limit) {
    params.set('limit', filters.limit.toString());
  }

  return params;
}

/**
 * Parses filters from URL search params.
 * Used for initializing filter state from URL.
 */
export function searchParamsToFilters(
  params: URLSearchParams,
): Partial<TimelineUIFilters> {
  const filters: Partial<TimelineUIFilters> = {};

  // Parse event types
  const eventTypesParam = params.get('eventTypes');
  if (eventTypesParam) {
    filters.eventTypes = eventTypesParam.split(',') as InteractionEventType[];
  }

  // Parse date range
  const datePreset = params.get('datePreset') as DatePreset | null;
  const fromDate = params.get('fromDate');
  const toDate = params.get('toDate');

  if (datePreset && datePreset !== 'custom') {
    filters.dateRange = { type: 'preset', preset: datePreset };
  } else if (fromDate && toDate) {
    filters.dateRange = {
      type: 'custom',
      range: { fromDate, toDate },
    };
  }

  // Parse exceptions toggle
  if (params.get('exceptionsOnly') === 'true') {
    filters.exceptionsOnly = true;
  }

  // Parse limit
  const limitParam = params.get('limit');
  if (limitParam) {
    const limit = parseInt(limitParam, 10);
    if (!isNaN(limit) && limit > 0) {
      filters.limit = limit;
    }
  }

  return filters;
}
