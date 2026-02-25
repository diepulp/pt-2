/**
 * TableContextService - Rundown Module (ADR-027)
 *
 * Service functions for table rundown computation and drop posting.
 * Implements visibility slice for table win/loss calculation.
 *
 * IMPORTANT: table_win_cents is NULL when drop is not posted (PATCHED behavior).
 *
 * @see ADR-027 Table Bank Mode (Visibility Slice, MVP)
 * @see ADR-024 (RLS context injection)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { TableRundownDTO, TableSessionDTO } from './dtos';
import { toTableRundownDTO } from './mappers';

// RPC return type
type RpcPostDropTotalReturn =
  Database['public']['Functions']['rpc_post_table_drop_total']['Returns'];

/**
 * Type guard for post drop total RPC response.
 * Validates required fields are present for TableSessionDTO mapping.
 */
function isValidPostDropTotalResponse(
  data: unknown,
): data is RpcPostDropTotalReturn {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.casino_id === 'string' &&
    typeof obj.gaming_table_id === 'string' &&
    typeof obj.gaming_day === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.opened_at === 'string'
  );
}

/**
 * Map Supabase error to DomainError.
 */
function mapRpcError(error: { code?: string; message: string }): DomainError {
  if (error.message?.includes('Session not found')) {
    return new DomainError('SESSION_NOT_FOUND');
  }
  if (error.message?.includes('Missing casino context')) {
    return new DomainError('UNAUTHORIZED');
  }
  return new DomainError('INTERNAL_ERROR', error.message);
}

/**
 * Compute table rundown for a session.
 *
 * Returns all formula components:
 * - opening_total_cents, closing_total_cents
 * - fills_total_cents, credits_total_cents
 * - drop_total_cents (NULL if not posted)
 * - table_win_cents (NULL if drop not posted - PATCHED behavior)
 *
 * Formula: win = closing + credits + drop - opening - fills
 *
 * @param supabase - Supabase client with staff context
 * @param sessionId - Table session UUID
 * @returns TableRundownDTO with all components
 * @throws DomainError if session not found or RPC fails
 */
export async function computeTableRundown(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<TableRundownDTO> {
  const { data, error } = await supabase
    .rpc('rpc_compute_table_rundown', { p_session_id: sessionId })
    .single();

  if (error) throw mapRpcError(error);
  if (!data) throw new DomainError('SESSION_NOT_FOUND');

  return toTableRundownDTO(data);
}

/**
 * Post drop total to a session.
 *
 * This persists drop_total_cents AND sets drop_posted_at timestamp.
 * After posting, subsequent rundown computations will include table_win_cents.
 *
 * @param supabase - Supabase client with staff context
 * @param sessionId - Table session UUID
 * @param dropTotalCents - Drop total in cents
 * @returns Updated TableSessionDTO
 * @throws DomainError if session not found or RPC fails
 */
export async function postTableDropTotal(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  dropTotalCents: number,
): Promise<TableSessionDTO> {
  const { data, error } = await supabase
    .rpc('rpc_post_table_drop_total', {
      p_session_id: sessionId,
      p_drop_total_cents: dropTotalCents,
    })
    .single();

  if (error) throw mapRpcError(error);
  if (!data) throw new DomainError('SESSION_NOT_FOUND');

  // Validate RPC response shape using type guard
  if (!isValidPostDropTotalResponse(data)) {
    throw new DomainError('INTERNAL_ERROR', 'Invalid RPC response structure', {
      httpStatus: 500,
      details: { sessionId, received: typeof data },
    });
  }

  // Type is now narrowed to RpcPostDropTotalReturn
  const result: RpcPostDropTotalReturn = data;

  // Map RPC result to TableSessionDTO
  return {
    id: result.id,
    casino_id: result.casino_id,
    gaming_table_id: result.gaming_table_id,
    gaming_day: result.gaming_day,
    shift_id: result.shift_id,
    status: result.status,
    opened_at: result.opened_at,
    opened_by_staff_id: result.opened_by_staff_id,
    rundown_started_at: result.rundown_started_at,
    rundown_started_by_staff_id: result.rundown_started_by_staff_id,
    closed_at: result.closed_at,
    closed_by_staff_id: result.closed_by_staff_id,
    opening_inventory_snapshot_id: result.opening_inventory_snapshot_id,
    closing_inventory_snapshot_id: result.closing_inventory_snapshot_id,
    drop_event_id: result.drop_event_id,
    notes: result.notes,
    metadata: result.metadata as Record<string, unknown> | null,
    created_at: result.created_at,
    updated_at: result.updated_at,
    // ADR-027 fields
    table_bank_mode: result.table_bank_mode,
    need_total_cents: result.need_total_cents,
    fills_total_cents: result.fills_total_cents,
    credits_total_cents: result.credits_total_cents,
    drop_total_cents: result.drop_total_cents,
    drop_posted_at: result.drop_posted_at,
    // PRD-038A fields
    close_reason: result.close_reason,
    close_note: result.close_note,
    has_unresolved_items: result.has_unresolved_items,
    requires_reconciliation: result.requires_reconciliation,
    activated_by_staff_id: result.activated_by_staff_id,
    paused_by_staff_id: result.paused_by_staff_id,
    resumed_by_staff_id: result.resumed_by_staff_id,
    rolled_over_by_staff_id: result.rolled_over_by_staff_id,
    crossed_gaming_day: result.crossed_gaming_day,
  };
}
