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
 * Must match: "id, first_name, last_name, birth_date, created_at, middle_name, email, phone_number"
 */
type PlayerSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  created_at: string;
  middle_name: string | null;
  email: string | null;
  phone_number: string | null;
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
 * Player table with nested player_casino enrollment status.
 * Uses !inner join so player_casino is always present (at least one).
 * LEFT joins player_identity for DOB (ADR-022: identity stores scanned DOB).
 */
type PlayerSearchSelectedRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  player_casino: { status: string }[];
  player_identity: { birth_date: string | null }[] | null;
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
    middle_name: row.middle_name,
    email: row.email,
    phone_number: row.phone_number,
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
 * Takes first enrollment status from player_casino array.
 * COALESCE: Prefers player_identity.birth_date (from ID scan) over player.birth_date.
 */
export function toPlayerSearchResultDTO(
  row: PlayerSearchSelectedRow,
): PlayerSearchResultDTO {
  // Get first enrollment status (should always have at least one due to !inner join)
  const enrollmentStatus = row.player_casino[0]?.status;

  // ADR-022: Prefer identity DOB (from ID scan) over player DOB (seed/manual entry)
  const identityDob = row.player_identity?.[0]?.birth_date;
  const birthDate = identityDob ?? row.birth_date;

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name} ${row.last_name}`,
    birth_date: birthDate,
    enrollment_status:
      enrollmentStatus === "active" ? "enrolled" : "not_enrolled",
  };
}

/**
 * Maps an array of search result rows to PlayerSearchResultDTO[].
 */
export function toPlayerSearchResultDTOList(
  rows: PlayerSearchSelectedRow[],
): PlayerSearchResultDTO[] {
  return rows.map(toPlayerSearchResultDTO);
}
