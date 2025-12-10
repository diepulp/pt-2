/**
 * CasinoService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for RPC response types (GamingDayDTO).
 *
 * @see SPEC-PRD-000-casino-foundation.md section 4.2
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 882-1006
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type CasinoRow = Database["public"]["Tables"]["casino"]["Row"];
type CasinoInsert = Database["public"]["Tables"]["casino"]["Insert"];
type CasinoSettingsRow = Database["public"]["Tables"]["casino_settings"]["Row"];
type CasinoSettingsUpdate =
  Database["public"]["Tables"]["casino_settings"]["Update"];
type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
type StaffInsert = Database["public"]["Tables"]["staff"]["Insert"];

// === Casino DTOs ===

/** Public casino profile */
export type CasinoDTO = Pick<
  CasinoRow,
  "id" | "name" | "location" | "status" | "created_at"
>;

/** Casino creation input */
export type CreateCasinoDTO = Pick<
  CasinoInsert,
  "name" | "location" | "address" | "company_id"
>;

/** Casino update input (all fields optional) */
export type UpdateCasinoDTO = Partial<CreateCasinoDTO>;

// === Casino Settings DTOs ===

/** Public casino settings (excludes internal audit fields) */
export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | "id"
  | "casino_id"
  | "gaming_day_start_time"
  | "timezone"
  | "watchlist_floor"
  | "ctr_threshold"
>;

/** Settings update input */
export type UpdateCasinoSettingsDTO = Partial<
  Pick<
    CasinoSettingsUpdate,
    "gaming_day_start_time" | "timezone" | "watchlist_floor" | "ctr_threshold"
  >
>;

// === Staff DTOs ===

/** Public staff profile (excludes email for privacy) */
export type StaffDTO = Pick<
  StaffRow,
  | "id"
  | "first_name"
  | "last_name"
  | "role"
  | "status"
  | "employee_id"
  | "casino_id"
>;

/** Staff creation input */
export type CreateStaffDTO = Pick<
  StaffInsert,
  | "first_name"
  | "last_name"
  | "role"
  | "employee_id"
  | "email"
  | "casino_id"
  | "user_id"
>;

/** Staff update input (all fields optional except constraints) */
export type UpdateStaffDTO = Partial<
  Pick<
    StaffInsert,
    "first_name" | "last_name" | "role" | "employee_id" | "email" | "casino_id"
  >
>;

// === Gaming Day DTO ===

/**
 * Gaming day computation RPC response from compute_gaming_day.
 * This is the only manual interface as it represents an RPC response,
 * not a direct table mapping.
 */
export interface GamingDayDTO {
  /** ISO date string (YYYY-MM-DD) */
  gaming_day: string;
  /** Casino UUID */
  casino_id: string;
  /** ISO timestamp when computation occurred */
  computed_at: string;
  /** Casino timezone used for computation */
  timezone: string;
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for casino list queries */
export type CasinoListFilters = {
  status?: "active" | "inactive";
  cursor?: string;
  limit?: number;
};

/** Filters for casino staff list queries */
export type CasinoStaffFilters = {
  status?: "active" | "inactive";
  role?: "dealer" | "pit_boss" | "admin";
  cursor?: string;
  limit?: number;
};
