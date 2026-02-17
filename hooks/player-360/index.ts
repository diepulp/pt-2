/**
 * Player 360 Hooks
 *
 * React Query hooks and Zustand stores for Player 360 dashboard.
 * Provides data fetching and state management for panels v0.
 *
 * @see services/player360-dashboard - Service layer
 * @see PRD-023 Player 360 Panels v0
 */

// === Query Hooks ===

export {
  usePlayerSummary,
  type UsePlayerSummaryOptions,
} from './use-player-summary';

export {
  usePlayerEligibility,
  type UsePlayerEligibilityOptions,
} from './use-player-eligibility';

export {
  usePlayerWeeklySeries,
  type UsePlayerWeeklySeriesOptions,
  type TimeLensRange,
} from './use-player-weekly-series';

export { useRecentEvents } from './use-recent-events';

// === State Hooks ===

export {
  useTimelineFilter,
  useTimelineFilterStore,
  type SourceCategory,
  type TimelineFilterState,
  type TimelineFilterActions,
} from './use-timeline-filter';

// === Search Keyboard Hook (PRD-022-PATCH-OPTION-B) ===

export { useSearchKeyboard } from './use-search-keyboard';

// === Re-exported DTOs ===

export type {
  PlayerSummaryDTO,
  PlayerSessionValueDTO,
  PlayerCashVelocityDTO,
  PlayerEngagementDTO,
  RewardsEligibilityDTO,
  ReasonCode,
  WeeklySeriesDTO,
  WeeklyBucketDTO,
} from '@/services/player360-dashboard/dtos';
