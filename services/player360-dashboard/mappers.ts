/**
 * Player360DashboardService Mappers
 *
 * Transform data from existing services into Player360 DTOs.
 * All transformations are pure functions with explicit input/output types.
 *
 * @see PRD-023 Player 360 Panels v0
 */

import type { Json } from '@/types/database.types';

import type { VisitFinancialSummaryDTO } from '../player-financial/dtos';
import type { VisitDTO } from '../visit/dtos';

import type {
  PlayerCashVelocityDTO,
  PlayerEngagementDTO,
  PlayerSessionValueDTO,
  PlayerSummaryDTO,
  RecentEventsDTO,
  RewardHistoryItemDTO,
  RewardsEligibilityDTO,
  WeeklyBucketDTO,
  WeeklySeriesDTO,
} from './dtos';

// === Type Guards and Safe Converters ===

/**
 * Extract house_edge and decisions_per_hour from rating_slip.policy_snapshot.
 *
 * The RPC rpc_start_rating_slip snapshots these values from the game_settings
 * TABLE into policy_snapshot.loyalty at slip creation time. The rating_slip's
 * own game_settings JSON column stores input params (min_bet, max_bet) — NOT
 * house_edge or decisions_per_hour.
 *
 * @see policy-snapshot.integration.test.ts for snapshot structure
 */

export function extractTheoSettings(
  policySnapshot: Json,
): { house_edge: number; decisions_per_hour: number } | null {
  if (
    !policySnapshot ||
    typeof policySnapshot !== 'object' ||
    Array.isArray(policySnapshot)
  ) {
    return null;
  }
  const ps = policySnapshot as Record<string, unknown>;
  const loyalty = ps.loyalty;
  if (!loyalty || typeof loyalty !== 'object' || Array.isArray(loyalty)) {
    return null;
  }
  const loy = loyalty as Record<string, unknown>;
  if (
    typeof loy.house_edge !== 'number' ||
    typeof loy.decisions_per_hour !== 'number'
  ) {
    return null;
  }
  return {
    house_edge: loy.house_edge,
    decisions_per_hour: loy.decisions_per_hour,
  };
}

/**
 * Type-safe conversion of Json to Record<string, unknown>.
 * Validates at runtime that the value is a non-null object.
 */
export function toMetadataRecord(metadata: Json): Record<string, unknown> {
  if (metadata === null || metadata === undefined) {
    return {};
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    // Type guard verified, safe to use as Record
    return metadata;
  }
  return {};
}

/**
 * Parsed loyalty data with normalized field names.
 */
export interface ParsedLoyaltyData {
  balance: number;
  tier: string | null;
}

/**
 * Parse loyalty query result into normalized structure.
 * Handles schema variations where balance might be 'balance' or 'current_balance'.
 */
export function parseLoyaltyData(
  loyaltyData: {
    current_balance?: number;
    balance?: number;
    tier?: string | null;
  } | null,
): ParsedLoyaltyData | null {
  if (!loyaltyData) {
    return null;
  }
  return {
    balance: loyaltyData.current_balance ?? loyaltyData.balance ?? 0,
    tier: loyaltyData.tier ?? null,
  };
}

// === Constants ===

/** Minutes threshold for "active" status */
const ACTIVE_THRESHOLD_MINUTES = 15;
/** Minutes threshold for "cooling" status (15-60 min) */
const COOLING_THRESHOLD_MINUTES = 60;

// === Helper Functions ===

/**
 * Calculate minutes elapsed since a timestamp.
 */
function minutesSince(isoTimestamp: string): number {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 60000);
}

/**
 * Get the Monday of the week containing a given date.
 */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday
  d.setDate(diff);
  // eslint-disable-next-line temporal-rules/no-temporal-bypass -- Display bucket label, not gaming day derivation (PRD-027)
  return d.toISOString().slice(0, 10);
}

// === Session Value Mappers ===

/**
 * Map visit financial data to PlayerSessionValueDTO.
 *
 * @param financialSummary - Visit financial summary (nullable)
 * @param previousPeriodSummary - Previous period summary for trend calculation
 * @returns PlayerSessionValueDTO with computed metrics
 */
export function mapToSessionValue(
  financialSummary: VisitFinancialSummaryDTO | null,
  previousPeriodSummary: VisitFinancialSummaryDTO | null = null,
): PlayerSessionValueDTO {
  if (!financialSummary) {
    return {
      netWinLoss: 0,
      theoEstimate: 0,
      lastActionAt: new Date().toISOString(),
      trendPercent: 0,
    };
  }

  const netWinLoss = financialSummary.net_amount;

  // Calculate trend vs previous period
  let trendPercent = 0;
  if (previousPeriodSummary && previousPeriodSummary.net_amount !== 0) {
    trendPercent = Math.round(
      ((netWinLoss - previousPeriodSummary.net_amount) /
        Math.abs(previousPeriodSummary.net_amount)) *
        100,
    );
    // Clamp to -100 to +100
    trendPercent = Math.max(-100, Math.min(100, trendPercent));
  }

  return {
    netWinLoss,
    theoEstimate: 0, // TODO: Calculate from rating slips when available
    lastActionAt:
      financialSummary.last_transaction_at ?? new Date().toISOString(),
    trendPercent,
  };
}

