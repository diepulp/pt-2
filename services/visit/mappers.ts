/**
 * VisitService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327-365
 * @see PRD-003B-visit-service-refactor.md section 4.2
 */

import type {
  ActiveVisitDTO,
  VisitDTO,
  VisitKind,
  VisitWithPlayerDTO,
} from "./dtos";

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for rows returned by VISIT_SELECT query.
 * Must match: "id, player_id, casino_id, visit_kind, started_at, ended_at, visit_group_id, gaming_day"
 *
 * Note: player_id is nullable to support ghost gaming visits (gaming_ghost_unrated).
 * PRD-017: visit_group_id added for session continuity.
 * ADR-026: gaming_day added for gaming-day-scoped visits.
 */
type VisitSelectedRow = {
  id: string;
  player_id: string | null;
  casino_id: string;
  visit_kind: VisitKind;
  started_at: string;
  ended_at: string | null;
  visit_group_id: string;
  gaming_day: string;
};

/**
 * Type for rows returned by VISIT_WITH_PLAYER_SELECT query.
 * Includes nested player object from join.
 *
 * Note: player_id is nullable to support ghost gaming visits.
 * When player_id is NULL, the player join also returns NULL.
 * PRD-017: visit_group_id added for session continuity.
 * ADR-026: gaming_day added for gaming-day-scoped visits.
 */
type VisitWithPlayerSelectedRow = {
  id: string;
  player_id: string | null;
  casino_id: string;
  visit_kind: VisitKind;
  started_at: string;
  ended_at: string | null;
  visit_group_id: string;
  gaming_day: string;
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

// === Visit Mappers ===

/**
 * Maps a selected visit row to VisitDTO.
 * Explicitly maps only public fields.
 */
export function toVisitDTO(row: VisitSelectedRow): VisitDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    visit_kind: row.visit_kind,
    started_at: row.started_at,
    ended_at: row.ended_at,
    visit_group_id: row.visit_group_id,
    gaming_day: row.gaming_day,
  };
}

/**
 * Maps an array of visit rows to VisitDTO[].
 */
export function toVisitDTOList(rows: VisitSelectedRow[]): VisitDTO[] {
  return rows.map(toVisitDTO);
}

/**
 * Maps a nullable visit row to VisitDTO | null.
 */
export function toVisitDTOOrNull(
  row: VisitSelectedRow | null,
): VisitDTO | null {
  return row ? toVisitDTO(row) : null;
}

// === Visit With Player Mappers ===

/**
 * Maps a selected visit row with player join to VisitWithPlayerDTO.
 * Handles null player for:
 *   - Ghost gaming visits (visit_kind = 'gaming_ghost_unrated', player_id is NULL)
 *   - Deleted player edge case (player_id exists but player was deleted)
 */
export function toVisitWithPlayerDTO(
  row: VisitWithPlayerSelectedRow,
): VisitWithPlayerDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    visit_kind: row.visit_kind,
    started_at: row.started_at,
    ended_at: row.ended_at,
    visit_group_id: row.visit_group_id,
    gaming_day: row.gaming_day,
    player: row.player
      ? {
          id: row.player.id,
          first_name: row.player.first_name,
          last_name: row.player.last_name,
        }
      : // Ghost visits or deleted player - return null
        // UI should display appropriate "Ghost Gaming" or "Unknown Player" label
        null,
  };
}

/**
 * Maps an array of visit rows with player to VisitWithPlayerDTO[].
 */
export function toVisitWithPlayerDTOList(
  rows: VisitWithPlayerSelectedRow[],
): VisitWithPlayerDTO[] {
  return rows.map(toVisitWithPlayerDTO);
}

// === Active Visit Mappers ===

/**
 * Maps a nullable visit row to ActiveVisitDTO.
 * Includes boolean flag for quick active check.
 */
export function toActiveVisitDTO(row: VisitSelectedRow | null): ActiveVisitDTO {
  return {
    has_active_visit: row !== null,
    visit: row ? toVisitDTO(row) : null,
  };
}
