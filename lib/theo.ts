/**
 * Theoretical Win (Theo) Calculation Utilities
 *
 * This module provides pure functions for calculating theoretical win and
 * converting theo to loyalty points. These functions are separated to maintain
 * clear boundaries between financial truth (theo) and loyalty policy (points).
 *
 * @see PRD-001 Section 3.5 (Loyalty) and Open Questions Q2 decision
 * @see docs/10-prd/OPEN_QUESTIONS.md for rationale
 */

import type { Database } from "@/types/database.types";

/**
 * Minimal game settings required for theo calculation.
 * This can be the full game_settings row or a JSONB snapshot from rating_slip.
 */
export type TheoGameSettings = {
  house_edge: number; // Percentage (e.g., 1.5 = 1.5%)
  decisions_per_hour: number; // Average decisions per hour (e.g., 70)
};

/**
 * Extended game settings for points calculation (includes loyalty fields).
 */
export type PointsGameSettings = TheoGameSettings & {
  seats_available: number;
  points_conversion_rate: number | null;
  point_multiplier: number | null;
};

/**
 * Full game settings row type from database.
 */
export type GameSettingsRow =
  Database["public"]["Tables"]["game_settings"]["Row"];

/**
 * Options for points calculation.
 */
export type CalculatePointsOptions = {
  /** Current number of occupied seats (affects bonus) */
  currentSeats?: number;
  /** Override the point multiplier (e.g., for promotions) */
  pointMultiplierOverride?: number;
};

/**
 * Calculate theoretical win (theo) for a gaming session.
 *
 * Formula: theo = (average_bet × house_edge / 100) × total_decisions
 *
 * Where total_decisions can be:
 * - Directly provided (if tracking rounds played)
 * - Derived from duration: decisions_per_hour × (duration_minutes / 60)
 *
 * @param gameSettings - Game configuration with house_edge
 * @param averageBet - Average wager amount
 * @param totalDecisions - Total number of betting decisions
 * @returns Theoretical win amount (positive = house advantage)
 *
 * @example
 * // Blackjack: $100 avg bet, 1.5% edge, 70 decisions
 * const theo = calculateTheo({ house_edge: 1.5 }, 100, 70);
 * // Result: 105 (theoretical win for the house)
 */
export function calculateTheo(
  gameSettings: Pick<TheoGameSettings, "house_edge">,
  averageBet: number,
  totalDecisions: number,
): number {
  const { house_edge } = gameSettings;

  if (averageBet <= 0 || totalDecisions <= 0) {
    return 0;
  }

  const theoreticalWin = ((averageBet * house_edge) / 100) * totalDecisions;
  return theoreticalWin;
}

/**
 * Calculate theoretical win from duration (minutes) instead of total decisions.
 *
 * This is a convenience wrapper that derives total decisions from play time.
 *
 * @param gameSettings - Game configuration with house_edge and decisions_per_hour
 * @param averageBet - Average wager amount
 * @param durationMinutes - Total play time in minutes
 * @returns Theoretical win amount
 *
 * @example
 * // 2 hours of blackjack at $100 avg bet
 * const theo = calculateTheoFromDuration(
 *   { house_edge: 1.5, decisions_per_hour: 70 },
 *   100,
 *   120
 * );
 * // Result: 210 (70 decisions/hr × 2 hrs × $100 × 1.5%)
 */
export function calculateTheoFromDuration(
  gameSettings: TheoGameSettings,
  averageBet: number,
  durationMinutes: number,
): number {
  const { decisions_per_hour } = gameSettings;

  if (durationMinutes <= 0) {
    return 0;
  }

  const totalDecisions = decisions_per_hour * (durationMinutes / 60);
  return calculateTheo(gameSettings, averageBet, totalDecisions);
}

/**
 * Calculate theo per hour rate for UI display.
 *
 * @param theo - Total theoretical win
 * @param durationMinutes - Play duration in minutes
 * @returns Theo per hour (or 0 if duration is 0)
 */
export function calculateTheoPerHour(
  theo: number,
  durationMinutes: number,
): number {
  if (durationMinutes <= 0) {
    return 0;
  }
  return theo / (durationMinutes / 60);
}

/**
 * Convert theoretical win to loyalty points.
 *
 * This function applies the loyalty policy layer on top of the pure theo value.
 * It includes:
 * - Base conversion rate (theo → points)
 * - Point multiplier (promotions)
 * - Seat bonus (reward for playing at less crowded tables)
 *
 * @param theo - Theoretical win amount (from calculateTheo)
 * @param gameSettings - Game settings with loyalty configuration
 * @param options - Optional overrides for seats/multiplier
 * @returns Loyalty points earned (rounded to nearest integer)
 *
 * @example
 * const theo = calculateTheo({ house_edge: 1.5 }, 100, 70); // 105
 * const points = calculatePointsFromTheo(theo, {
 *   house_edge: 1.5,
 *   decisions_per_hour: 70,
 *   seats_available: 7,
 *   points_conversion_rate: 10,
 *   point_multiplier: 1.0
 * });
 * // Result: 1050 points (105 theo × 10 conversion rate)
 */
export function calculatePointsFromTheo(
  theo: number,
  gameSettings: PointsGameSettings,
  options?: CalculatePointsOptions,
): number {
  const {
    seats_available = 7,
    points_conversion_rate,
    point_multiplier,
  } = gameSettings;

  if (theo <= 0) {
    return 0;
  }

  // Base points calculation
  const conversionRate = points_conversion_rate ?? 10.0;
  const multiplier =
    options?.pointMultiplierOverride ?? point_multiplier ?? 1.0;

  let pointsEarned = theo * conversionRate * multiplier;

  // Seat bonus: reward players at less crowded tables
  // Each empty seat adds 5% bonus
  const currentSeats = options?.currentSeats ?? seats_available;
  if (currentSeats < 7 && currentSeats > 0) {
    const emptySeats = 7 - currentSeats;
    const bonusFactor = 1 + emptySeats * 0.05;
    pointsEarned *= bonusFactor;
  }

  return Math.round(pointsEarned);
}

/**
 * Combined calculation: duration → theo → points.
 *
 * Convenience function for the common use case of calculating points
 * from a rating slip close event.
 *
 * @param gameSettings - Full game settings
 * @param averageBet - Average wager amount
 * @param durationMinutes - Play duration in minutes
 * @param options - Optional overrides
 * @returns Object with theo and points
 */
export function calculateSessionRewards(
  gameSettings: PointsGameSettings,
  averageBet: number,
  durationMinutes: number,
  options?: CalculatePointsOptions,
): { theo: number; theoPerHour: number; points: number } {
  const theo = calculateTheoFromDuration(
    gameSettings,
    averageBet,
    durationMinutes,
  );
  const theoPerHour = calculateTheoPerHour(theo, durationMinutes);
  const points = calculatePointsFromTheo(theo, gameSettings, options);

  return { theo, theoPerHour, points };
}