// === Cash Velocity Mappers ===

/**
 * Map visit financial data to PlayerCashVelocityDTO.
 *
 * @param financialSummary - Visit financial summary
 * @param visitStartedAt - Visit start timestamp for rate calculation
 * @returns PlayerCashVelocityDTO with computed metrics
 */
export function mapToCashVelocity(
  financialSummary: VisitFinancialSummaryDTO | null,
  visitStartedAt: string | null,
): PlayerCashVelocityDTO {
  if (!financialSummary) {
    return {
      ratePerHour: 0,
      sessionTotal: 0,
      lastBuyInAt: new Date().toISOString(),
    };
  }

  const sessionTotal = financialSummary.total_in;

  // Calculate rate per hour
  let ratePerHour = 0;
  if (visitStartedAt && financialSummary.first_transaction_at) {
    const hoursElapsed =
      (Date.now() - new Date(visitStartedAt).getTime()) / 3600000;
    if (hoursElapsed > 0) {
      ratePerHour = Math.round(sessionTotal / hoursElapsed);
    }
  }

  return {
    ratePerHour,
    sessionTotal,
    lastBuyInAt:
      financialSummary.last_transaction_at ?? new Date().toISOString(),
  };
}

// === Engagement Mappers ===

/**
 * Map visit data to PlayerEngagementDTO.
 *
 * @param visit - Active visit (nullable)
 * @param lastEventAt - Last event timestamp for activity check
 * @returns PlayerEngagementDTO with derived status
 */
export function mapToEngagement(
  visit: VisitDTO | null,
  lastEventAt: string | null,
): PlayerEngagementDTO {
  const now = new Date().toISOString();
  const lastSeenAt = lastEventAt ?? visit?.started_at ?? now;
  const minutesAgo = minutesSince(lastSeenAt);

  // Determine engagement status
  let status: 'active' | 'cooling' | 'dormant';
  if (minutesAgo <= ACTIVE_THRESHOLD_MINUTES) {
    status = 'active';
  } else if (minutesAgo <= COOLING_THRESHOLD_MINUTES) {
    status = 'cooling';
  } else {
    status = 'dormant';
  }

  // Calculate session duration
  let durationMinutes = 0;
  if (visit?.started_at) {
    durationMinutes = minutesSince(visit.started_at);
  }

  return {
    status,
    durationMinutes,
    lastSeenAt,
    isActive: minutesAgo <= ACTIVE_THRESHOLD_MINUTES,
  };
}

// === Rewards Eligibility Mappers ===

/**
 * Map loyalty data to RewardsEligibilityDTO.
 *
 * Since rewards eligibility rules may not be configured,
 * this function handles the "unknown" state explicitly.
 *
 * @param loyaltyBalance - Player loyalty balance (nullable)
 * @param recentRewardAt - Timestamp of most recent reward (nullable)
 * @param cooldownMinutes - Cooldown period in minutes (default 30)
 * @returns RewardsEligibilityDTO with status and reason codes
 */
export function mapToRewardsEligibility(
  loyaltyBalance: { balance: number; tier: string | null } | null,
  recentRewardAt: string | null,
  cooldownMinutes = 30,
): RewardsEligibilityDTO {
  // If no loyalty record, rules aren't configured
  if (!loyaltyBalance) {
    return {
      status: 'unknown',
      nextEligibleAt: null,
      reasonCodes: ['RULES_NOT_CONFIGURED'],
      guidance: 'Loyalty rules not configured for this casino',
    };
  }

  // Check cooldown
  if (recentRewardAt) {
    const cooldownExpires = new Date(recentRewardAt);
    cooldownExpires.setMinutes(cooldownExpires.getMinutes() + cooldownMinutes);

    if (cooldownExpires.getTime() > Date.now()) {
      return {
        status: 'not_available',
        nextEligibleAt: cooldownExpires.toISOString(),
        reasonCodes: ['COOLDOWN_ACTIVE'],
        guidance: `Cooldown active until ${cooldownExpires.toLocaleTimeString()}`,
      };
    }
  }

  // Player is eligible
  return {
    status: 'available',
    nextEligibleAt: null,
    reasonCodes: ['AVAILABLE'],
    guidance: null,
  };
}

// === Summary Mapper ===

/**
 * Compose all metrics into a PlayerSummaryDTO.
 *
 * @param playerId - Player ID
 * @param sessionValue - Session value metrics
 * @param cashVelocity - Cash velocity metrics
 * @param engagement - Engagement metrics
 * @param rewardsEligibility - Rewards eligibility
 * @param gamingDay - Current gaming day
 * @returns Complete PlayerSummaryDTO
 */
