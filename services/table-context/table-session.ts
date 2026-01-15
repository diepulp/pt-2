/**
 * Table Session Operations
 *
 * State machine: OPEN → ACTIVE → RUNDOWN → CLOSED
 * (MVP: OPEN → ACTIVE is implicit, sessions start in ACTIVE state)
 *
 * All mutations are via SECURITY DEFINER RPCs that use
 * set_rls_context_from_staff() per ADR-024.
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 * @see ADR-024 (RLS context injection)
 * @see ADR-018 (SECURITY DEFINER governance)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { TableSessionDTO, CloseTableSessionInput } from './dtos';

// === RPC Return Type ===
// Note: This type will be auto-generated after migrations are applied.
// Until then, we define it manually to match the table_session row structure.
type TableSessionRow = {
  id: string;
  casino_id: string;
  gaming_table_id: string;
  gaming_day: string;
  shift_id: string | null;
  status: string;
  opened_at: string;
  opened_by_staff_id: string;
  rundown_started_at: string | null;
  rundown_started_by_staff_id: string | null;
  closed_at: string | null;
  closed_by_staff_id: string | null;
  opening_inventory_snapshot_id: string | null;
  closing_inventory_snapshot_id: string | null;
  drop_event_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/**
 * Helper to call session RPCs that aren't yet in generated types.
 * TODO: Remove after migrations applied and `npm run db:types` regenerates types.
 */
async function callSessionRpc<T>(
  supabase: SupabaseClient<Database>,
  rpcName: string,
  params: Record<string, unknown>,
): Promise<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.rpc as any)(rpcName, params);
}

/**
 * Helper to query table_session table (not yet in generated types).
 * TODO: Remove after migrations applied and `npm run db:types` regenerates types.
 */
async function queryTableSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<{
  data: TableSessionRow | null;
  error: { code?: string; message?: string } | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any)
    .from('table_session')
    .select('*')
    .eq('id', sessionId)
    .single();
}

// === Type Mappings ===

/**
 * Maps RPC result to TableSessionDTO.
 * RPC returns table_session row type directly.
 */
function toTableSessionDTO(row: TableSessionRow): TableSessionDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    gaming_table_id: row.gaming_table_id,
    gaming_day: row.gaming_day,
    shift_id: row.shift_id,
    status: row.status as TableSessionDTO['status'],
    opened_at: row.opened_at,
    opened_by_staff_id: row.opened_by_staff_id,
    rundown_started_at: row.rundown_started_at,
    rundown_started_by_staff_id: row.rundown_started_by_staff_id,
    closed_at: row.closed_at,
    closed_by_staff_id: row.closed_by_staff_id,
    opening_inventory_snapshot_id: row.opening_inventory_snapshot_id,
    closing_inventory_snapshot_id: row.closing_inventory_snapshot_id,
    drop_event_id: row.drop_event_id,
    notes: row.notes,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// === Error Code Mapping ===

/**
 * Maps Postgres error codes from RPCs to DomainErrors.
 */
function mapRpcError(
  error: { code?: string; message?: string } | null,
  operation: string,
): never {
  if (!error) {
    throw new DomainError('INTERNAL_ERROR', `${operation} failed unexpectedly`);
  }

  const message = error.message ?? '';

  // Custom error codes from RPCs
  if (message.includes('active_session_exists')) {
    throw new DomainError(
      'SESSION_ALREADY_EXISTS',
      'An active session already exists for this table',
    );
  }

  if (message.includes('session_not_found')) {
    throw new DomainError('SESSION_NOT_FOUND', 'Table session not found');
  }

  if (message.includes('invalid_state_transition')) {
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      `Cannot perform ${operation} in current session state`,
    );
  }

  if (message.includes('missing_closing_artifact')) {
    throw new DomainError(
      'MISSING_CLOSING_ARTIFACT',
      'At least one closing artifact (drop_event_id or closing_inventory_snapshot_id) is required',
    );
  }

  if (message.includes('forbidden')) {
    throw new DomainError(
      'UNAUTHORIZED',
      'Only pit_boss or admin roles can perform session operations',
    );
  }

  // Postgres error codes
  if (error.code === '23505') {
    throw new DomainError(
      'SESSION_ALREADY_EXISTS',
      'An active session already exists for this table',
    );
  }

  if (error.code === 'P0002') {
    throw new DomainError('SESSION_NOT_FOUND', 'Table session not found');
  }

  if (error.code === 'P0003') {
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      `Cannot perform ${operation} in current session state`,
    );
  }

  if (error.code === 'P0004') {
    throw new DomainError(
      'MISSING_CLOSING_ARTIFACT',
      'At least one closing artifact is required',
    );
  }

  if (error.code === 'P0001') {
    throw new DomainError(
      'UNAUTHORIZED',
      'Only pit_boss or admin roles can perform session operations',
    );
  }

  throw new DomainError(
    'INTERNAL_ERROR',
    `${operation} failed: ${message || error.code || 'unknown error'}`,
  );
}

