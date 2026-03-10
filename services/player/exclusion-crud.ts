/**
 * Player Exclusion CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.
 *
 * AUDIT-C3: getExclusionStatus() calls SQL function — TypeScript
 * must not reimplement precedence logic.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
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

// === Error Mapping ===

function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  if (error.code === '23503') {
    return new DomainError(
      'PLAYER_NOT_FOUND',
      'Referenced player or staff not found',
    );
  }
  if (
    error.message?.includes('EXCLUSION_IMMUTABLE')
  ) {
    return new DomainError(
      'PLAYER_EXCLUSION_NOT_FOUND',
      'Exclusion records are immutable after creation (lift-only updates allowed)',
    );
  }
  return new DomainError('INTERNAL_ERROR', error.message, { details: error });
}

// === Exclusion CRUD ===

/**
 * Create a new exclusion record.
 * casino_id and created_by are injected via RLS context.
 */
export async function createExclusion(
  supabase: SupabaseClient<Database>,
  input: CreateExclusionInput,
): Promise<PlayerExclusionDTO> {
  const { data, error } = await supabase
    .from('player_exclusion')
    .insert({
      player_id: input.player_id,
      exclusion_type: input.exclusion_type,
      enforcement: input.enforcement,
      reason: input.reason,
      effective_from: input.effective_from ?? new Date().toISOString(),
      effective_until: input.effective_until ?? null,
      review_date: input.review_date ?? null,
      external_ref: input.external_ref ?? null,
      jurisdiction: input.jurisdiction ?? null,
    })
    .select(EXCLUSION_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toExclusionDTO(data);
}

/**
 * Lift (soft-delete) an exclusion.
 * Only lifted_at, lifted_by, lift_reason may be updated (AUDIT-C6 trigger enforces).
 */
export async function liftExclusion(
  supabase: SupabaseClient<Database>,
  exclusionId: string,
  input: LiftExclusionInput,
): Promise<PlayerExclusionDTO> {
  // First check if the exclusion exists and is not already lifted
  const { data: existing, error: fetchError } = await supabase
    .from('player_exclusion')
    .select('id, lifted_at')
    .eq('id', exclusionId)
    .maybeSingle();

  if (fetchError) throw mapDatabaseError(fetchError);
  if (!existing) {
    throw new DomainError('PLAYER_EXCLUSION_NOT_FOUND');
  }
  if (existing.lifted_at) {
    throw new DomainError('PLAYER_EXCLUSION_ALREADY_LIFTED');
  }

  const { data, error } = await supabase
    .from('player_exclusion')
    .update({
      lifted_at: new Date().toISOString(),
      lift_reason: input.lift_reason,
    })
    .eq('id', exclusionId)
    .select(EXCLUSION_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  return toExclusionDTO(data);
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

  if (error) throw mapDatabaseError(error);
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

  if (error) throw mapDatabaseError(error);
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

  if (error) throw mapDatabaseError(error);
  return toExclusionStatusDTO(playerId, (data as string) ?? 'clear');
}
