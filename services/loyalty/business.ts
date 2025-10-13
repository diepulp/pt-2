/**
 * Loyalty Business Logic Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "What is this gameplay worth in rewards?"
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

import { createLoyaltyCrudService } from "./crud";
import type { LoyaltyLedgerDTO, PlayerLoyaltyDTO } from "./crud";

// ──────────────────────────────────────────────────────────────────
// TIER DEFINITIONS
// ──────────────────────────────────────────────────────────────────

export const LOYALTY_TIERS = {
  BRONZE: {
    name: "BRONZE" as const,
    minPoints: 0,
    maxPoints: 999,
    multiplier: 1.0,
    benefits: ["Basic rewards", "Birthday bonus"],
  },
  SILVER: {
    name: "SILVER" as const,
    minPoints: 1000,
    maxPoints: 4999,
    multiplier: 1.25,
    benefits: ["Priority service", "10% bonus points", "Quarterly rewards"],
  },
  GOLD: {
    name: "GOLD" as const,
    minPoints: 5000,
    maxPoints: 19999,
    multiplier: 1.5,
    benefits: ["VIP lounge access", "20% bonus points", "Monthly rewards"],
  },
  PLATINUM: {
    name: "PLATINUM" as const,
    minPoints: 20000,
    maxPoints: Infinity,
    multiplier: 2.0,
    benefits: [
      "Personal host",
      "30% bonus points",
      "Exclusive events",
      "Complimentary upgrades",
    ],
  },
} as const;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;

// ──────────────────────────────────────────────────────────────────
// TYPES & DTOS
// ──────────────────────────────────────────────────────────────────

export interface GameSettings {
  house_edge: number;
  average_rounds_per_hour: number;
  point_multiplier: number | null;
  points_conversion_rate: number | null;
  seats_available: number | null;
  name?: string;
}

export interface PointsCalculationInput {
  averageBet: number;
  totalRounds: number;
  gameSettings: GameSettings;
  playerTier?: LoyaltyTier;
}

export interface AccruePointsInput {
  playerId: string;
  ratingSlipId?: string;
  visitId?: string | null;
  averageBet: number;
  durationSeconds: number;
  gameSettings: GameSettings;
}

export interface AccruePointsResult {
  pointsEarned: number;
  newBalance: number;
  tier: string;
  ledgerEntry: LoyaltyLedgerDTO;
}

// ──────────────────────────────────────────────────────────────────
// POINTS CALCULATION
// ──────────────────────────────────────────────────────────────────

/**
 * Calculate loyalty points from RatingSlip performance
 *
 * Formula:
 * 1. theoreticalWin = (averageBet × houseEdge%) × totalRounds
 * 2. basePoints = theoreticalWin × conversionRate × multiplier
 * 3. Apply bonuses:
 *    - Tier multiplier (BRONZE: 1.0, SILVER: 1.25, GOLD: 1.5, PLATINUM: 2.0)
 *    - Empty seats: +5% per empty seat (7-seat baseline)
 *    - High volume: +10% if rounds > expectedRoundsPerHour
 * 4. Round to integer
 *
 * @param input - RatingSlip performance + game settings
 * @returns Calculated points (integer)
 */
export function calculatePoints(input: PointsCalculationInput): number {
  const {
    averageBet,
    totalRounds,
    gameSettings,
    playerTier = "BRONZE",
  } = input;

  const {
    house_edge,
    average_rounds_per_hour,
    point_multiplier = 1.0,
    points_conversion_rate = 10.0,
    seats_available = 7,
  } = gameSettings;

  // Step 1: Calculate theoretical win (casino's expected profit)
  const theoreticalWin = ((averageBet * house_edge) / 100) * totalRounds;

  // Step 2: Base points from theoretical win
  let pointsEarned =
    theoreticalWin *
    (points_conversion_rate ?? 10.0) *
    (point_multiplier ?? 1.0);

  // Step 3: Apply tier multiplier
  const tierConfig = LOYALTY_TIERS[playerTier];
  pointsEarned *= tierConfig.multiplier;

  // Step 4: Empty seat bonus (encourage play at off-peak tables)
  const currentSeats = seats_available ?? 7;
  if (currentSeats < 7) {
    const emptySeats = 7 - currentSeats;
    const bonusFactor = 1 + emptySeats * 0.05; // 5% per empty seat
    pointsEarned *= bonusFactor;
  }

  // Step 5: High volume bonus (reward extended play)
  if (totalRounds > average_rounds_per_hour) {
    pointsEarned *= 1.1; // 10% bonus
  }

  // Step 6: Round to integer
  return Math.round(pointsEarned);
}

