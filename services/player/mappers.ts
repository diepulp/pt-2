/**
 * PlayerService Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 §327-365.
 *
 * Pattern: Internal row -> DTO transformations per SLAD §326-331.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md §327-365
 * @see PRD-003A §4.2 - mappers.ts specification
 */

import type {
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerSearchResultDTO,
} from "./dtos";

// === Selected Row Types (match what selects.ts queries return) ===

/**
 * Type for player rows returned by PLAYER_SELECT query.
 * Must match: "id, first_name, last_name, birth_date, created_at"
 */
type PlayerSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  created_at: string;
};

/**
 * Type for enrollment rows returned by ENROLLMENT_SELECT query.
 * Must match: "player_id, casino_id, status, enrolled_at"
 */
type EnrollmentSelectedRow = {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
};

/**
 * Type for rows returned by PLAYER_SEARCH_SELECT query.
 * Nested player object from join with enrollment status.
 */
type PlayerSearchSelectedRow = {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  status: string;
};

// === Player Mappers ===

/**
 * Maps a selected player row to PlayerDTO.
 * Explicitly maps only public fields.
 */
export function toPlayerDTO(row: PlayerSelectedRow): PlayerDTO {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: row.birth_date,
    created_at: row.created_at,
  };
}

/**
 * Maps an array of player rows to PlayerDTO[].
 */
export function toPlayerDTOList(rows: PlayerSelectedRow[]): PlayerDTO[] {
  return rows.map(toPlayerDTO);
}

/**
 * Maps a nullable player row to PlayerDTO | null.
 */
export function toPlayerDTOOrNull(
  row: PlayerSelectedRow | null,
): PlayerDTO | null {
  return row ? toPlayerDTO(row) : null;
}

// === Enrollment Mappers ===

/**
 * Maps a selected enrollment row to PlayerEnrollmentDTO.
 * Explicitly maps only public fields.
 */
export function toEnrollmentDTO(
  row: EnrollmentSelectedRow,
): PlayerEnrollmentDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    status: row.status,
    enrolled_at: row.enrolled_at,
  };
}

/**
 * Maps a nullable enrollment row to PlayerEnrollmentDTO | null.
 */
export function toEnrollmentDTOOrNull(
  row: EnrollmentSelectedRow | null,
): PlayerEnrollmentDTO | null {
  return row ? toEnrollmentDTO(row) : null;
}

// === Search Result Mappers ===

/**
 * Maps a search result row to PlayerSearchResultDTO.
 * Returns null if player data is missing (shouldn't happen with proper RLS).
 */
export function toPlayerSearchResultDTO(
  row: PlayerSearchSelectedRow,
): PlayerSearchResultDTO | null {
  if (!row.player) return null;

  return {
    id: row.player.id,
    first_name: row.player.first_name,
    last_name: row.player.last_name,
    full_name: `${row.player.first_name} ${row.player.last_name}`,
    enrollment_status: row.status === "active" ? "enrolled" : "not_enrolled",
  };
}

/**
 * Maps an array of search result rows to PlayerSearchResultDTO[].
 * Filters out any rows with null player data.
 */
export function toPlayerSearchResultDTOList(
  rows: PlayerSearchSelectedRow[],
): PlayerSearchResultDTO[] {
  return rows
    .map(toPlayerSearchResultDTO)
    .filter((dto): dto is PlayerSearchResultDTO => dto !== null);
}
