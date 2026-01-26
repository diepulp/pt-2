/**
 * Player360DashboardService CRUD Operations
 *
 * Read-only aggregation layer that combines data from:
 * - VisitContext: Active visits, session duration
 * - PlayerFinancialContext: Transaction summaries
 * - LoyaltyContext: Rewards eligibility, history
 * - PlayerTimelineContext: Recent events
 *
 * NO direct table access - all data via existing services and RPCs.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see EXECUTION-SPEC-PRD-023.md WS1
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  PlayerSummaryDTO,
  RecentEventsDTO,
  RewardHistoryItemDTO,
  WeeklySeriesDTO,
} from "./dtos";
import {
  composePlayerSummary,
  getCurrentGamingDay,
  getWeeksAgoDate,
  mapToCashVelocity,
  mapToEngagement,
  mapToRecentEvents,
  mapToRewardHistoryItem,
  mapToRewardsEligibility,
  mapToSessionValue,
  mapToWeeklySeries,
  parseLoyaltyData,
  toMetadataRecord,
} from "./mappers";

// === Error Mapping ===

/**
 * Maps database/RPC errors to domain errors.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  // Handle RPC-raised exceptions
  if (error.message?.includes("Casino context")) {
    return new DomainError(
      "UNAUTHORIZED",
      "Casino context not established. Ensure you are authenticated.",
    );
  }

  // PGRST116 = No rows returned
  if (error.code === "PGRST116") {
    return new DomainError("NOT_FOUND", "Player not found");
  }

  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === Summary Operations ===

/**
 * Get player summary for Snapshot Band tiles.
 *
 * Aggregates data from visits, financial transactions, loyalty, and timeline
 * to provide a complete summary for the Player 360 dashboard.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param gamingDay - Optional gaming day override (defaults to current)
 * @returns PlayerSummaryDTO with all metrics
 */
