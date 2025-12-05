/**
 * VisitService Select Projections
 *
 * Named column sets for consistent query projections.
 * Pattern B: Matches DTO fields for type-safe mapping.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327
 * @see PRD-003B-visit-service-refactor.md section 4.1
 */

// === Visit Selects ===

/** Visit basic fields (matches VisitDTO) */
export const VISIT_SELECT =
  "id, player_id, casino_id, visit_kind, started_at, ended_at" as const;

/** Visit list fields (same as VISIT_SELECT for cursor pagination) */
export const VISIT_SELECT_LIST = VISIT_SELECT;

/** Visit with player join (matches VisitWithPlayerDTO) */
export const VISIT_WITH_PLAYER_SELECT = `
  id, player_id, casino_id, visit_kind, started_at, ended_at,
  player:player_id (id, first_name, last_name)
` as const;

/** Active visit check fields */
export const ACTIVE_VISIT_SELECT = VISIT_SELECT;
