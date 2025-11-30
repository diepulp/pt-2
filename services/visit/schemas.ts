/**
 * VisitService Zod Schemas
 *
 * Validation schemas for visit API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-003 Player & Visit Management
 */

import { z } from "zod";

// === Visit CRUD Schemas ===

/** Schema for starting a visit (check-in) */
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

// === Visit List/Query Schemas ===

/** Schema for visit list query params */
export const visitListQuerySchema = z.object({
  /** Filter by player ID */
  player_id: z.string().uuid().optional(),
  /** Filter by visit status */
  status: z.enum(["active", "closed"]).optional(),
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