/**
 * Calculate rounds from duration and game pace
 *
 * @param durationSeconds - Time played in seconds
 * @param roundsPerHour - Expected rounds per hour for game type
 * @returns Estimated total rounds played
 */
function calculateRoundsFromDuration(
  durationSeconds: number,
  roundsPerHour: number,
): number {
  const durationHours = durationSeconds / 3600;
  return Math.round(durationHours * roundsPerHour);
}

// ──────────────────────────────────────────────────────────────────
// TIER MANAGEMENT
// ──────────────────────────────────────────────────────────────────

/**
 * Determine tier based on points earned (lifetime total)
 *
 * @param pointsEarnedTotal - Lifetime points earned
 * @returns Current tier name
 */
export function calculateTier(pointsEarnedTotal: number): LoyaltyTier {
  if (pointsEarnedTotal >= LOYALTY_TIERS.PLATINUM.minPoints) {
    return "PLATINUM";
  } else if (pointsEarnedTotal >= LOYALTY_TIERS.GOLD.minPoints) {
    return "GOLD";
  } else if (pointsEarnedTotal >= LOYALTY_TIERS.SILVER.minPoints) {
    return "SILVER";
  } else {
    return "BRONZE";
  }
}

/**
 * Calculate tier progress (0-100%)
 *
 * @param pointsEarnedTotal - Lifetime points earned
 * @returns Progress percentage to next tier
 */
export function calculateTierProgress(pointsEarnedTotal: number): number {
  const currentTier = calculateTier(pointsEarnedTotal);

  if (currentTier === "PLATINUM") {
    return 100; // Max tier reached
  }

  const tierConfig = LOYALTY_TIERS[currentTier];
  const nextTierConfig =
    currentTier === "BRONZE"
      ? LOYALTY_TIERS.SILVER
      : currentTier === "SILVER"
        ? LOYALTY_TIERS.GOLD
        : LOYALTY_TIERS.PLATINUM;

  const pointsInCurrentTier = pointsEarnedTotal - tierConfig.minPoints;
  const pointsNeededForNextTier =
    nextTierConfig.minPoints - tierConfig.minPoints;

  return Math.round((pointsInCurrentTier / pointsNeededForNextTier) * 100);
}

// ──────────────────────────────────────────────────────────────────
// BUSINESS SERVICE FACTORY
// ──────────────────────────────────────────────────────────────────

