/**
 * MTLService Zod Validation Schemas
 *
 * Request body and query parameter validation for API routes.
 * Used by Route Handlers / Server Actions for runtime validation.
 *
 * @see PRD-005 MTL Service
 * @see ADR-013 Zod Validation Schemas
 */

import { z } from "zod";

// === UUID Format Schema ===

/**
 * Permissive UUID format validation.
 *
 * Zod's built-in .uuid() validates RFC 4122 (version/variant bits),
 * which rejects valid database UUIDs that don't follow RFC strictly.
 * This regex validates the 8-4-4-4-12 format without version checks.
 *
 * @see services/player-financial/schemas.ts for canonical pattern
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidFormat = (fieldName = "ID") =>
  z.string().regex(UUID_REGEX, `Invalid ${fieldName} format`);

// ============================================================================
// Enum Schemas
// ============================================================================

export const mtlTxnTypeSchema = z.enum([
  "buy_in",
  "cash_out",
  "marker",
  "front_money",
  "chip_fill",
]);

export const mtlSourceSchema = z.enum(["table", "cage", "kiosk", "other"]);

export const mtlDirectionSchema = z.enum(["in", "out"]);

export const entryBadgeSchema = z.enum([
  "none",
  "watchlist_near",
  "ctr_near",
  "ctr_met",
]);

export const aggBadgeSchema = z.enum([
  "none",
  "agg_watchlist",
  "agg_ctr_near",
  "agg_ctr_met",
]);

// ============================================================================
// Create Schemas
// ============================================================================

/**
 * Schema for creating MTL entry
 */
export const createMtlEntrySchema = z
  .object({
    patron_uuid: uuidFormat("patron UUID"),
    casino_id: uuidFormat("casino UUID"),
    staff_id: uuidFormat("staff UUID").optional(),
    rating_slip_id: uuidFormat("rating slip UUID").optional(),
    visit_id: uuidFormat("visit UUID").optional(),
    amount: z
      .number()
      .positive("Amount must be positive")
      .finite("Amount must be finite"),
    direction: mtlDirectionSchema,
    txn_type: mtlTxnTypeSchema,
    source: mtlSourceSchema.default("table"),
    area: z.string().max(255).optional(),
    occurred_at: z.string().datetime().optional(),
    idempotency_key: z
      .string()
      .min(1, "Idempotency key is required")
      .max(255, "Idempotency key too long"),
  })
  .refine(
    (data) => {
      // Enforce direction/txn_type alignment per CHECK constraint
      if (data.txn_type === "buy_in" && data.direction !== "in") {
        return false;
      }
      if (data.txn_type === "cash_out" && data.direction !== "out") {
        return false;
      }
      return true;
    },
    {
      message:
        "Direction must match transaction type: buy_in requires 'in', cash_out requires 'out'",
      path: ["direction"],
    },
  );

export type CreateMtlEntryInput = z.infer<typeof createMtlEntrySchema>;

/**
 * Schema for creating MTL audit note
 */
export const createMtlAuditNoteSchema = z.object({
  mtl_entry_id: uuidFormat("entry UUID"),
  staff_id: uuidFormat("staff UUID"),
  note: z
    .string()
    .min(1, "Note is required")
    .max(2000, "Note too long (max 2000 characters)"),
});

export type CreateMtlAuditNoteInput = z.infer<typeof createMtlAuditNoteSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Schema for MTL entry list query parameters
 */
export const mtlEntryListQuerySchema = z.object({
  casino_id: uuidFormat("casino UUID"),
  patron_uuid: uuidFormat("patron UUID").optional(),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
    .optional(),
  min_amount: z.coerce.number().positive().optional(),
  txn_type: mtlTxnTypeSchema.optional(),
  source: mtlSourceSchema.optional(),
  entry_badge: entryBadgeSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type MtlEntryListQuery = z.infer<typeof mtlEntryListQuerySchema>;

/**
 * Schema for Gaming Day Summary query parameters
 */
export const mtlGamingDaySummaryQuerySchema = z.object({
  casino_id: uuidFormat("casino UUID"),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  patron_uuid: uuidFormat("patron UUID").optional(),
  agg_badge_in: aggBadgeSchema.optional(),
  agg_badge_out: aggBadgeSchema.optional(),
  min_total_in: z.coerce.number().nonnegative().optional(),
  min_total_out: z.coerce.number().nonnegative().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type MtlGamingDaySummaryQuery = z.infer<
  typeof mtlGamingDaySummaryQuerySchema
>;

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Schema for entry detail route parameters
 */
export const mtlEntryRouteParamsSchema = z.object({
  entryId: uuidFormat("entry ID"),
});

export type MtlEntryRouteParams = z.infer<typeof mtlEntryRouteParamsSchema>;

/**
 * Schema for audit note route parameters
 */
export const mtlAuditNoteRouteParamsSchema = z.object({
  entryId: uuidFormat("entry ID"),
});

export type MtlAuditNoteRouteParams = z.infer<
  typeof mtlAuditNoteRouteParamsSchema
>;
