/**
 * RatingSlipService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * IMPORTANT: player_id is NOT mapped. Per SRM v4.0.0 invariant,
 * player identity comes from visit.player_id at query time.
 *
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327-365
 */

import type { VisitLiveViewDTO } from "@/services/visit/dtos";
import type { Json } from "@/types/database.types";

import type {
  RatingSlipDTO,
  RatingSlipPauseDTO,
  RatingSlipStatus,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
} from "./dtos";

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for rows returned by RATING_SLIP_SELECT query.
 * Must match the columns in selects.ts.
 *
 * Note: player_id is NOT included per SRM v4.0.0 invariant.
 * PRD-016: Includes continuity fields for session tracking.
 */
type RatingSlipSelectedRow = {
  id: string;
  casino_id: string;
  visit_id: string;
  table_id: string;
  seat_number: string | null;
  start_time: string;
  end_time: string | null;
  status: RatingSlipStatus;
  average_bet: number | null;
  game_settings: Json | null;
  policy_snapshot: Json | null;
  previous_slip_id: string | null;
  move_group_id: string | null;
  accumulated_seconds: number;
  final_duration_seconds: number | null;
};

/**
 * Type for rows returned by RATING_SLIP_PAUSE_SELECT query.
 */
type RatingSlipPauseSelectedRow = {
  id: string;
  rating_slip_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
};

/**
 * Type for rows returned by RATING_SLIP_WITH_PAUSES_SELECT query.
 * Includes nested pause array from join.
 */
type RatingSlipWithPausesSelectedRow = RatingSlipSelectedRow & {
  rating_slip_pause: RatingSlipPauseSelectedRow[];
};

/**
 * Type for rpc_close_rating_slip response.
 * Returns both the slip and calculated duration.
 */
type CloseRatingSlipRpcResponse = {
  slip: RatingSlipSelectedRow;
  duration_seconds: number;
};

// === Rating Slip Mappers ===

/**
 * Maps a selected rating slip row to RatingSlipDTO.
 * Explicitly maps only public fields (no player_id).
 * PRD-016: Includes continuity fields for session tracking.
 */
export function toRatingSlipDTO(row: RatingSlipSelectedRow): RatingSlipDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    visit_id: row.visit_id,
    table_id: row.table_id,
    seat_number: row.seat_number,
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    average_bet: row.average_bet,
    game_settings: row.game_settings,
    policy_snapshot: row.policy_snapshot,
    previous_slip_id: row.previous_slip_id,
    move_group_id: row.move_group_id,
    accumulated_seconds: row.accumulated_seconds,
    final_duration_seconds: row.final_duration_seconds,
  };
}

/**
 * Maps an array of rating slip rows to RatingSlipDTO[].
 */
export function toRatingSlipDTOList(
  rows: RatingSlipSelectedRow[],
): RatingSlipDTO[] {
  return rows.map(toRatingSlipDTO);
}

/**
 * Maps a nullable rating slip row to RatingSlipDTO | null.
 */
export function toRatingSlipDTOOrNull(
  row: RatingSlipSelectedRow | null,
): RatingSlipDTO | null {
  return row ? toRatingSlipDTO(row) : null;
}

// === Rating Slip With Duration Mappers ===

/**
 * Maps a rating slip row with duration to RatingSlipWithDurationDTO.
 * Used for close operation and duration queries.
 */
export function toRatingSlipWithDurationDTO(
  row: RatingSlipSelectedRow,
  durationSeconds: number,
): RatingSlipWithDurationDTO {
  return {
    ...toRatingSlipDTO(row),
    duration_seconds: durationSeconds,
    // PRD-016: Include final_duration_seconds (should match duration_seconds after close)
    final_duration_seconds: durationSeconds,
  };
}

/**
 * Maps rpc_close_rating_slip response to RatingSlipWithDurationDTO.
 */
export function toRatingSlipWithDurationDTOFromRpc(
  response: CloseRatingSlipRpcResponse,
): RatingSlipWithDurationDTO {
  return toRatingSlipWithDurationDTO(response.slip, response.duration_seconds);
}

// === Rating Slip Pause Mappers ===

