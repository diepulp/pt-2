/**
 * Player Exclusion Select Projections
 *
 * Named column sets for Supabase queries.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

/** Full exclusion record (matches PlayerExclusionDTO) */
export const EXCLUSION_SELECT =
  'id, casino_id, player_id, exclusion_type, enforcement, effective_from, effective_until, review_date, reason, external_ref, jurisdiction, created_by, created_at, lifted_by, lifted_at, lift_reason' as const;

/** Active exclusions only — same columns, filtered at query level */
export const EXCLUSION_SELECT_ACTIVE = EXCLUSION_SELECT;
