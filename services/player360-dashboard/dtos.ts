/**
 * Player360DashboardService DTOs
 *
 * Read-only aggregation layer for Player 360 panels.
 * Combines data from Visit, Loyalty, Timeline, and Player services.
 *
 * @see PRD-023 Player 360 Panels v0
 */

// === Reason Codes for Rewards Eligibility ===

/**
 * Reason codes explaining why a player is not eligible for rewards.
 * AVAILABLE = player can receive a reward now
 */
export type ReasonCode =
  | "AVAILABLE"
  | "COOLDOWN_ACTIVE"
  | "MIN_PLAY_NOT_MET"
  | "DAILY_LIMIT_REACHED"
  | "RULES_NOT_CONFIGURED";

// === Snapshot Band DTOs ===

/**
 * Session value metrics for Summary Band.
 * Displays real-time win/loss and theoretical value.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface PlayerSessionValueDTO {
  /** Net win/loss (cash out - cash in) for current session or rolling window */
  netWinLoss: number;
  /** Theoretical win/loss estimate */
  theoEstimate: number;
  /** ISO timestamp of last financial action */
  lastActionAt: string;
  /** Trend percentage vs previous period (-100 to +100) */
  trendPercent: number;
}

/**
 * Cash velocity metrics.
 * Tracks spending rate and total buy-in for session.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface PlayerCashVelocityDTO {
  /** Dollar amount per hour */
  ratePerHour: number;
  /** Total cash in for current session */
  sessionTotal: number;
  /** ISO timestamp of last buy-in */
  lastBuyInAt: string;
}

/**
 * Engagement status metrics.
 * Derived from session duration and last activity.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface PlayerEngagementDTO {
  /** Engagement status classification */
  status: "active" | "cooling" | "dormant";
  /** Session duration in minutes */
  durationMinutes: number;
  /** ISO timestamp of last activity */
  lastSeenAt: string;
  /** True if last action within 15 minutes */
  isActive: boolean;
}

/**
 * Rewards eligibility status.
 * Determines if player can receive a comp/reward now.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface RewardsEligibilityDTO {
  /** Eligibility status */
  status: "available" | "not_available" | "unknown";
  /** ISO timestamp when next eligible (if cooldown active) */
  nextEligibleAt: string | null;
  /** List of reason codes explaining status */
  reasonCodes: ReasonCode[];
  /** User-facing guidance text (null if available) */
  guidance: string | null;
}

/**
 * Combined summary for all Snapshot Band tiles.
 * Single aggregated response for efficient rendering.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface PlayerSummaryDTO {
  /** Player ID */
  playerId: string;
  /** Session value metrics */
  sessionValue: PlayerSessionValueDTO;
  /** Cash velocity metrics */
  cashVelocity: PlayerCashVelocityDTO;
  /** Engagement status */
  engagement: PlayerEngagementDTO;
  /** Rewards eligibility */
  rewardsEligibility: RewardsEligibilityDTO;
  /** Current gaming day context (YYYY-MM-DD) */
  gamingDay: string;
}

// === Activity Panel DTOs ===

/**
 * Weekly bucket for Activity chart.
 * Aggregates visits and rewards by week.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface WeeklyBucketDTO {
  /** ISO date of week start (Monday) */
  weekStart: string;
  /** Number of visits this week */
  visitCount: number;
  /** Number of rewards issued this week */
  rewardCount: number;
}

/**
 * Weekly series for Activity chart.
 * Typically shows 8-12 weeks of historical data.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface WeeklySeriesDTO {
  /** Weekly buckets (sorted by weekStart ascending) */
  buckets: WeeklyBucketDTO[];
  /** Period start date (ISO date) */
  periodStart: string;
  /** Period end date (ISO date) */
  periodEnd: string;
}

/**
 * Reward history item for Recent Rewards strip.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface RewardHistoryItemDTO {
  /** Reward ID */
  id: string;
  /** ISO timestamp when issued */
  issuedAt: string;
  /** Reward type classification */
  rewardType: "matchplay" | "freeplay" | "comp" | "other";
  /** Reward amount (points or dollar value) */
  amount: number;
  /** Staff member who issued reward */
  issuedBy: { id: string; name: string };
  /** Associated visit ID (nullable) */
  visitId: string | null;
}

/**
 * Recent events for timeline strip.
 * Shows last buy-in, reward, and note for quick context.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface RecentEventsDTO {
  /** Last buy-in event (null if none) */
  lastBuyIn: { at: string; amount: number } | null;
  /** Last reward event (null if none) */
  lastReward: { at: string; type: string } | null;
  /** Last note event (null if none) */
  lastNote: { at: string; preview: string } | null;
}

// === Query Types ===

/**
 * Filters for summary query.
 * Used in query keys and for cache invalidation.
 */

export interface SummaryFilters {
  /** Player ID */
  playerId: string;
  /** Optional gaming day override (YYYY-MM-DD) */
  gamingDay?: string;
}

/**
 * Filters for activity query.
 * Used in query keys for weekly series requests.
 */

export interface ActivityFilters {
  /** Player ID */
  playerId: string;
  /** Number of weeks to fetch (default 12) */
  weeks?: number;
}

/**
 * Filters for reward history query.
 * Used in query keys for recent rewards strip.
 */

export interface RewardHistoryFilters {
  /** Player ID */
  playerId: string;
  /** Max items to return (default 5) */
  limit?: number;
}
