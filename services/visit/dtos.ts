/**
 * VisitService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 814-888
 * @see EXEC-VSE-001 Visit Service Evolution
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type VisitRow = Database["public"]["Tables"]["visit"]["Row"];
type VisitInsert = Database["public"]["Tables"]["visit"]["Insert"];

// === Visit Kind Enum (derived from database) ===

/**
 * Visit archetype classification.
 *
 * - `reward_identified`: Player exists, no gaming, redemptions only (comps, vouchers)
 * - `gaming_identified_rated`: Player exists, gaming session, loyalty accrual eligible
 * - `gaming_ghost_unrated`: No player identity, gaming session, compliance tracking only
 *
 * @see EXEC-VSE-001 section 1 (Executive Summary)
 */
export type VisitKind = Database["public"]["Enums"]["visit_kind"];

// === Visit DTOs ===

/**
 * Public visit record.
 *
 * Note: player_id is now nullable (string | null) to support ghost gaming visits.
 * Ghost visits (gaming_ghost_unrated) have player_id = NULL.
 */
export type VisitDTO = Pick<
  VisitRow,
  "id" | "player_id" | "casino_id" | "visit_kind" | "started_at" | "ended_at"
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

// === Typed Visit Creation DTOs (EXEC-VSE-001 WS-2) ===

/**
 * Input for creating a reward-only visit.
 * Player must be identified (player_id required).
 * Creates visit with visit_kind = 'reward_identified'.
 *
 * Use case: Comps, vouchers, customer care without gaming session.
 */
export type CreateRewardVisitDTO = Pick<VisitInsert, "player_id">;

/**
 * Input for creating an identified gaming visit.
 * Player must be identified (player_id required).
 * Creates visit with visit_kind = 'gaming_identified_rated'.
 *
 * Use case: Standard rated play with loyalty accrual.
 */
export type CreateGamingVisitDTO = Pick<VisitInsert, "player_id">;

/**
 * RPC input for creating a ghost gaming visit.
 * No player identity required (player_id will be NULL).
 * Creates visit with visit_kind = 'gaming_ghost_unrated'.
 *
 * Use case: Tracking gaming activity for compliance (CTR/MTL) when
 * player declines or cannot provide identification.
 *
 * @see ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input: table_id/notes not in visit table
export type CreateGhostGamingVisitDTO = {
  /** Required: the table where ghost gaming occurs */
  table_id: string;
  /** Optional: notes about the ghost gaming session */
  notes?: string;
};

/**
 * RPC input for converting a reward visit to a gaming visit.
 * Only valid for visits with visit_kind = 'reward_identified'.
 * Transitions to visit_kind = 'gaming_identified_rated'.
 *
 * Use case: Player came in for rewards, decided to play.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input: operation DTO, not table projection
export type ConvertRewardToGamingDTO = {
  /** Required: the visit to convert */
  visit_id: string;
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

/**
 * RPC response: Start visit result with idempotency metadata.
 * Eliminates redundant active visit check at route layer (P2 fix: ISSUE-983EFA10).
 */
export interface StartVisitResultDTO {
  /** The visit (new or existing) */
  visit: VisitDTO;
  /** True if a new visit was created, false if existing was returned */
  isNew: boolean;
}

// === Visit with Player Info ===

/**
 * Visit with embedded player details.
 * Used for visit list displays.
 * RPC response type - joined response with nested player object.
 *
 * Note: player is optional for ghost visits (player_id = NULL).
 */
export interface VisitWithPlayerDTO extends VisitDTO {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for visit list queries */
export type VisitListFilters = {
  /** Filter by player */
  player_id?: string;
  /** Filter by visit status */
  status?: "active" | "closed";
  /** Filter by visit kind */
  visit_kind?: VisitKind;
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