export function composePlayerSummary(
  playerId: string,
  sessionValue: PlayerSessionValueDTO,
  cashVelocity: PlayerCashVelocityDTO,
  engagement: PlayerEngagementDTO,
  rewardsEligibility: RewardsEligibilityDTO,
  gamingDay: string,
): PlayerSummaryDTO {
  return {
    playerId,
    sessionValue,
    cashVelocity,
    engagement,
    rewardsEligibility,
    gamingDay,
  };
}

// === Weekly Series Mappers ===

/**
 * Bucket visits by week for Activity chart.
 *
 * @param visits - List of visits with started_at timestamps
 * @param rewards - List of rewards with issued_at timestamps
 * @param weeks - Number of weeks to include
 * @param periodStart - Start date (YYYY-MM-DD) from rpc_gaming_day_range
 * @param periodEnd - End date (YYYY-MM-DD) from rpc_gaming_day_range
 * @returns WeeklySeriesDTO with buckets
 */
export function mapToWeeklySeries(
  visits: Array<{ started_at: string }>,
  rewards: Array<{ issued_at: string }>,
  weeks: number,
  periodStart: string,
  periodEnd: string,
): WeeklySeriesDTO {
  // Initialize buckets for each week using DB-provided periodEnd as reference
  const bucketMap = new Map<string, WeeklyBucketDTO>();
  const refDate = new Date(`${periodEnd}T00:00:00`);
  for (let i = 0; i < weeks; i++) {
    const weekDate = new Date(refDate);
    weekDate.setDate(refDate.getDate() - i * 7);
    const weekStart = getWeekStart(weekDate);
    bucketMap.set(weekStart, {
      weekStart,
      visitCount: 0,
      rewardCount: 0,
    });
  }

  // Count visits per week
  for (const visit of visits) {
    const weekStart = getWeekStart(new Date(visit.started_at));
    const bucket = bucketMap.get(weekStart);
    if (bucket) {
      bucket.visitCount++;
    }
  }

  // Count rewards per week
  for (const reward of rewards) {
    const weekStart = getWeekStart(new Date(reward.issued_at));
    const bucket = bucketMap.get(weekStart);
    if (bucket) {
      bucket.rewardCount++;
    }
  }

  // Sort buckets by weekStart ascending
  const buckets = Array.from(bucketMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  return {
    buckets,
    periodStart,
    periodEnd,
  };
}

// === Reward History Mappers ===

/**
 * Map loyalty ledger entries to RewardHistoryItemDTO.
 *
 * @param ledgerEntry - Loyalty ledger entry from loyalty service
 * @returns RewardHistoryItemDTO
 */
export function mapToRewardHistoryItem(ledgerEntry: {
  id: string;
  created_at: string;
  entry_type: string;
  points: number;
  staff_id: string | null;
  staff_name: string | null;
  visit_id: string | null;
}): RewardHistoryItemDTO {
  // Map entry_type to reward type
  let rewardType: RewardHistoryItemDTO['rewardType'] = 'other';
  if (ledgerEntry.entry_type === 'redemption') {
    rewardType = 'comp';
  } else if (ledgerEntry.entry_type.includes('promo')) {
    rewardType = 'matchplay';
  } else if (ledgerEntry.entry_type.includes('free')) {
    rewardType = 'freeplay';
  }

  return {
    id: ledgerEntry.id,
    issuedAt: ledgerEntry.created_at,
    rewardType,
    amount: Math.abs(ledgerEntry.points),
    issuedBy: {
      id: ledgerEntry.staff_id ?? 'system',
      name: ledgerEntry.staff_name ?? 'System',
    },
    visitId: ledgerEntry.visit_id,
  };
}

// === Recent Events Mappers ===

/**
 * Map timeline events to RecentEventsDTO.
 *
 * @param events - Timeline events from player-timeline service
 * @returns RecentEventsDTO with last buy-in, reward, and note
 */
export function mapToRecentEvents(
  events: Array<{
    event_type: string;
    occurred_at: string;
    amount: number | null;
    metadata: Record<string, unknown>;
    summary: string;
  }>,
): RecentEventsDTO {
  let lastBuyIn: RecentEventsDTO['lastBuyIn'] = null;
  let lastReward: RecentEventsDTO['lastReward'] = null;
  let lastNote: RecentEventsDTO['lastNote'] = null;

  for (const event of events) {
    if (!lastBuyIn && event.event_type === 'cash_in') {
      lastBuyIn = {
        at: event.occurred_at,
        amount: event.amount ?? 0,
      };
    }
    if (
      !lastReward &&
      (event.event_type === 'points_redeemed' ||
        event.event_type === 'promo_issued')
    ) {
      lastReward = {
        at: event.occurred_at,
        type: event.event_type === 'promo_issued' ? 'promo' : 'comp',
      };
    }
    if (!lastNote && event.event_type === 'note_added') {
      lastNote = {
        at: event.occurred_at,
        preview: event.summary.slice(0, 50),
      };
    }

    // Stop early if we have all three
    if (lastBuyIn && lastReward && lastNote) break;
  }

  return { lastBuyIn, lastReward, lastNote };
}
