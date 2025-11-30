/**
 * VisitService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type VisitRow = Database["public"]["Tables"]["visit"]["Row"];
type VisitInsert = Database["public"]["Tables"]["visit"]["Insert"];

// === Visit DTOs ===

/** Public visit record */
export type VisitDTO = Pick<
  VisitRow,
  "id" | "player_id" | "casino_id" | "started_at" | "ended_at"
>;

/** Visit creation input (casino_id comes from RLS context) */
export type CreateVisitDTO = Pick<VisitInsert, "player_id">;

/**
 * Visit close input.
 * Simple input type - optional end time, not a table projection.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input, not table-derived
export type CloseVisitDTO = {
  /** Optional explicit end time (defaults to now) */
  ended_at?: string;
};

// === Active Visit DTOs ===

/**
 * Active visit check result.
 * Used for idempotent check-in and active visit queries.
 * RPC response type - computed aggregate with boolean flag.
 */
export interface ActiveVisitDTO {
  /** Whether player has an active visit */
  has_active_visit: boolean;
  /** The active visit details (if any) */
  visit: VisitDTO | null;
}

// === Visit with Player Info ===

/**
 * Visit with embedded player details.
 * Used for visit list displays.
 * RPC response type - joined response with nested player object.
 */
export interface VisitWithPlayerDTO extends VisitDTO {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for visit list queries */
export type VisitListFilters = {
  /** Filter by player */
  player_id?: string;
  /** Filter by visit status */
  status?: "active" | "closed";
  /** Filter by date range start */
  from_date?: string;
  /** Filter by date range end */
  to_date?: string;
  /** Cursor for pagination (started_at timestamp) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

/** Filters for active visit query */
export type ActiveVisitFilters = {
  /** Required: player ID to check */
  player_id: string;
};
