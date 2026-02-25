/**
 * Shift Checkpoint CRUD Operations (PRD-038)
 *
 * Service functions for shift checkpoint creation and queries.
 * All mutations call SECURITY DEFINER RPCs via supabase.rpc().
 * shift_checkpoint is INSERT-only (immutable after creation).
 *
 * @see EXEC-038 WS2 Service Layer
 * @see ADR-024 (RLS context injection)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { ShiftCheckpointDTO, ShiftCheckpointDeltaDTO } from './dtos';
import {
  toCheckpointDTOFromRpc,
  toCheckpointDTO,
  toCheckpointDTOList,
  toCheckpointDeltaDTO,
} from './mappers';

// === Error Mapping (SQL -> TypeScript) ===

/**
 * Maps Supabase RPC error to DomainError per EXEC-SPEC error contract.
 */
function mapCheckpointRpcError(error: {
  code?: string;
  message: string;
}): DomainError {
  switch (error.message) {
    case 'CHKPT_METRICS_UNAVAILABLE':
      return new DomainError(
        'TABLE_CHECKPOINT_METRICS_UNAVAILABLE',
        undefined,
        { httpStatus: 503 },
      );
    case 'CHKPT_GAMING_DAY_UNRESOLVABLE':
      return new DomainError(
        'TABLE_CHECKPOINT_GAMING_DAY_UNRESOLVABLE',
        undefined,
        { httpStatus: 500 },
      );
    case 'FORBIDDEN':
      return new DomainError('FORBIDDEN');
    default:
      return new DomainError('INTERNAL_ERROR', error.message);
  }
}

// === Mutation Operations ===

/**
 * Create a shift checkpoint via RPC.
 * Captures a metric snapshot for the current gaming day.
 *
 * @param supabase - Supabase client with staff context
 * @param checkpointType - Type of checkpoint (e.g., 'shift_change', 'mid_shift')
 * @param notes - Optional notes
 * @returns Created ShiftCheckpointDTO
 * @throws DomainError on RPC failure
 */
export async function createCheckpoint(
  supabase: SupabaseClient<Database>,
  checkpointType: string,
  notes?: string,
): Promise<ShiftCheckpointDTO> {
  const { data, error } = await supabase
    .rpc('rpc_create_shift_checkpoint', {
      p_checkpoint_type: checkpointType,
      p_notes: notes,
    })
    .single();

  if (error) throw mapCheckpointRpcError(error);
  if (!data)
    throw new DomainError(
      'INTERNAL_ERROR',
      'No data returned from checkpoint RPC',
    );

  return toCheckpointDTOFromRpc(data);
}

// === Query Operations ===

/**
 * Get the latest (most recent) checkpoint.
 * Returns null if no checkpoints exist.
 */
export async function getLatestCheckpoint(
  supabase: SupabaseClient<Database>,
): Promise<ShiftCheckpointDTO | null> {
  const { data, error } = await supabase
    .from('shift_checkpoint')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new DomainError('INTERNAL_ERROR', error.message);
  if (!data) return null;

  return toCheckpointDTO(data);
}

/**
 * Compute delta between latest checkpoint and current shift metrics.
 * Returns null if no checkpoint exists.
 *
 * @param supabase - Supabase client with staff context
 * @returns Delta DTO or null
 */
export async function computeDelta(
  supabase: SupabaseClient<Database>,
): Promise<ShiftCheckpointDeltaDTO | null> {
  // Get latest checkpoint
  const checkpoint = await getLatestCheckpoint(supabase);
  if (!checkpoint) return null;

  // Get current metrics using the same window as the checkpoint
  // but extended to now
  const { data: metricsData, error: metricsError } = await supabase.rpc(
    'rpc_shift_table_metrics',
    {
      p_window_start: checkpoint.window_start,
      p_window_end: new Date().toISOString(),
    },
  );

  if (metricsError)
    throw new DomainError('INTERNAL_ERROR', metricsError.message);

  // Aggregate current metrics from per-table RPC results
  // rpc_shift_table_metrics returns per-table rows with these fields:
  //   win_loss_inventory_cents, fills_total_cents, credits_total_cents,
  //   estimated_drop_buyins_cents, drop_custody_present, etc.
  const metrics = metricsData ?? [];
  const currentMetrics = {
    win_loss_cents: metrics.reduce<number | null>((acc, m) => {
      const winLoss = m.win_loss_inventory_cents;
      if (winLoss == null || winLoss === 0) return acc;
      return (acc ?? 0) + winLoss;
    }, null),
    fills_total_cents: metrics.reduce((acc, m) => acc + m.fills_total_cents, 0),
    credits_total_cents: metrics.reduce(
      (acc, m) => acc + m.credits_total_cents,
      0,
    ),
    drop_total_cents: metrics.reduce<number | null>((acc, m) => {
      const drop = m.estimated_drop_buyins_cents;
      if (drop == null || drop === 0) return acc;
      return (acc ?? 0) + drop;
    }, null),
    tables_active: metrics.length,
    tables_with_coverage: metrics.filter((m) => m.drop_custody_present).length,
  };

  return toCheckpointDeltaDTO(checkpoint, currentMetrics);
}

/**
 * List checkpoints by gaming day.
 * Ordered by creation time descending (most recent first).
 */
export async function listCheckpointsByDay(
  supabase: SupabaseClient<Database>,
  gamingDay: string,
): Promise<ShiftCheckpointDTO[]> {
  const { data, error } = await supabase
    .from('shift_checkpoint')
    .select('*')
    .eq('gaming_day', gamingDay)
    .order('created_at', { ascending: false });

  if (error) throw new DomainError('INTERNAL_ERROR', error.message);

  return toCheckpointDTOList(data ?? []);
}