// === Session Operations ===

/**
 * Opens a new table session.
 *
 * Creates a session in ACTIVE state (OPEN → ACTIVE is implicit for MVP).
 * Fails if an active session already exists for the table.
 *
 * @param supabase - Supabase client with RLS context
 * @param gamingTableId - Gaming table UUID
 * @returns The created session DTO
 * @throws DomainError SESSION_ALREADY_EXISTS if active session exists
 * @throws DomainError UNAUTHORIZED if caller is not pit_boss/admin
 */
export async function openTableSession(
  supabase: SupabaseClient<Database>,
  gamingTableId: string,
): Promise<TableSessionDTO> {
  const { data, error } = await callSessionRpc<TableSessionRow>(
    supabase,
    'rpc_open_table_session',
    { p_gaming_table_id: gamingTableId },
  );

  if (error || !data) {
    mapRpcError(error, 'Open session');
  }

  return toTableSessionDTO(data);
}

/**
 * Starts rundown for a table session.
 *
 * Transitions session from OPEN/ACTIVE to RUNDOWN state.
 * Marks the beginning of closing procedures.
 *
 * @param supabase - Supabase client with RLS context
 * @param sessionId - Table session UUID
 * @returns The updated session DTO
 * @throws DomainError SESSION_NOT_FOUND if session doesn't exist
 * @throws DomainError INVALID_STATE_TRANSITION if not in OPEN/ACTIVE state
 * @throws DomainError UNAUTHORIZED if caller is not pit_boss/admin
 */
export async function startTableRundown(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<TableSessionDTO> {
  const { data, error } = await callSessionRpc<TableSessionRow>(
    supabase,
    'rpc_start_table_rundown',
    { p_table_session_id: sessionId },
  );

  if (error || !data) {
    mapRpcError(error, 'Start rundown');
  }

  return toTableSessionDTO(data);
}

/**
 * Closes a table session.
 *
 * Transitions session to CLOSED state (terminal).
 * Requires at least one closing artifact (drop_event_id or closing_inventory_snapshot_id).
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Close session input with required artifact(s)
 * @returns The closed session DTO
 * @throws DomainError SESSION_NOT_FOUND if session doesn't exist
 * @throws DomainError INVALID_STATE_TRANSITION if not in RUNDOWN/ACTIVE state
 * @throws DomainError MISSING_CLOSING_ARTIFACT if no artifact provided
 * @throws DomainError UNAUTHORIZED if caller is not pit_boss/admin
 */
export async function closeTableSession(
  supabase: SupabaseClient<Database>,
  input: CloseTableSessionInput,
): Promise<TableSessionDTO> {
  const { data, error } = await callSessionRpc<TableSessionRow>(
    supabase,
    'rpc_close_table_session',
    {
      p_table_session_id: input.sessionId,
      p_drop_event_id: input.dropEventId ?? null,
      p_closing_inventory_snapshot_id: input.closingInventorySnapshotId ?? null,
      p_notes: input.notes ?? null,
    },
  );

  if (error || !data) {
    mapRpcError(error, 'Close session');
  }

  return toTableSessionDTO(data);
}

/**
 * Gets the current (active/non-closed) session for a gaming table.
 *
 * Returns null if no active session exists.
 *
 * @param supabase - Supabase client with RLS context
 * @param gamingTableId - Gaming table UUID
 * @returns The current session DTO or null if none
 */
export async function getCurrentTableSession(
  supabase: SupabaseClient<Database>,
  gamingTableId: string,
): Promise<TableSessionDTO | null> {
  const { data, error } = await callSessionRpc<TableSessionRow>(
    supabase,
    'rpc_get_current_table_session',
    { p_gaming_table_id: gamingTableId },
  );

  if (error) {
    mapRpcError(error, 'Get current session');
  }

  // RPC returns null if no active session
  if (!data) {
    return null;
  }

  return toTableSessionDTO(data);
}

/**
 * Gets a session by ID.
 *
 * Uses direct table access (RLS enforces casino scope).
 *
 * @param supabase - Supabase client with RLS context
 * @param sessionId - Table session UUID
 * @returns The session DTO
 * @throws DomainError SESSION_NOT_FOUND if session doesn't exist
 */
export async function getTableSessionById(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<TableSessionDTO> {
  const { data, error } = await queryTableSession(supabase, sessionId);

  if (error || !data) {
    throw new DomainError('SESSION_NOT_FOUND', 'Table session not found');
  }

  return toTableSessionDTO(data);
}
