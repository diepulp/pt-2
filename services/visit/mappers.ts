/**
 * VisitService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327-365
 * @see PRD-003B-visit-service-refactor.md section 4.2
 */

import type { ActiveVisitDTO, VisitDTO, VisitWithPlayerDTO } from "./dtos";

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for rows returned by VISIT_SELECT query.
 * Must match: "id, player_id, casino_id, started_at, ended_at"
 */
type VisitSelectedRow = {
  id: string;
  player_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
};

/**
 * Type for rows returned by VISIT_WITH_PLAYER_SELECT query.
 * Includes nested player object from join.
 */
type VisitWithPlayerSelectedRow = {
  id: string;
  player_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
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
    started_at: row.started_at,
    ended_at: row.ended_at,
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
 * Handles null player (edge case: deleted player).
 */
export function toVisitWithPlayerDTO(
  row: VisitWithPlayerSelectedRow,
): VisitWithPlayerDTO {
  return {
    id: row.id,
    player_id: row.player_id,
    casino_id: row.casino_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    player: row.player
      ? {
          id: row.player.id,
          first_name: row.player.first_name,
          last_name: row.player.last_name,
        }
      : {
          // Fallback for edge case: player was deleted
          id: row.player_id,
          first_name: "Unknown",
          last_name: "Player",
        },
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
