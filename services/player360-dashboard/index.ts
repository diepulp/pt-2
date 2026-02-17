/**
 * Player360DashboardService
 *
 * Read-only aggregation service for Player 360 dashboard panels.
 * Combines data from PlayerContext, VisitContext, LoyaltyContext.
 *
 * Pattern A (Contract-First): Manual DTOs for cross-context aggregation.
 * NO direct table ownership - reads from existing bounded contexts.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see EXECUTION-SPEC-PRD-023.md WS1
 */

// === DTO Exports ===
export type {
  PlayerSessionValueDTO,
  PlayerCashVelocityDTO,
  PlayerEngagementDTO,
  RewardsEligibilityDTO,
  PlayerSummaryDTO,
  WeeklyBucketDTO,
  WeeklySeriesDTO,
  RewardHistoryItemDTO,
  RecentEventsDTO,
  ReasonCode,
  SummaryFilters,
  ActivityFilters,
  RewardHistoryFilters,
} from './dtos';

// === Schema Exports ===
export {
  reasonCodeSchema,
  summaryQuerySchema,
  activityQuerySchema,
  rewardHistoryQuerySchema,
  player360RouteParamsSchema,
} from './schemas';

export type {
  SummaryQueryInput,
  ActivityQueryInput,
  RewardHistoryQueryInput,
  Player360RouteParams,
} from './schemas';

// === Key Factory Exports ===
export { player360DashboardKeys } from './keys';

// === Mapper Exports (for testing) ===
export {
  mapToSessionValue,
  mapToCashVelocity,
  mapToEngagement,
  mapToRewardsEligibility,
  mapToWeeklySeries,
  mapToRewardHistoryItem,
  mapToRecentEvents,
  composePlayerSummary,
  getWeekStart,
} from './mappers';

// === CRUD Exports ===
export {
  getPlayerSummary,
  getWeeklySeries,
  getRewardHistory,
  getRecentEvents,
} from './crud';