/**
 * Maps a selected pause row to RatingSlipPauseDTO.
 */
export function toRatingSlipPauseDTO(
  row: RatingSlipPauseSelectedRow,
): RatingSlipPauseDTO {
  return {
    id: row.id,
    rating_slip_id: row.rating_slip_id,
    casino_id: row.casino_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    created_by: row.created_by,
  };
}

/**
 * Maps an array of pause rows to RatingSlipPauseDTO[].
 */
export function toRatingSlipPauseDTOList(
  rows: RatingSlipPauseSelectedRow[],
): RatingSlipPauseDTO[] {
  return rows.map(toRatingSlipPauseDTO);
}

// === Rating Slip With Pauses Mappers ===

/**
 * Maps a rating slip row with pause join to RatingSlipWithPausesDTO.
 * Handles empty pause array when slip was never paused.
 */
export function toRatingSlipWithPausesDTO(
  row: RatingSlipWithPausesSelectedRow,
): RatingSlipWithPausesDTO {
  return {
    ...toRatingSlipDTO(row),
    pauses: toRatingSlipPauseDTOList(row.rating_slip_pause || []),
  };
}

/**
 * Maps a nullable rating slip row with pauses to RatingSlipWithPausesDTO | null.
 */
export function toRatingSlipWithPausesDTOOrNull(
  row: RatingSlipWithPausesSelectedRow | null,
): RatingSlipWithPausesDTO | null {
  return row ? toRatingSlipWithPausesDTO(row) : null;
}

// === Visit Live View Mappers (PRD-016) ===

/**
 * Type for the raw RPC response from rpc_get_visit_live_view.
 * The RPC returns JSONB which Supabase parses as unknown.
 * This type describes the expected shape for validation.
 */
type VisitLiveViewRpcResponse = {
  visit_id: string;
  player_id: string;
  player_first_name: string;
  player_last_name: string;
  visit_status: "open" | "closed";
  started_at: string;
  current_segment_slip_id: string | null;
  current_segment_table_id: string | null;
  current_segment_table_name: string | null;
  current_segment_seat_number: string | null;
  current_segment_status: "open" | "paused" | null;
  current_segment_started_at: string | null;
  current_segment_average_bet: number | null;
  session_total_duration_seconds: number;
  session_total_buy_in: number;
  session_total_cash_out: number;
  session_net: number;
  session_points_earned: number;
  session_segment_count: number;
  segments?: Array<{
    slip_id: string;
    table_id: string;
    table_name: string;
    seat_number: string | null;
    status: string;
    start_time: string;
    end_time: string | null;
    final_duration_seconds: number | null;
    average_bet: number | null;
  }>;
};

/**
 * Maps RPC response to VisitLiveViewDTO.
 * Provides type-safe transformation from raw RPC data.
 */
export function toVisitLiveViewDTO(
  data: VisitLiveViewRpcResponse,
): VisitLiveViewDTO {
  return {
    visit_id: data.visit_id,
    player_id: data.player_id,
    player_first_name: data.player_first_name,
    player_last_name: data.player_last_name,
    visit_status: data.visit_status,
    started_at: data.started_at,
    current_segment_slip_id: data.current_segment_slip_id,
    current_segment_table_id: data.current_segment_table_id,
    current_segment_table_name: data.current_segment_table_name,
    current_segment_seat_number: data.current_segment_seat_number,
    current_segment_status: data.current_segment_status,
    current_segment_started_at: data.current_segment_started_at,
    current_segment_average_bet: data.current_segment_average_bet,
    session_total_duration_seconds: data.session_total_duration_seconds,
    session_total_buy_in: data.session_total_buy_in,
    session_total_cash_out: data.session_total_cash_out,
    session_net: data.session_net,
    session_points_earned: data.session_points_earned,
    session_segment_count: data.session_segment_count,
    segments: data.segments,
  };
}

/**
 * Maps nullable RPC response to VisitLiveViewDTO or null.
 * Used when RPC returns NULL for non-existent visits.
 */
export function toVisitLiveViewDTOOrNull(
  data: VisitLiveViewRpcResponse | null,
): VisitLiveViewDTO | null {
  return data ? toVisitLiveViewDTO(data) : null;
}
