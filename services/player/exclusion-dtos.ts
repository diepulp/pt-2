/**
 * Player Exclusion DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import type { Database } from '@/types/database.types';

// === Base Row Types ===

type ExclusionRow = Database['public']['Tables']['player_exclusion']['Row'];
type ExclusionInsert =
  Database['public']['Tables']['player_exclusion']['Insert'];

// === Exclusion DTOs ===

/** Full exclusion record for display */
export type PlayerExclusionDTO = Pick<
  ExclusionRow,
  | 'id'
  | 'casino_id'
  | 'player_id'
  | 'exclusion_type'
  | 'enforcement'
  | 'effective_from'
  | 'effective_until'
  | 'review_date'
  | 'reason'
  | 'external_ref'
  | 'jurisdiction'
  | 'created_by'
  | 'created_at'
  | 'lifted_by'
  | 'lifted_at'
  | 'lift_reason'
>;

/** Input for creating an exclusion */
export type CreateExclusionInput = Pick<
  ExclusionInsert,
  | 'player_id'
  | 'exclusion_type'
  | 'enforcement'
  | 'reason'
  | 'effective_from'
  | 'effective_until'
  | 'review_date'
  | 'external_ref'
  | 'jurisdiction'
>;

/** Input for lifting an exclusion */
export type LiftExclusionInput = {
  lift_reason: string;
};

/** Collapsed exclusion status (from SQL function — AUDIT-C3) */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- SQL function return, not in codegen
export type ExclusionStatusDTO = {
  player_id: string;
  status: 'blocked' | 'alert' | 'watchlist' | 'clear';
};
