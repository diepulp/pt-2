/**
 * CasinoService Zod Validation Schemas
 *
 * Validation schemas for API request bodies and query parameters.
 * Includes staff role constraint refinement per PRD-000.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 4.3
 */

import { z } from "zod";

import { uuidSchema, uuidSchemaNullable } from "@/lib/validation";

// === Casino Schemas ===

/** Schema for creating a new casino */
export const createCasinoSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  location: z.string().max(255).nullable().optional(),
  address: z.record(z.string(), z.unknown()).nullable().optional(),
  company_id: uuidSchemaNullable("company ID").optional(),
});

/** Schema for updating an existing casino */
export const updateCasinoSchema = createCasinoSchema.partial();

// === Casino Settings Schemas ===

/** Schema for updating casino settings */
export const updateCasinoSettingsSchema = z.object({
  gaming_day_start_time: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      "Must be HH:MM or HH:MM:SS format (e.g., 06:00)",
    )
    .optional(),
  timezone: z
    .string()
    .min(1)
    .max(64, "Timezone must be at most 64 characters")
    .optional(),
  watchlist_floor: z
    .number()
    .positive("Watchlist floor must be positive")
    .optional(),
  ctr_threshold: z
    .number()
    .positive("CTR threshold must be positive")
    .optional(),
});

// === Staff Schemas ===

/** Staff roles enum */
export const staffRoleSchema = z.enum(["dealer", "pit_boss", "admin"]);

/**
 * Schema for creating a staff member with role constraint refinement.
 *
 * Role constraint (PRD-000 section 3.3):
 * - Dealer: Must NOT have user_id (non-authenticated role)
 * - Pit Boss/Admin: MUST have user_id (authenticated roles)
 */
export const createStaffSchema = z
  .object({
    first_name: z.string().min(1, "First name is required").max(100),
    last_name: z.string().min(1, "Last name is required").max(100),
    role: staffRoleSchema,
    employee_id: z.string().max(50).nullable().optional(),
    email: z.string().email("Invalid email format").nullable().optional(),
    casino_id: uuidSchema("casino ID"),
    user_id: uuidSchemaNullable("user ID").optional(),
  })
  .refine(
    (data) => {
      // Dealer must NOT have user_id; pit_boss/admin MUST have user_id
      if (data.role === "dealer") {
        return data.user_id === null || data.user_id === undefined;
      }
      return data.user_id !== null && data.user_id !== undefined;
    },
    {
      message:
        "Dealer role cannot have user_id; pit_boss and admin roles must have user_id",
      path: ["user_id"],
    },
  );

// === Query Parameter Schemas ===

/** Schema for gaming day query parameters */
export const gamingDayQuerySchema = z.object({
  timestamp: z
    .string()
    .datetime({ message: "Must be a valid ISO 8601 datetime" })
    .optional(),
});

/** Schema for casino list query parameters */
export const casinoListQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, "Limit cannot exceed 100")
    .default(20),
});

/** Schema for staff list query parameters */
export const staffListQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  role: staffRoleSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, "Limit cannot exceed 100")
    .default(20),
});

// === Type Exports (inferred from schemas) ===

export type CreateCasinoInput = z.infer<typeof createCasinoSchema>;
export type UpdateCasinoInput = z.infer<typeof updateCasinoSchema>;
export type UpdateCasinoSettingsInput = z.infer<
  typeof updateCasinoSettingsSchema
>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type GamingDayQuery = z.infer<typeof gamingDayQuerySchema>;
export type CasinoListQuery = z.infer<typeof casinoListQuerySchema>;
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
