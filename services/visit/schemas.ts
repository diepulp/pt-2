/**
 * VisitService Zod Schemas
 *
 * Validation schemas for visit API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-003 Player & Visit Management
 * @see EXEC-VSE-001 Visit Service Evolution
 */

import { z } from "zod";

// === Visit Kind Schema ===

/**
 * Schema for visit_kind enum values.
 * Matches Database["public"]["Enums"]["visit_kind"].
 */
export const visitKindSchema = z.enum([
  "reward_identified",
  "gaming_identified_rated",
  "gaming_ghost_unrated",
]);

export type VisitKindInput = z.infer<typeof visitKindSchema>;

// === Visit CRUD Schemas ===

/** Schema for starting a visit (check-in) - backward compatible default */
export const startVisitSchema = z.object({
  player_id: z.string().uuid("Invalid player ID format"),
});

/** Schema for closing a visit (check-out) */
export const closeVisitSchema = z.object({
  /** Optional explicit end time (defaults to server time) */
  ended_at: z
    .string()
    .datetime({ message: "ended_at must be a valid ISO timestamp" })
    .optional(),
});

// === Typed Visit Creation Schemas (EXEC-VSE-001 WS-2) ===

/**
 * Schema for creating a reward-only visit.
 * Creates visit with visit_kind = 'reward_identified'.
 *
 * Use case: Comps, vouchers, customer care without gaming session.
 */
export const createRewardVisitSchema = z.object({
  /** Required: identified player UUID */
  player_id: z.string().uuid("Invalid player ID format"),
});

export type CreateRewardVisitInput = z.infer<typeof createRewardVisitSchema>;

/**
 * Schema for creating an identified gaming visit.
 * Creates visit with visit_kind = 'gaming_identified_rated'.
 *
 * Use case: Standard rated play with loyalty accrual.
 * This is functionally equivalent to startVisitSchema but explicit about intent.
 */
export const createGamingVisitSchema = z.object({
  /** Required: identified player UUID */
  player_id: z.string().uuid("Invalid player ID format"),
});

export type CreateGamingVisitInput = z.infer<typeof createGamingVisitSchema>;

/**
 * Schema for creating a ghost gaming visit.
 * Creates visit with visit_kind = 'gaming_ghost_unrated'.
 * No player_id required (will be NULL in database).
 *
 * Use case: Tracking gaming activity for compliance (CTR/MTL)
 * when player declines or cannot provide identification.
 *
 * @see ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling
 */
export const createGhostGamingVisitSchema = z.object({
  /** Required: the gaming table where ghost play occurs */
  table_id: z.string().uuid("Invalid table ID format"),
  /** Optional: notes about the ghost gaming session */
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or fewer")
    .optional(),
});

export type CreateGhostGamingVisitInput = z.infer<
  typeof createGhostGamingVisitSchema
>;

/**
 * Schema for converting a reward visit to a gaming visit.
 * Transitions visit_kind from 'reward_identified' to 'gaming_identified_rated'.
 *
 * Use case: Player came in for rewards, decided to play.
 */
export const convertRewardToGamingSchema = z.object({
  /** Required: the visit ID to convert */
  visit_id: z.string().uuid("Invalid visit ID format"),
});

export type ConvertRewardToGamingInput = z.infer<
  typeof convertRewardToGamingSchema
>;

// === Visit List/Query Schemas ===

/** Schema for visit list query params */
export const visitListQuerySchema = z.object({
  /** Filter by player ID */
  player_id: z.string().uuid().optional(),
  /** Filter by visit status */
  status: z.enum(["active", "closed"]).optional(),
  /** Filter by visit kind */
  visit_kind: visitKindSchema.optional(),
  /** Filter by date range start (ISO date) */
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD")
    .optional(),
  /** Filter by date range end (ISO date) */
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to_date must be YYYY-MM-DD")
    .optional(),
  /** Pagination cursor (ISO timestamp) */
  cursor: z.string().optional(),
  /** Results per page (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Schema for active visit query params */
export const activeVisitQuerySchema = z.object({
  /** Required: player ID to check for active visit */
  player_id: z.string().uuid("Invalid player ID format"),
});

// === Route Param Schemas ===

/** Schema for visit detail route params */
export const visitRouteParamsSchema = z.object({
  visitId: z.string().uuid("Invalid visit ID format"),
});

// === Type Exports ===

export type StartVisitInput = z.infer<typeof startVisitSchema>;
export type CloseVisitInput = z.infer<typeof closeVisitSchema>;
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;
export type ActiveVisitQuery = z.infer<typeof activeVisitQuerySchema>;
