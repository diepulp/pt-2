/**
 * RatingSlipService Select Projections
 *
 * Named column sets for consistent query projections.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * IMPORTANT: player_id is NOT selected. Per SRM v4.0.0 invariant,
 * player identity comes from visit.player_id at query time.
 *
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327
 */

// === Rating Slip Selects ===

/**
 * Rating slip basic fields (matches RatingSlipDTO).
 * Excludes player_id - derive from visit.player_id instead.
 * PRD-016: Includes continuity fields for session tracking.
 */
export const RATING_SLIP_SELECT = `
  id,
  casino_id,
  visit_id,
  table_id,
  seat_number,
  start_time,
  end_time,
  status,
  average_bet,
  game_settings,
  policy_snapshot,
  previous_slip_id,
  move_group_id,
  accumulated_seconds,
  final_duration_seconds
` as const;

/**
 * Rating slip list fields (same as basic for consistency).
 */
export const RATING_SLIP_LIST_SELECT = RATING_SLIP_SELECT;

/**
 * Rating slip with pause history join (matches RatingSlipWithPausesDTO).
 * Uses foreign key relation to join rating_slip_pause.
 * PRD-016: Includes continuity fields for session tracking.
 */
export const RATING_SLIP_WITH_PAUSES_SELECT = `
  id,
  casino_id,
  visit_id,
  table_id,
  seat_number,
  start_time,
  end_time,
  status,
  average_bet,
  game_settings,
  policy_snapshot,
  previous_slip_id,
  move_group_id,
  accumulated_seconds,
  final_duration_seconds,
  rating_slip_pause (
    id,
    rating_slip_id,
    casino_id,
    started_at,
    ended_at,
    created_by
  )
` as const;

// === Rating Slip Pause Selects ===

/**
 * Pause interval fields (matches RatingSlipPauseDTO).
 */
export const RATING_SLIP_PAUSE_SELECT = `
  id,
  rating_slip_id,
  casino_id,
  started_at,
  ended_at,
  created_by
` as const;
