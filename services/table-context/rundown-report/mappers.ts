/**
 * Rundown Report Mappers (PRD-038)
 *
 * Type-safe transformations from Supabase rows/RPC returns to DTOs.
 *
 * @see SLAD section 327-365
 */

import type { Database } from '@/types/database.types';

import type {
  TableRundownReportDTO,
  TableRundownReportSummaryDTO,
} from './dtos';

// Row type for direct queries
type TableRundownReportRow =
  Database['public']['Tables']['table_rundown_report']['Row'];

// RPC return types (persist and finalize both return the full row)
type RpcPersistReturn =
  Database['public']['Functions']['rpc_persist_table_rundown']['Returns'];
type RpcFinalizeReturn =
  Database['public']['Functions']['rpc_finalize_rundown']['Returns'];

/**
 * Maps a table_rundown_report row to TableRundownReportDTO.
 */
export function toRundownReportDTO(
  row: TableRundownReportRow,
): TableRundownReportDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    table_session_id: row.table_session_id,
    gaming_table_id: row.gaming_table_id,
    gaming_day: row.gaming_day,
    opening_bankroll_cents: row.opening_bankroll_cents,
    closing_bankroll_cents: row.closing_bankroll_cents,
    opening_snapshot_id: row.opening_snapshot_id,
    closing_snapshot_id: row.closing_snapshot_id,
    drop_event_id: row.drop_event_id,
    fills_total_cents: row.fills_total_cents,
    credits_total_cents: row.credits_total_cents,
    drop_total_cents: row.drop_total_cents,
    table_win_cents: row.table_win_cents,
    opening_source: row.opening_source,
    computation_grade: row.computation_grade,
    par_target_cents: row.par_target_cents,
    variance_from_par_cents: row.variance_from_par_cents,
    has_late_events: row.has_late_events,
    computed_by: row.computed_by,
    computed_at: row.computed_at,
    finalized_at: row.finalized_at,
    finalized_by: row.finalized_by,
    notes: row.notes,
    created_at: row.created_at,
  };
}

/**
 * Maps RPC persist result to TableRundownReportDTO.
 */
export function toRundownReportDTOFromPersistRpc(
  rpcResult: RpcPersistReturn,
): TableRundownReportDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_session_id: rpcResult.table_session_id,
    gaming_table_id: rpcResult.gaming_table_id,
    gaming_day: rpcResult.gaming_day,
    opening_bankroll_cents: rpcResult.opening_bankroll_cents,
    closing_bankroll_cents: rpcResult.closing_bankroll_cents,
    opening_snapshot_id: rpcResult.opening_snapshot_id,
    closing_snapshot_id: rpcResult.closing_snapshot_id,
    drop_event_id: rpcResult.drop_event_id,
    fills_total_cents: rpcResult.fills_total_cents,
    credits_total_cents: rpcResult.credits_total_cents,
    drop_total_cents: rpcResult.drop_total_cents,
    table_win_cents: rpcResult.table_win_cents,
    opening_source: rpcResult.opening_source,
    computation_grade: rpcResult.computation_grade,
    par_target_cents: rpcResult.par_target_cents,
    variance_from_par_cents: rpcResult.variance_from_par_cents,
    has_late_events: rpcResult.has_late_events,
    computed_by: rpcResult.computed_by,
    computed_at: rpcResult.computed_at,
    finalized_at: rpcResult.finalized_at,
    finalized_by: rpcResult.finalized_by,
    notes: rpcResult.notes,
    created_at: rpcResult.created_at,
  };
}

/**
 * Maps RPC finalize result to TableRundownReportDTO.
 */
export function toRundownReportDTOFromFinalizeRpc(
  rpcResult: RpcFinalizeReturn,
): TableRundownReportDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    table_session_id: rpcResult.table_session_id,
    gaming_table_id: rpcResult.gaming_table_id,
    gaming_day: rpcResult.gaming_day,
    opening_bankroll_cents: rpcResult.opening_bankroll_cents,
    closing_bankroll_cents: rpcResult.closing_bankroll_cents,
    opening_snapshot_id: rpcResult.opening_snapshot_id,
    closing_snapshot_id: rpcResult.closing_snapshot_id,
    drop_event_id: rpcResult.drop_event_id,
    fills_total_cents: rpcResult.fills_total_cents,
    credits_total_cents: rpcResult.credits_total_cents,
    drop_total_cents: rpcResult.drop_total_cents,
    table_win_cents: rpcResult.table_win_cents,
    opening_source: rpcResult.opening_source,
    computation_grade: rpcResult.computation_grade,
    par_target_cents: rpcResult.par_target_cents,
    variance_from_par_cents: rpcResult.variance_from_par_cents,
    has_late_events: rpcResult.has_late_events,
    computed_by: rpcResult.computed_by,
    computed_at: rpcResult.computed_at,
    finalized_at: rpcResult.finalized_at,
    finalized_by: rpcResult.finalized_by,
    notes: rpcResult.notes,
    created_at: rpcResult.created_at,
  };
}

/**
 * Maps a row to the summary DTO for list views.
 */
export function toRundownReportSummaryDTO(
  row: TableRundownReportRow,
): TableRundownReportSummaryDTO {
  return {
    id: row.id,
    table_session_id: row.table_session_id,
    gaming_table_id: row.gaming_table_id,
    gaming_day: row.gaming_day,
    table_win_cents: row.table_win_cents,
    computation_grade: row.computation_grade,
    has_late_events: row.has_late_events,
    finalized_at: row.finalized_at,
  };
}

/**
 * Maps multiple rows to summary DTOs.
 */
export function toRundownReportSummaryDTOList(
  rows: TableRundownReportRow[],
): TableRundownReportSummaryDTO[] {
  return rows.map(toRundownReportSummaryDTO);
}
