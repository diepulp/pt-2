/**
 * RatingSlipService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * IMPORTANT: player_id is NOT on rating_slip. Player identity is derived
 * from visit.player_id per SRM v4.0.0 invariant.
 *
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section RatingSlipService
 * @see EXECUTION-SPEC-PRD-002.md
 */

import type { Database, Json } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type RatingSlipRow = Database["public"]["Tables"]["rating_slip"]["Row"];
type RatingSlipPauseRow =
  Database["public"]["Tables"]["rating_slip_pause"]["Row"];

// === Rating Slip Status Enum (derived from database) ===

/**
 * Rating slip lifecycle status.
 *
 * - `open`: Active gameplay in progress
 * - `paused`: Player on temporary break (meal, restroom)
 * - `closed`: Session completed, duration finalized
 * - `archived`: Soft-deleted (post-MVP)
 *
 * State machine: open ↔ paused → closed (terminal)
 *
 * @see PRD-002 section 5.1 State Machine
 */
export type RatingSlipStatus =
  Database["public"]["Enums"]["rating_slip_status"];

// === Rating Slip DTOs ===

/**
 * Public rating slip record.
 *
 * Note: player_id is NOT included. Per SRM v4.0.0 invariant,
 * player identity is derived from visit.player_id at query time.
 *
 * @example
 * // To get player for a slip:
 * // 1. Query visit where id = slip.visit_id
 * // 2. Use visit.player_id (nullable for ghost visits)
 */
export type RatingSlipDTO = Pick<
  RatingSlipRow,
  | "id"
  | "casino_id"
  | "visit_id"
  | "table_id"
  | "seat_number"
  | "start_time"
  | "end_time"
  | "status"
  | "average_bet"
  | "game_settings"
  | "policy_snapshot"
  | "previous_slip_id"
  | "move_group_id"
  | "accumulated_seconds"
  | "final_duration_seconds"
>;

/**
 * Rating slip with calculated duration.
 * Used when closing a slip or querying duration.
 *
 * Duration excludes paused intervals:
 * `duration_seconds = (end_time - start_time) - SUM(pause_intervals)`
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response type with computed duration
export interface RatingSlipWithDurationDTO extends RatingSlipDTO {
  /** Active play duration in seconds (excludes paused time) */
  duration_seconds: number;
}

/**
 * Rating slip with pause history.
 * Used for detailed slip view with all pause intervals.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Response type with nested array
export interface RatingSlipWithPausesDTO extends RatingSlipDTO {
  /** Array of pause intervals (empty if never paused) */
  pauses: RatingSlipPauseDTO[];
}

// === Rating Slip Pause DTO ===

/**
 * Pause interval record.
 * Each pause tracks a player break with start/end timestamps.
 *
 * - ended_at = null: pause is still active
 * - ended_at has value: pause was resumed or slip was closed
 */
export type RatingSlipPauseDTO = Pick<
  RatingSlipPauseRow,
  | "id"
  | "rating_slip_id"
  | "casino_id"
  | "started_at"
  | "ended_at"
  | "created_by"
>;

// === Input DTOs ===

/**
 * Input for starting a rating slip.
 * Creates slip tied to visit + table + optional seat.
 *
 * Note: player_id is NOT accepted. Player comes from visit.player_id.
 */

export interface CreateRatingSlipInput {
  /** Required: visit ID (visit provides player identity) */
  visit_id: string;
  /** Required: gaming table ID */
  table_id: string;
  /** Optional: seat position at table (e.g., "1", "3", "dealer") */
  seat_number?: string;
  /** Optional: game-specific settings for theoretical calculation */
  game_settings?: Json;
}

/**
 * Input for closing a rating slip.
 * Only average_bet can be set at close time (optional).
 */

export interface CloseRatingSlipInput {
  /** Optional: final average bet amount for theoretical calculation */
  average_bet?: number;
}

/**
 * Input for updating average bet on open slip.
 * Can be updated before close.
 */

export interface UpdateAverageBetInput {
  /** Average bet amount (positive number) */
  average_bet: number;
}

// === Move Operation DTOs (PRD-016) ===

/**
 * Input for moving a rating slip to a new table/seat.
 * Closes current slip and starts new one with continuity metadata.
 *
 * @see PRD-016 Rating Slip Session Continuity
 */
export interface MoveRatingSlipInput {
  /** New table ID to move player to */
  new_table_id: string;
  /** New seat number (optional) */
  new_seat_number?: string;
  /** Optional: game settings for new slip */
  game_settings?: Json;
}

/**
 * Result of move operation.
 * Returns both the closed original slip and the new slip with continuity metadata.
 *
 * @see PRD-016 Rating Slip Session Continuity
 */

export interface MoveRatingSlipResult {
  /** The closed original slip with final_duration_seconds set */
  closed_slip: RatingSlipWithDurationDTO;
  /** The new slip at the new table with continuity metadata populated */
  new_slip: RatingSlipDTO;
}

// === Filter Types ===

/**
 * Filters for rating slip list queries.
 * All filters are optional; omit for unfiltered list.
 */
export type RatingSlipListFilters = {
  /** Filter by gaming table */
  table_id?: string;
  /** Filter by visit */
  visit_id?: string;
  /** Filter by slip status */
  status?: RatingSlipStatus;
  /** Results per page (default 20) */
  limit?: number;
  /** Cursor for pagination (slip ID) */
  cursor?: string;
};