export function createLoyaltyBusinessService(
  supabase: SupabaseClient<Database>,
) {
  const crudService = createLoyaltyCrudService(supabase);

  return {
    /**
     * Accrue points from RatingSlip telemetry
     * This is the main entry point for point accrual
     *
     * @param input - RatingSlip performance data
     * @returns ServiceResult with accrual details
     */
    accruePointsFromSlip: async (
      input: AccruePointsInput,
    ): Promise<ServiceResult<AccruePointsResult>> => {
      return executeOperation<AccruePointsResult>(
        "loyalty_accrue_points",
        async () => {
          // 1. Get player's current loyalty record
          const loyaltyResult = await crudService.getPlayerLoyalty(
            input.playerId,
          );

          if (!loyaltyResult.success || !loyaltyResult.data) {
            throw {
              code: "LOYALTY_NOT_FOUND",
              message: `Loyalty record not found for player ${input.playerId}`,
            };
          }

          const currentLoyalty = loyaltyResult.data;
          const currentTier = currentLoyalty.tier as LoyaltyTier;

          // 2. Calculate total rounds from duration
          const totalRounds = calculateRoundsFromDuration(
            input.durationSeconds,
            input.gameSettings.average_rounds_per_hour,
          );

          // 3. Calculate points using policy engine
          const pointsEarned = calculatePoints({
            averageBet: input.averageBet,
            totalRounds,
            gameSettings: input.gameSettings,
            playerTier: currentTier,
          });

          // 4. Calculate new balance
          const newBalance =
            (currentLoyalty.current_balance || 0) + pointsEarned;

          // 5. Calculate new lifetime total
          const newLifetimeTotal =
            (currentLoyalty.lifetime_points || 0) + pointsEarned;

          // 6. Check for tier progression
          const newTier = calculateTier(newLifetimeTotal);
          const newTierProgress = calculateTierProgress(newLifetimeTotal);

          // 7. Create ledger entry (source of truth)
          const ledgerResult = await crudService.createLedgerEntry({
            player_id: input.playerId,
            points_change: pointsEarned,
            transaction_type: "GAMEPLAY",
            reason: input.ratingSlipId
              ? `Points earned from rating slip ${input.ratingSlipId}`
              : "Points earned from gameplay",
            source: "system",
            event_type: "RATING_SLIP_FINALIZED",
            session_id: input.ratingSlipId || null,
            rating_slip_id: input.ratingSlipId || null,
            visit_id: input.visitId || null,
          });

          if (!ledgerResult.success || !ledgerResult.data) {
            throw {
              code: "LEDGER_ENTRY_FAILED",
              message: "Failed to create loyalty ledger entry",
            };
          }

          // 8. Update player loyalty balance and tier
          const updateResult = await crudService.updatePlayerLoyalty(
            input.playerId,
            {
              current_balance: newBalance,
              lifetime_points: newLifetimeTotal,
              tier: newTier,
              tier_progress: newTierProgress,
            },
          );

          if (!updateResult.success) {
            throw {
              code: "LOYALTY_UPDATE_FAILED",
              message: "Failed to update player loyalty record",
            };
          }

          return {
            pointsEarned,
            newBalance,
            tier: newTier,
            ledgerEntry: ledgerResult.data,
          };
        },
      );
    },

    /**
     * Recalculate and update player tier
     * (Typically triggered by points accrual or manual review)
     *
     * @param playerId - Player UUID
     * @returns ServiceResult with updated tier
     */
    updateTier: async (
      playerId: string,
    ): Promise<ServiceResult<PlayerLoyaltyDTO>> => {
      return executeOperation<PlayerLoyaltyDTO>(
        "loyalty_update_tier",
        async () => {
          // 1. Get current loyalty record
          const loyaltyResult = await crudService.getPlayerLoyalty(playerId);

          if (!loyaltyResult.success || !loyaltyResult.data) {
            throw {
              code: "LOYALTY_NOT_FOUND",
              message: `Loyalty record not found for player ${playerId}`,
            };
          }

          const currentLoyalty = loyaltyResult.data;
          const lifetimePoints = currentLoyalty.lifetime_points || 0;

          // 2. Calculate new tier and progress
          const newTier = calculateTier(lifetimePoints);
          const newTierProgress = calculateTierProgress(lifetimePoints);

          // 3. Update if changed
          if (
            newTier !== currentLoyalty.tier ||
            newTierProgress !== currentLoyalty.tier_progress
          ) {
            const updateResult = await crudService.updatePlayerLoyalty(
              playerId,
              {
                tier: newTier,
                tier_progress: newTierProgress,
              },
            );

            if (!updateResult.success || !updateResult.data) {
              throw {
                code: "TIER_UPDATE_FAILED",
                message: "Failed to update player tier",
              };
            }

            return updateResult.data;
          }

          return currentLoyalty;
        },
      );
    },
  };
}
