/**
 * Player Exclusion CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.
 *
 * ISS-EXCL-001: createExclusion and liftExclusion use SECURITY DEFINER RPCs
 * that bundle context injection + DML in a single transaction (ADR-024/030).
 *
 * AUDIT-C3: getExclusionStatus() calls SQL function — TypeScript
 * must not reimplement precedence logic.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  CreateExclusionInput,
  ExclusionStatusDTO,
  LiftExclusionInput,
  PlayerExclusionDTO,
} from './exclusion-dtos';
import {
  toExclusionDTO,
  toExclusionDTOList,
  toExclusionStatusDTO,
} from './exclusion-mappers';
import { EXCLUSION_SELECT } from './exclusion-selects';

// === RPC Error Mapping ===

/**
 * Maps RPC errors to domain errors.
 *
 * All custom RAISE EXCEPTION calls use ERRCODE P0001 with message prefixes:
 *   UNAUTHORIZED:, FORBIDDEN:, NOT_FOUND:, CONFLICT:, VALIDATION_ERROR:, INTERNAL_ERROR:
 *
 * The immutability trigger (trg_player_exclusion_lift_only) also raises P0001
 * with message starting with 'EXCLUSION_IMMUTABLE:'.
 */
function mapExclusionRpcError(error: {
  code?: string;
  message: string;
}): DomainError {
  const msg = error.message ?? '';

  // FK violation — player does not exist
  if (error.code === '23503') {
    return new DomainError(
      'PLAYER_NOT_FOUND',
      'Referenced player or staff not found',
    );
  }

  // Custom RPC errors (P0001) — discriminate by message prefix
  if (msg.startsWith('UNAUTHORIZED:')) {
    return new DomainError('UNAUTHORIZED', msg);
  }
  if (msg.startsWith('FORBIDDEN:')) {
    return new DomainError('FORBIDDEN', msg);
  }
  if (msg.startsWith('NOT_FOUND:')) {
    return new DomainError('PLAYER_EXCLUSION_NOT_FOUND', msg);
  }
  if (msg.startsWith('CONFLICT:')) {
    return new DomainError('PLAYER_EXCLUSION_ALREADY_LIFTED', msg);
  }
  if (msg.startsWith('VALIDATION_ERROR:')) {
    return new DomainError('VALIDATION_ERROR', msg);
  }

  // Immutability trigger (defense-in-depth — should not fire via RPC path)
  if (msg.includes('EXCLUSION_IMMUTABLE')) {
    return new DomainError('EXCLUSION_IMMUTABLE', msg);
  }

  return new DomainError('INTERNAL_ERROR', msg, {
    details: safeErrorDetails(error),
  });
}

// === Singleton Assertion ===

function assertSingletonRow<T>(data: T[] | T | null): T {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    throw new DomainError('INTERNAL_ERROR', 'RPC returned no data');
  }
  if (rows.length > 1) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'RPC returned multiple rows — contract violation',
    );
  }
  return rows[0];
}

// === Exclusion CRUD ===

/**
 * Create a new exclusion record via SECURITY DEFINER RPC.
 * casino_id and created_by are derived from RLS context inside the RPC.
 */
export async function createExclusion(
  supabase: SupabaseClient<Database>,
  input: CreateExclusionInput,
): Promise<PlayerExclusionDTO> {
  // PGRST202 workaround: PostgREST matches functions by the set of param names
  // in the JSON body. Omitting keys (undefined) drops them from JSON.stringify,
  // causing a signature mismatch. Send null instead — SQL DEFAULT still applies
  // since all DEFAULT values are NULL. Generated types use `?: string` which
  // disallows null, hence the assertion.

  const { data, error } = await supabase.rpc('rpc_create_player_exclusion', {
    p_player_id: input.player_id,
    p_exclusion_type: input.exclusion_type,
    p_enforcement: input.enforcement,
    p_reason: input.reason,
    p_effective_from: input.effective_from ?? null,
    p_effective_until: input.effective_until ?? null,
    p_review_date: input.review_date ?? null,
    p_external_ref: input.external_ref ?? null,
    p_jurisdiction: input.jurisdiction ?? null,
  } as Database['public']['Functions']['rpc_create_player_exclusion']['Args']);

  if (error) throw mapExclusionRpcError(error);
  const row = assertSingletonRow(data);
  return toExclusionDTO(row);
}

/**
 * Lift (soft-delete) an exclusion via SECURITY DEFINER RPC.
 * lifted_by is derived from RLS context inside the RPC.
 * Pre-check logic (exists, not already lifted, same casino) is inside the RPC.
 */
export async function liftExclusion(
  supabase: SupabaseClient<Database>,
  exclusionId: string,
  input: LiftExclusionInput,
): Promise<PlayerExclusionDTO> {
  const { data, error } = await supabase.rpc('rpc_lift_player_exclusion', {
    p_exclusion_id: exclusionId,
    p_lift_reason: input.lift_reason,
  });

  if (error) throw mapExclusionRpcError(error);
  const row = assertSingletonRow(data);
  return toExclusionDTO(row);
}

/**
 * List all exclusions for a player (including lifted).
 */
export async function listExclusions(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerExclusionDTO[]> {
  const { data, error } = await supabase
    .from('player_exclusion')
    .select(EXCLUSION_SELECT)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) throw mapExclusionRpcError(error);
  return toExclusionDTOList(data ?? []);
}

/**
 * List active exclusions for a player.
 * Filters by lifted_at IS NULL and temporal bounds at query time.
 */
export async function getActiveExclusions(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerExclusionDTO[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('player_exclusion')
    .select(EXCLUSION_SELECT)
    .eq('player_id', playerId)
    .is('lifted_at', null)
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error) throw mapExclusionRpcError(error);
  return toExclusionDTOList(data ?? []);
}

/**
 * Get collapsed exclusion status for a player.
 * AUDIT-C3: Calls SQL function — single source of truth for precedence.
 */
export async function getExclusionStatus(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<ExclusionStatusDTO> {
  const { data, error } = await supabase.rpc(
    'rpc_get_player_exclusion_status',
    { p_player_id: playerId },
  );

  if (error) throw mapExclusionRpcError(error);
  return toExclusionStatusDTO(playerId, (data as string) ?? 'clear');
}
