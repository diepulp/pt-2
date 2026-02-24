/**
 * Rundown Report DTOs (PRD-038)
 *
 * Pattern A (Contract-First): Manual interfaces derived from Database types.
 * Provides table rundown persistence and finalization lifecycle.
 *
 * @see PRD-038 Shift Rundown Persistence
 * @see EXEC-038 WS2 Service Layer
 */

/**
 * Full rundown report DTO.
 * Null semantics (EXEC-SPEC lines 277-288):
 * - table_win_cents NULL = drop not posted
 * - opening_bankroll_cents NULL = no opening snapshot
 * - closing_bankroll_cents NULL = no closing snapshot
 * - NULL always means "unknown/unavailable", never "zero"
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: RPC response with null semantics contract
export interface TableRundownReportDTO {
  id: string;
  casino_id: string;
  table_session_id: string;
  gaming_table_id: string;
  gaming_day: string;
  opening_bankroll_cents: number | null;
  closing_bankroll_cents: number | null;
  opening_snapshot_id: string | null;
  closing_snapshot_id: string | null;
  drop_event_id: string | null;
  fills_total_cents: number;
  credits_total_cents: number;
  drop_total_cents: number | null;
  table_win_cents: number | null;
  opening_source: string;
  computation_grade: string;
  par_target_cents: number | null;
  variance_from_par_cents: number | null;
  has_late_events: boolean;
  computed_by: string | null;
  computed_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Summary DTO for list views (gaming day dashboard).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: list projection
export interface TableRundownReportSummaryDTO {
  id: string;
  table_session_id: string;
  gaming_table_id: string;
  gaming_day: string;
  table_win_cents: number | null;
  computation_grade: string;
  has_late_events: boolean;
  finalized_at: string | null;
}

/**
 * Input for persisting a rundown report.
 * Casino context derived from RLS (ADR-024).
 */
export interface PersistRundownInput {
  tableSessionId: string;
}

/**
 * Input for finalizing a rundown report.
 */
export interface FinalizeRundownInput {
  reportId: string;
}