export async function getPlayerSummary(
  supabase: SupabaseClient<Database>,
  playerId: string,
  gamingDay?: string,
): Promise<PlayerSummaryDTO> {
  const currentGamingDay = gamingDay ?? getCurrentGamingDay();

  try {
    // Fetch data in parallel for efficiency
    const [activeVisitResult, financialSummaryResult, loyaltyResult] =
      await Promise.all([
        // 1. Get active visit for the player
        supabase
          .from("visit")
          .select("id, player_id, casino_id, started_at, ended_at, visit_kind")
          .eq("player_id", playerId)
          .is("ended_at", null)
          .maybeSingle(),

        // 2. Get financial summary for current gaming day
        // This aggregates total_in, total_out for the player
        supabase
          .from("player_financial_transaction")
          .select("amount, direction, created_at")
          .eq("player_id", playerId)
          .eq("gaming_day", currentGamingDay),

        // 3. Get loyalty balance
        supabase
          .from("player_loyalty")
          .select("*")
          .eq("player_id", playerId)
          .maybeSingle(),
      ]);

    // Handle errors
    if (
      activeVisitResult.error &&
      activeVisitResult.error.code !== "PGRST116"
    ) {
      throw mapDatabaseError(activeVisitResult.error);
    }
    if (financialSummaryResult.error) {
      throw mapDatabaseError(financialSummaryResult.error);
    }
    if (loyaltyResult.error && loyaltyResult.error.code !== "PGRST116") {
      throw mapDatabaseError(loyaltyResult.error);
    }

    const activeVisit = activeVisitResult.data;
    const transactions = financialSummaryResult.data ?? [];
    const loyaltyData = loyaltyResult.data;

    // Calculate financial summary from transactions
    const totalIn = transactions
      .filter((t) => t.direction === "in")
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const totalOut = transactions
      .filter((t) => t.direction === "out")
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const lastTxn = transactions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const financialSummary =
      transactions.length > 0
        ? {
            visit_id: activeVisit?.id ?? "",
            casino_id: activeVisit?.casino_id ?? "",
            total_in: totalIn,
            total_out: totalOut,
            net_amount: totalIn - totalOut,
            transaction_count: transactions.length,
            first_transaction_at:
              transactions[transactions.length - 1]?.created_at ?? null,
            last_transaction_at: lastTxn?.created_at ?? null,
          }
        : null;

    // Map to DTOs
    const sessionValue = mapToSessionValue(financialSummary, null);
    const cashVelocity = mapToCashVelocity(
      financialSummary,
      activeVisit?.started_at ?? null,
    );
    const engagement = mapToEngagement(
      activeVisit
        ? {
            id: activeVisit.id,
            player_id: activeVisit.player_id ?? "",
            casino_id: activeVisit.casino_id,
            started_at: activeVisit.started_at,
            ended_at: activeVisit.ended_at,
            visit_kind:
              (activeVisit.visit_kind as
                | "reward_identified"
                | "gaming_identified_rated"
                | "gaming_ghost_unrated") ?? "gaming_identified_rated",
            visit_group_id: activeVisit.id,
            gaming_day: currentGamingDay,
          }
        : null,
      lastTxn?.created_at ?? null,
    );

    // Parse loyalty balance safely using type-safe mapper
    const loyaltyBalance = parseLoyaltyData(loyaltyData);

    const rewardsEligibility = mapToRewardsEligibility(
      loyaltyBalance,
      null, // TODO: fetch most recent reward timestamp
    );

    return composePlayerSummary(
      playerId,
      sessionValue,
      cashVelocity,
      engagement,
      rewardsEligibility,
      currentGamingDay,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Activity Series Operations ===

/**
 * Get weekly activity series for Activity chart.
 *
 * Aggregates visits and rewards by week for the specified period.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param weeks - Number of weeks to include (default 12)
 * @returns WeeklySeriesDTO with visit and reward counts per week
 */
export async function getWeeklySeries(
  supabase: SupabaseClient<Database>,
  playerId: string,
  weeks = 12,
): Promise<WeeklySeriesDTO> {
  const periodStart = getWeeksAgoDate(weeks);

  try {
    // Fetch visits and loyalty entries in parallel
    const [visitsResult, rewardsResult] = await Promise.all([
      // Get visits within the period
      supabase
        .from("visit")
        .select("id, started_at")
        .eq("player_id", playerId)
        .gte("started_at", `${periodStart}T00:00:00Z`),

      // Get reward entries (redemptions) within the period
      // Using 'reason' column which contains the loyalty reason enum
      supabase
        .from("loyalty_ledger")
        .select("id, created_at, reason")
        .eq("player_id", playerId)
        .eq("reason", "redeem")
        .gte("created_at", `${periodStart}T00:00:00Z`),
    ]);

    if (visitsResult.error) {
      throw mapDatabaseError(visitsResult.error);
    }
    if (rewardsResult.error) {
      throw mapDatabaseError(rewardsResult.error);
    }

    const visits = (visitsResult.data ?? []).map((v) => ({
      started_at: v.started_at,
    }));
    const rewards = (rewardsResult.data ?? []).map((r) => ({
      issued_at: r.created_at,
    }));

    return mapToWeeklySeries(visits, rewards, weeks);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Reward History Operations ===

/**
 * Get recent reward history for player.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param limit - Max items to return (default 5)
 * @returns Array of RewardHistoryItemDTO
 */
export async function getRewardHistory(
  supabase: SupabaseClient<Database>,
  playerId: string,
  limit = 5,
): Promise<RewardHistoryItemDTO[]> {
  try {
    // Get recent redemptions from loyalty ledger
    // Using 'reason' and 'points_delta' which are the actual column names
    const { data, error } = await supabase
      .from("loyalty_ledger")
      .select(
        `
        id,
        created_at,
        reason,
        points_delta,
        staff_id,
        visit_id
      `,
      )
      .eq("player_id", playerId)
      .eq("reason", "redeem")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw mapDatabaseError(error);
    }

    // Map to DTOs
    return (data ?? []).map((entry) =>
      mapToRewardHistoryItem({
        id: entry.id,
        created_at: entry.created_at,
        entry_type: entry.reason, // Map reason to entry_type for the mapper
        points: entry.points_delta, // Map points_delta to points for the mapper
        staff_id: entry.staff_id,
        staff_name: null, // TODO: Join with staff table if needed
        visit_id: entry.visit_id,
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Recent Events Operations ===

/**
 * Get recent events for timeline strip.
 *
 * Returns the most recent buy-in, reward, and note for quick context.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @returns RecentEventsDTO with last buy-in, reward, and note
 */
export async function getRecentEvents(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<RecentEventsDTO> {
  try {
    // Use the player timeline RPC to get recent events
    const { data, error } = await supabase.rpc("rpc_get_player_timeline", {
      p_player_id: playerId,
      p_event_types: [
        "cash_in",
        "points_redeemed",
        "promo_issued",
        "note_added",
      ],
      p_limit: 10, // Fetch enough to find all three event types
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    // Map RPC result to recent events
    // RPC returns typed rows with specific fields
    const events = (data ?? []).map((row) => ({
      event_type: row.event_type,
      occurred_at: row.occurred_at,
      amount: row.amount ?? null,
      metadata: toMetadataRecord(row.metadata),
      summary: row.summary ?? "",
    }));

    return mapToRecentEvents(events);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}
