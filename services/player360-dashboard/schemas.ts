/**
 * Player360DashboardService Zod Schemas
 *
 * Validation schemas for API requests and route params.
 * Used by route handlers for input validation.
 *
 * @see PRD-023 Player 360 Panels v0
 */

import { z } from "zod";

import { uuidSchema } from "@/lib/validation";

// === Reason Code Schema ===

export const reasonCodeSchema = z.enum([
  "AVAILABLE",
  "COOLDOWN_ACTIVE",
  "MIN_PLAY_NOT_MET",
  "DAILY_LIMIT_REACHED",
  "RULES_NOT_CONFIGURED",
]);

// === Summary Query Schema ===

/**
 * Schema for summary query parameters.
 * Validates player ID and optional gaming day override.
 */
export const summaryQuerySchema = z.object({
  /** Player ID (UUID) */
  playerId: uuidSchema("player ID"),
  /** Optional gaming day override (ISO date) */
  gamingDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Gaming day must be YYYY-MM-DD format")
    .optional(),
});

// === Activity Query Schema ===

/**
 * Schema for activity query parameters.
 * Validates player ID and optional weeks count.
 */
export const activityQuerySchema = z.object({
  /** Player ID (UUID) */
  playerId: uuidSchema("player ID"),
  /** Number of weeks to fetch (default 12, max 52) */
  weeks: z.coerce.number().int().min(1).max(52).default(12),
});

// === Reward History Query Schema ===

/**
 * Schema for reward history query parameters.
 * Validates player ID and optional limit.
 */
export const rewardHistoryQuerySchema = z.object({
  /** Player ID (UUID) */
  playerId: uuidSchema("player ID"),
  /** Max items to return (default 5, max 20) */
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// === Route Param Schemas ===

/**
 * Schema for player360 route params.
 * Used by API routes to validate path parameters.
 */
export const player360RouteParamsSchema = z.object({
  playerId: uuidSchema("player ID"),
});

// === Type Exports ===

export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;
export type RewardHistoryQueryInput = z.infer<typeof rewardHistoryQuerySchema>;
export type Player360RouteParams = z.infer<typeof player360RouteParamsSchema>;
