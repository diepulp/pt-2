/**
 * Shift Checkpoint Mappers (PRD-038)
 *
 * Type-safe transformations from Supabase rows/RPC returns to DTOs.
 *
 * @see SLAD section 327-365
 */

import type { Database } from '@/types/database.types';

import type { ShiftCheckpointDTO, ShiftCheckpointDeltaDTO } from './dtos';

// Row type for direct queries
type ShiftCheckpointRow =
  Database['public']['Tables']['shift_checkpoint']['Row'];

// RPC return type
type RpcCreateCheckpointReturn =
  Database['public']['Functions']['rpc_create_shift_checkpoint']['Returns'];

/**
 * Maps a shift_checkpoint row to ShiftCheckpointDTO.
 */
export function toCheckpointDTO(row: ShiftCheckpointRow): ShiftCheckpointDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    gaming_day: row.gaming_day,
    checkpoint_type: row.checkpoint_type,
    checkpoint_scope: row.checkpoint_scope,
    gaming_table_id: row.gaming_table_id,
    pit_id: row.pit_id,
    window_start: row.window_start,
    window_end: row.window_end,
    win_loss_cents: row.win_loss_cents,
    fills_total_cents: row.fills_total_cents,
    credits_total_cents: row.credits_total_cents,
    drop_total_cents: row.drop_total_cents,
    tables_active: row.tables_active,
    tables_with_coverage: row.tables_with_coverage,
    rated_buyin_cents: row.rated_buyin_cents,
    grind_buyin_cents: row.grind_buyin_cents,
    cash_out_observed_cents: row.cash_out_observed_cents,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/**
 * Maps RPC create checkpoint result to ShiftCheckpointDTO.
 */
export function toCheckpointDTOFromRpc(
  rpcResult: RpcCreateCheckpointReturn,
): ShiftCheckpointDTO {
  return {
    id: rpcResult.id,
    casino_id: rpcResult.casino_id,
    gaming_day: rpcResult.gaming_day,
    checkpoint_type: rpcResult.checkpoint_type,
    checkpoint_scope: rpcResult.checkpoint_scope,
    gaming_table_id: rpcResult.gaming_table_id,
    pit_id: rpcResult.pit_id,
    window_start: rpcResult.window_start,
    window_end: rpcResult.window_end,
    win_loss_cents: rpcResult.win_loss_cents,
    fills_total_cents: rpcResult.fills_total_cents,
    credits_total_cents: rpcResult.credits_total_cents,
    drop_total_cents: rpcResult.drop_total_cents,
    tables_active: rpcResult.tables_active,
    tables_with_coverage: rpcResult.tables_with_coverage,
    rated_buyin_cents: rpcResult.rated_buyin_cents,
    grind_buyin_cents: rpcResult.grind_buyin_cents,
    cash_out_observed_cents: rpcResult.cash_out_observed_cents,
    notes: rpcResult.notes,
    created_by: rpcResult.created_by,
    created_at: rpcResult.created_at,
  };
}

/**
 * Maps checkpoint list rows to DTOs.
 */
export function toCheckpointDTOList(
  rows: ShiftCheckpointRow[],
): ShiftCheckpointDTO[] {
  return rows.map(toCheckpointDTO);
}

/**
 * Computes a delta DTO comparing current metrics against a checkpoint.
 * Used by the shift dashboard for "since last checkpoint" displays.
 *
 * @param checkpoint - The reference checkpoint
 * @param currentMetrics - Current live metric values
 * @returns Delta DTO with checkpoint, current, and delta values
 */
export function toCheckpointDeltaDTO(
  checkpoint: ShiftCheckpointDTO,
  currentMetrics: {
    win_loss_cents: number | null;
    fills_total_cents: number;
    credits_total_cents: number;
    drop_total_cents: number | null;
    tables_active: number;
    tables_with_coverage: number;
  },
): ShiftCheckpointDeltaDTO {
  return {
    checkpoint,
    current: currentMetrics,
    delta: {
      // NULL if either side is NULL (can't compute delta from unknowns)
      win_loss_cents:
        currentMetrics.win_loss_cents != null &&
        checkpoint.win_loss_cents != null
          ? currentMetrics.win_loss_cents - checkpoint.win_loss_cents
          : null,
      fills_total_cents:
        currentMetrics.fills_total_cents - checkpoint.fills_total_cents,
      credits_total_cents:
        currentMetrics.credits_total_cents - checkpoint.credits_total_cents,
      drop_total_cents:
        currentMetrics.drop_total_cents != null &&
        checkpoint.drop_total_cents != null
          ? currentMetrics.drop_total_cents - checkpoint.drop_total_cents
          : null,
      tables_active: currentMetrics.tables_active - checkpoint.tables_active,
      tables_with_coverage:
        currentMetrics.tables_with_coverage - checkpoint.tables_with_coverage,
    },
    checkpoint_time: checkpoint.created_at,
  };
}
