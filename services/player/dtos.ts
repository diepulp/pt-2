/**
 * PlayerService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type PlayerRow = Database["public"]["Tables"]["player"]["Row"];
type PlayerInsert = Database["public"]["Tables"]["player"]["Insert"];
type PlayerCasinoRow = Database["public"]["Tables"]["player_casino"]["Row"];

// === Player DTOs ===

/** Public player profile */
export type PlayerDTO = Pick<
  PlayerRow,
  "id" | "first_name" | "last_name" | "birth_date" | "created_at"
>;

/** Player creation input */
export type CreatePlayerDTO = Pick<
  PlayerInsert,
  "first_name" | "last_name" | "birth_date"
>;

/** Player update input (all fields optional) */
export type UpdatePlayerDTO = Partial<
  Pick<PlayerInsert, "first_name" | "last_name" | "birth_date">
>;

// === Player Enrollment DTOs ===

/** Player enrollment status in a casino */
export type PlayerEnrollmentDTO = Pick<
  PlayerCasinoRow,
  "player_id" | "casino_id" | "status" | "enrolled_at"
>;

/**
 * Enrollment creation input (casino_id comes from RLS context).
 * Simple input type - not a table projection, casino_id from RLS context.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input, not table-derived
export type CreateEnrollmentDTO = {
  player_id: string;
};

// === Player Search DTOs ===

/**
 * Player search result with enrollment status.
 * This is a computed RPC response combining player data with enrollment info.
 */
export interface PlayerSearchResultDTO {
  id: string;
  first_name: string;
  last_name: string;
  /** Computed full name for display */
  full_name: string;
  /** Enrollment status in the querying casino */
  enrollment_status: "enrolled" | "not_enrolled";
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for player list/search queries */
export type PlayerListFilters = {
  /** Search query (name) - min 2 chars */
  q?: string;
  /** Filter by enrollment status */
  status?: "active" | "inactive";
  /** Cursor for pagination (created_at timestamp) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

/** Filters for enrollment queries */
export type PlayerEnrollmentFilters = {
  /** Filter by enrollment status */
  status?: "active" | "inactive";
};
