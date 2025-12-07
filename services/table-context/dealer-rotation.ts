/**
 * Dealer Rotation Operations
 *
 * Manages dealer assignments with auto-end of previous rotation.
 *
 * @see PRD-007 section 5.1 (Dealer rotation invariants)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { DealerRotationDTO } from './dtos';
import { toDealerRotationDTO } from './mappers';
import { DEALER_ROTATION_SELECT } from './selects';

// === Assign Dealer ===

/**
 * Assigns a dealer to a gaming table.
 *
 * Invariants:
 * - Table must exist and be active
 * - Any existing active rotation is automatically ended
 * - New rotation starts immediately
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @param staffId - Staff UUID of the dealer to assign
 * @returns The new dealer rotation DTO
 * @throws DomainError TABLE_NOT_FOUND if table does not exist
 * @throws DomainError TABLE_NOT_ACTIVE if table is not in active state
 */
export async function assignDealer(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
  staffId: string,
): Promise<DealerRotationDTO> {
  // 1. Verify table exists and is active
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .select('id, status')
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .single();

  if (tableError || !table) {
    throw new DomainError('TABLE_NOT_FOUND');
  }

  if (table.status !== 'active') {
    throw new DomainError('TABLE_NOT_ACTIVE');
  }

  // 2. End any current active rotation
  const now = new Date().toISOString();
  await supabase
    .from('dealer_rotation')
    .update({ ended_at: now })
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('ended_at', null);

  // 3. Create new rotation
  const { data: rotation, error: insertError } = await supabase
    .from('dealer_rotation')
    .insert({
      casino_id: casinoId,
      table_id: tableId,
      staff_id: staffId,
      started_at: now,
    })
    .select(DEALER_ROTATION_SELECT)
    .single();

  if (insertError || !rotation) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to assign dealer');
  }

  return toDealerRotationDTO(rotation);
}

// === End Dealer Rotation ===

/**
 * Ends the current active dealer rotation for a table.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The ended dealer rotation DTO
 * @throws DomainError DEALER_ROTATION_NOT_FOUND if no active rotation exists
 */
export async function endDealerRotation(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<DealerRotationDTO> {
  // 1. Find active rotation
  const { data: rotation, error: fetchError } = await supabase
    .from('dealer_rotation')
    .select(DEALER_ROTATION_SELECT)
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('ended_at', null)
    .single();

  if (fetchError || !rotation) {
    throw new DomainError('DEALER_ROTATION_NOT_FOUND');
  }

  // 2. End rotation
  const { data: updated, error: updateError } = await supabase
    .from('dealer_rotation')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', rotation.id)
    .select(DEALER_ROTATION_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to end dealer rotation');
  }

  return toDealerRotationDTO(updated);
}

// === Get Current Dealer ===

/**
 * Gets the current active dealer rotation for a table.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The current dealer rotation DTO, or null if no active rotation
 */
export async function getCurrentDealer(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<DealerRotationDTO | null> {
  const { data: rotation, error } = await supabase
    .from('dealer_rotation')
    .select(DEALER_ROTATION_SELECT)
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to fetch current dealer');
  }

  return rotation ? toDealerRotationDTO(rotation) : null;
}
