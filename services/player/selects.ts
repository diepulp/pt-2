/**
 * PlayerService Select Projections
 *
 * Named column sets for Supabase queries.
 * Prevents over-fetching and maintains consistent field exposure.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see SLAD §327 - Named column sets
 * @see PRD-003A §4.1 - selects.ts specification
 */

// === Player Selects ===

/** Player profile fields (matches PlayerDTO) */
export const PLAYER_SELECT =
  "id, first_name, last_name, birth_date, created_at" as const;

/** Player list fields (same as PLAYER_SELECT for consistency) */
export const PLAYER_SELECT_LIST = PLAYER_SELECT;

// === Enrollment Selects ===

/** Enrollment fields (matches PlayerEnrollmentDTO) */
export const ENROLLMENT_SELECT =
  "player_id, casino_id, status, enrolled_at" as const;

// === Search Selects ===

/**
 * Player search from player table with enrollment status.
 * Uses !inner join to player_casino for RLS scoping.
 * Returns player fields with nested enrollment status.
 */
export const PLAYER_SEARCH_SELECT = `
  id,
  first_name,
  last_name,
  player_casino!inner (
    status
  )
` as const;
