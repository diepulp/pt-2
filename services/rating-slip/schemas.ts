/**
 * RatingSlipService Zod Schemas
 *
 * Validation schemas for rating slip API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-002 Rating Slip Service
 * @see ADR-013 Zod Validation Schemas
 */

import { z } from "zod";

// === Rating Slip Status Schema ===

/**
 * Schema for rating_slip_status enum values.
 * Matches Database["public"]["Enums"]["rating_slip_status"].
 */
export const ratingSlipStatusSchema = z.enum([
  "open",
  "paused",
  "closed",
  "archived",
]);

export type RatingSlipStatusInput = z.infer<typeof ratingSlipStatusSchema>;

// === Rating Slip Create/Update Schemas ===

/**
 * Schema for starting a rating slip.
 * Creates slip tied to visit + table.
 *
 * Note: player_id is NOT accepted. Player comes from visit.player_id.
 */
export const createRatingSlipSchema = z.object({
  /** Required: visit ID (provides player identity) */
  visit_id: z.string().uuid("Invalid visit ID format"),
  /** Required: gaming table ID */
  table_id: z.string().uuid("Invalid table ID format"),
  /** Optional: seat position at table */
  seat_number: z
    .string()
    .max(20, "Seat number must be 20 characters or fewer")
    .optional(),
  /** Optional: game-specific settings for theoretical calculation (JSON) */
  game_settings: z.any().optional(),
});

export type CreateRatingSlipInput = z.infer<typeof createRatingSlipSchema>;

/**
 * Schema for closing a rating slip.
 * Only average_bet can be set at close time.
 */
export const closeRatingSlipSchema = z.object({
  /** Optional: final average bet amount (must be positive) */
  average_bet: z.number().positive("Average bet must be positive").optional(),
});

export type CloseRatingSlipInput = z.infer<typeof closeRatingSlipSchema>;

/**
 * Schema for updating average bet on open slip.
 */
export const updateAverageBetSchema = z.object({
  /** Average bet amount (must be positive) */
  average_bet: z.number().positive("Average bet must be positive"),
});

export type UpdateAverageBetInput = z.infer<typeof updateAverageBetSchema>;

// === Rating Slip Query Schemas ===

/**
 * Schema for rating slip list query params.
 */
export const ratingSlipListQuerySchema = z.object({
  /** Filter by gaming table */
  table_id: z.string().uuid().optional(),
  /** Filter by visit */
  visit_id: z.string().uuid().optional(),
  /** Filter by slip status */
  status: ratingSlipStatusSchema.optional(),
  /** Results per page (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Cursor for pagination (slip ID) */
  cursor: z.string().uuid().optional(),
});

export type RatingSlipListQuery = z.infer<typeof ratingSlipListQuerySchema>;

/**
 * Schema for active slips query (open/paused only).
 */
export const activeSlipsQuerySchema = z.object({
  /** Required: gaming table ID */
  table_id: z.string().uuid("Invalid table ID format"),
});

export type ActiveSlipsQuery = z.infer<typeof activeSlipsQuerySchema>;

// === Route Param Schemas ===

/**
 * Schema for rating slip detail route params.
 */
export const ratingSlipRouteParamsSchema = z.object({
  id: z.string().uuid("Invalid rating slip ID format"),
});

export type RatingSlipRouteParams = z.infer<typeof ratingSlipRouteParamsSchema>;

// === Re-exports for route handler convenience ===

export { z };
