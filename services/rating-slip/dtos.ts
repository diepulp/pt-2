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
 * Status filter values for rating slip list queries.
 * PRD-020: Includes 'active' alias for open+paused slips.
 */
export type RatingSlipQueryStatus = RatingSlipStatus | "active"; // PRD-020: Alias for open+paused

/**
 * Filters for rating slip list queries.
 * All filters are optional; omit for unfiltered list.
 * PRD-020: status accepts 'active' which expands to open+paused.
 */
export type RatingSlipListFilters = {
  /** Filter by gaming table */
  table_id?: string;
  /** Filter by visit */
  visit_id?: string;
  /** Filter by slip status. PRD-020: 'active' = open+paused */
  status?: RatingSlipQueryStatus;
  /** Results per page (default 20) */
  limit?: number;
  /** Cursor for pagination (slip ID) */
  cursor?: string;
};

// === Pit Cash Observation DTOs (PRD-OPS-CASH-OBS-001) ===
// pit_cash_observation is owned by RatingSlipService per SRM v4.0.0

type PitCashObservationRow =
  Database["public"]["Tables"]["pit_cash_observation"]["Row"];

/**
 * Input for creating a pit cash observation.
 * Uses camelCase for client-side consistency.
 *
 * @see PRD-OPS-CASH-OBS-001
 */
export type CreatePitCashObservationInput = {
  /** Visit ID (required) - observation is visit-scoped */
  visitId: string;
  /** Amount in dollars (required, must be > 0) */
  amount: number;
  /** Rating slip ID (optional) - convenience link */
  ratingSlipId?: string;
  /** Amount kind: 'estimate' (default) or 'cage_confirmed' */
  amountKind?: Database["public"]["Enums"]["observation_amount_kind"];
  /** Source: 'walk_with' (default), 'phone_confirmed', or 'observed' */
  source?: Database["public"]["Enums"]["observation_source"];
  /** Timestamp of observation (optional, defaults to now) */
  observedAt?: string;
  /** Optional note */
  note?: string;
  /** Idempotency key for deduplication (optional) */
  idempotencyKey?: string;
};

/**
 * CamelCase DTO for pit cash observation response.
 * Maps from snake_case RPC response to client-friendly format.
 *
 * Pattern A: Contract-First camelCase DTO with explicit mapping.
 * This is a computed/mapped response type, not a raw Row.
 *
 * @see PRD-OPS-CASH-OBS-001
 * @see DTO_CANONICAL_STANDARD.md §3.1 Pattern A
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First camelCase DTO for RPC response mapping per PRD-OPS-CASH-OBS-001
export type PitCashObservationDTO = {
  id: PitCashObservationRow["id"];
  casinoId: PitCashObservationRow["casino_id"];
  gamingDay: PitCashObservationRow["gaming_day"];
  playerId: PitCashObservationRow["player_id"];
  visitId: PitCashObservationRow["visit_id"];
  ratingSlipId: PitCashObservationRow["rating_slip_id"];
  direction: PitCashObservationRow["direction"];
  amount: PitCashObservationRow["amount"];
  amountKind: PitCashObservationRow["amount_kind"];
  source: PitCashObservationRow["source"];
  observedAt: PitCashObservationRow["observed_at"];
  createdByStaffId: PitCashObservationRow["created_by_staff_id"];
  note: PitCashObservationRow["note"];
  idempotencyKey: PitCashObservationRow["idempotency_key"];
  createdAt: PitCashObservationRow["created_at"];
};

// === Rating Slip with Player DTO (Dashboard Optimization) ===

/**
 * Rating slip with embedded player info.
 * Used by dashboard to show player names without separate API call.
 *
 * PERF-002: Eliminates N+1 pattern where slips are fetched
 * then players are fetched separately in useCasinoActivePlayers().
 *
 * @see PERF-002 Pit Dashboard Data Flow Optimization
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First DTO with nested player for dashboard optimization
export interface RatingSlipWithPlayerDTO {
  id: string;
  casino_id: string;
  visit_id: string;
  table_id: string;
  seat_number: string | null;
  start_time: string;
  end_time: string | null;
  status: RatingSlipStatus;
  average_bet: number | null;
  player: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

// === Active Player Dashboard DTOs (Casino-Wide Activity Panel) ===

/**
 * Active player DTO for casino-wide dashboard lookup.
 * Used by the Activity Panel to display all active players across all tables.
 *
 * Pattern A: Contract-First camelCase DTO with nested player object.
 * Maps from rpc_list_active_players_casino_wide RPC response.
 *
 * @see GAP-ACTIVITY-PANEL-CASINO-WIDE
 */

export interface ActivePlayerForDashboardDTO {
  slipId: string;
  visitId: string;
  tableId: string;
  tableName: string;
  pitName: string | null;
  seatNumber: string | null;
  startTime: string;
  status: "open" | "paused";
  averageBet: number | null;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    tier: string | null;
  } | null;
}

// === Closed Session DTOs (Start From Previous Panel) ===

/**
 * Closed slip DTO for gaming day list view.
 * Used by the "Start From Previous" panel to display closed sessions.
 * Includes player and table info for quick identification.
 *
 * @see PRD-020 Closed Sessions Panel
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First camelCase DTO with nested player/table for panel display
export interface ClosedSlipForGamingDayDTO {
  id: string;
  visit_id: string;
  table_id: string;
  table_name: string;
  seat_number: string | null;
  start_time: string;
  end_time: string;
  final_duration_seconds: number | null;
  average_bet: number | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    tier: string | null;
  } | null; // null for ghost visits
}

/**
 * Keyset cursor for closed slips pagination.
 * Uses (endTime, id) tuple for stable pagination under concurrent writes.
 *
 * ISSUE-SFP-001: Replaces single string cursor with tuple.
 * @see EXEC-SPEC-START-FROM-PREVIOUS-FIX.md
 */

export interface ClosedSlipCursor {
  endTime: string;
  id: string;
}

/**
 * Response type for closed-today endpoint.
 * ISSUE-SFP-001: cursor is now a keyset tuple, not a string.
 */

export interface ClosedTodayResponse {
  items: ClosedSlipForGamingDayDTO[];
  cursor: ClosedSlipCursor | null;
  gamingDay: string;
}
