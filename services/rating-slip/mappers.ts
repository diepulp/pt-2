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

import type { Json } from '@/types/database.types';

import type {
  RatingSlipDTO,
  RatingSlipPauseDTO,
  RatingSlipStatus,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
} from './dtos';

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for rows returned by RATING_SLIP_SELECT query.
 * Must match the columns in selects.ts.
 *
 * Note: player_id is NOT included per SRM v4.0.0 invariant.
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
