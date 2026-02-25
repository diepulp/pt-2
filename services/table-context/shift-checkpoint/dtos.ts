/**
 * Shift Checkpoint DTOs (PRD-038)
 *
 * Pattern A (Contract-First): Manual interfaces derived from Database types.
 * INSERT-only immutable metric snapshots for mid-shift delta comparisons.
 *
 * @see PRD-038 Mid-Shift Delta Checkpoints
 * @see EXEC-038 WS2 Service Layer
 */

/**
 * Full shift checkpoint DTO.
 * Immutable after creation (INSERT-only table).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC response with immutable lifecycle
export interface ShiftCheckpointDTO {
  id: string;
  casino_id: string;
  gaming_day: string;
  checkpoint_type: string;
  checkpoint_scope: string;
  gaming_table_id: string | null;
  pit_id: string | null;
  window_start: string;
  window_end: string;
  win_loss_cents: number | null;
  fills_total_cents: number;
  credits_total_cents: number;
  drop_total_cents: number | null;
  tables_active: number;
  tables_with_coverage: number;
  rated_buyin_cents: number;
  grind_buyin_cents: number;
  cash_out_observed_cents: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Delta DTO comparing current metrics against a checkpoint.
 * Used by the shift dashboard for "since last checkpoint" displays.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: computed delta comparison
export interface ShiftCheckpointDeltaDTO {
  checkpoint: ShiftCheckpointDTO;
  current: {
    win_loss_cents: number | null;
    fills_total_cents: number;
    credits_total_cents: number;
    drop_total_cents: number | null;
    tables_active: number;
    tables_with_coverage: number;
  };
  delta: {
    win_loss_cents: number | null;
    fills_total_cents: number;
    credits_total_cents: number;
    drop_total_cents: number | null;
    tables_active: number;
    tables_with_coverage: number;
  };
  checkpoint_time: string;
}

/**
 * Input for creating a shift checkpoint.
 * Casino context derived from RLS (ADR-024).
 */
export interface CreateCheckpointInput {
  checkpointType: string;
  notes?: string;
}
