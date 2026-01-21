/**
 * PlayerService Zod Schemas
 *
 * Validation schemas for player API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-003 Player & Visit Management
 */

import { z } from "zod";

import { uuidSchema } from "@/lib/validation";

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
    middle_name: z.string().max(100).nullable().optional(),
    email: z.string().email("Invalid email format").nullable().optional(),
    phone_number: z.string().max(20).nullable().optional(),
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
  playerId: uuidSchema("player ID"),
});

/** Schema for enrollment request body (empty - casino comes from RLS) */
export const enrollPlayerSchema = z.object({}).strict();

// === Route Param Schemas ===

/** Schema for player detail route params */
export const playerRouteParamsSchema = z.object({
  playerId: uuidSchema("player ID"),
});

// === Player Identity Schemas (ADR-022) ===

/** Schema for identity address structure */
export const identityAddressSchema = z
  .object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
  })
  .optional();

/** Schema for creating/updating player identity */
export const playerIdentitySchema = z.object({
  documentNumber: z.string().min(1, "Document number is required").optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date must be YYYY-MM-DD format")
    .optional(),
  gender: z.enum(["m", "f", "x"]).optional(),
  eyeColor: z.string().max(50).optional(),
  height: z
    .string()
    .regex(/^\d{1,2}-\d{2}$/, 'Height must be in format "6-01"')
    .optional(),
  weight: z.string().max(10).optional(),
  address: identityAddressSchema,
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date must be YYYY-MM-DD format")
    .optional(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiration date must be YYYY-MM-DD format")
    .optional(),
  issuingState: z.string().max(50).optional(),
  documentType: z.enum(["drivers_license", "passport", "state_id"]).optional(),
});

// === Type Exports ===

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type PlayerListQuery = z.infer<typeof playerListQuerySchema>;
export type PlayerIdentityInput = z.infer<typeof playerIdentitySchema>;
