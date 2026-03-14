/**
 * Player Exclusion Mappers
 *
 * Type-safe transformations from Supabase rows to DTOs.
 * No `as` type assertions per SLAD v2.2.0.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import type { PlayerExclusionDTO, ExclusionStatusDTO } from './exclusion-dtos';

// === Selected Row Types (match what EXCLUSION_SELECT returns) ===

type ExclusionSelectedRow = {
  id: string;
  casino_id: string;
  player_id: string;
  exclusion_type: string;
  enforcement: string;
  effective_from: string;
  effective_until: string | null;
  review_date: string | null;
  reason: string;
  external_ref: string | null;
  jurisdiction: string | null;
  created_by: string;
  created_at: string;
  lifted_by: string | null;
  lifted_at: string | null;
  lift_reason: string | null;
};

// === Exclusion Mappers ===

/** Maps a selected exclusion row to PlayerExclusionDTO. */
export function toExclusionDTO(row: ExclusionSelectedRow): PlayerExclusionDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    player_id: row.player_id,
    exclusion_type: row.exclusion_type,
    enforcement: row.enforcement,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
    review_date: row.review_date,
    reason: row.reason,
    external_ref: row.external_ref,
    jurisdiction: row.jurisdiction,
    created_by: row.created_by,
    created_at: row.created_at,
    lifted_by: row.lifted_by,
    lifted_at: row.lifted_at,
    lift_reason: row.lift_reason,
  };
}

/** Maps an array of exclusion rows to PlayerExclusionDTO[]. */
export function toExclusionDTOList(
  rows: ExclusionSelectedRow[],
): PlayerExclusionDTO[] {
  return rows.map(toExclusionDTO);
}

/** Maps a nullable exclusion row to PlayerExclusionDTO | null. */
export function toExclusionDTOOrNull(
  row: ExclusionSelectedRow | null,
): PlayerExclusionDTO | null {
  return row ? toExclusionDTO(row) : null;
}

/** Maps SQL function result to ExclusionStatusDTO. */
export function toExclusionStatusDTO(
  playerId: string,
  status: string,
): ExclusionStatusDTO {
  return {
    player_id: playerId,
    status: status as ExclusionStatusDTO['status'],
  };
}
