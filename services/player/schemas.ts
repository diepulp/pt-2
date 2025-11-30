/**
 * PlayerService Zod Schemas
 *
 * Validation schemas for player API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-003 Player & Visit Management
 */

import { z } from "zod";

// === Player CRUD Schemas ===

/** Schema for creating a new player */
export const createPlayerSchema = z.object({
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long"),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date must be YYYY-MM-DD format")
    .optional(),
});

/** Schema for updating a player */
export const updatePlayerSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date must be YYYY-MM-DD format")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    "At least one field must be provided for update",
  );

// === Player Search/List Schemas ===

/** Schema for player list query params */
export const playerListQuerySchema = z.object({
  /** Search query - minimum 2 characters for search */
  q: z.string().min(2, "Search query must be at least 2 characters").optional(),
  /** Filter by enrollment status */
  status: z.enum(["active", "inactive"]).optional(),
  /** Pagination cursor (ISO timestamp) */
  cursor: z.string().optional(),
  /** Results per page (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// === Player Enrollment Schemas ===

/** Schema for enrollment route params */
export const playerIdParamSchema = z.object({
  playerId: z.string().uuid("Invalid player ID format"),
});

/** Schema for enrollment request body (empty - casino comes from RLS) */
export const enrollPlayerSchema = z.object({}).strict();

// === Route Param Schemas ===

/** Schema for player detail route params */
export const playerRouteParamsSchema = z.object({
  playerId: z.string().uuid("Invalid player ID format"),
});

// === Type Exports ===

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type PlayerListQuery = z.infer<typeof playerListQuerySchema>;
