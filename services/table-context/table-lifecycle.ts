/**
 * Table Lifecycle Operations
 *
 * State machine: inactive -> active -> closed
 * Transitions: inactive <-> active (bidirectional), active/inactive -> closed (terminal)
 *
 * @see PRD-007 section 5.1 (Functional Requirements)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
// Cross-context query import (bounded context compliant)
import { hasOpenSlipsForTable } from '@/services/rating-slip/queries';
import type { Database } from '@/types/database.types';

import type { GamingTableDTO } from './dtos';
import { toGamingTableDTO } from './mappers';
import { GAMING_TABLE_SELECT } from './selects';

// === State Machine Transitions ===

const VALID_TRANSITIONS: Record<string, string[]> = {
  inactive: ['active', 'closed'],
  active: ['inactive', 'closed'],
  closed: [], // Terminal state
};

function assertValidTransition(
  currentStatus: string,
  targetStatus: string,
): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    if (currentStatus === 'closed') {
      throw new DomainError('TABLE_ALREADY_CLOSED');
    }
    throw new DomainError(
      'TABLE_NOT_ACTIVE',
      `Cannot transition from ${currentStatus} to ${targetStatus}`,
    );
  }
}

// === Activate Table ===

/**
 * Activates an inactive gaming table.
 *
 * State transition: inactive -> active
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The updated table DTO
 * @throws DomainError TABLE_NOT_FOUND if table does not exist
 * @throws DomainError TABLE_NOT_INACTIVE if table is not in inactive state
 * @throws DomainError TABLE_ALREADY_CLOSED if table is closed (terminal)
 */
export async function activateTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from('gaming_table')
    .select(GAMING_TABLE_SELECT)
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError('TABLE_NOT_FOUND');
  }

  // 2. Validate transition
  assertValidTransition(table.status, 'active');

  if (table.status !== 'inactive') {
    throw new DomainError('TABLE_NOT_INACTIVE');
  }

  // 3. Update status
  const { data: updated, error: updateError } = await supabase
    .from('gaming_table')
    .update({ status: 'active' })
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to activate table');
  }

  return toGamingTableDTO(updated);
}

// === Deactivate Table ===

/**
 * Deactivates an active gaming table.
 *
 * State transition: active -> inactive
 *
 * Invariant: Cannot deactivate a table with open rating slips.
 * This check uses RatingSlipService.hasOpenSlipsForTable() per bounded context rules.
 *
 * Side effect: Ends any active dealer rotation.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The updated table DTO
 * @throws DomainError TABLE_NOT_FOUND if table does not exist
 * @throws DomainError TABLE_NOT_ACTIVE if table is not in active state
 * @throws DomainError TABLE_HAS_OPEN_SLIPS if table has open rating slips
 * @throws DomainError TABLE_ALREADY_CLOSED if table is closed (terminal)
 */
export async function deactivateTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from('gaming_table')
    .select(GAMING_TABLE_SELECT)
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError('TABLE_NOT_FOUND');
  }

  // 2. Validate transition
  assertValidTransition(table.status, 'inactive');

  if (table.status !== 'active') {
    throw new DomainError('TABLE_NOT_ACTIVE');
  }

  // 3. Check for open rating slips (cross-context query via RatingSlipService)
  const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
  if (hasOpenSlips) {
    throw new DomainError('TABLE_HAS_OPEN_SLIPS');
  }

  // 4. End any active dealer rotation
  await supabase
    .from('dealer_rotation')
    .update({ ended_at: new Date().toISOString() })
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('ended_at', null);

  // 5. Update status
  const { data: updated, error: updateError } = await supabase
    .from('gaming_table')
    .update({ status: 'inactive' })
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to deactivate table');
  }

  return toGamingTableDTO(updated);
}

// === Close Table ===

/**
 * Closes a gaming table (terminal state).
 *
 * State transition: active -> closed OR inactive -> closed
 *
 * Once closed, a table cannot be reactivated.
 *
 * Side effect: Ends any active dealer rotation.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The updated table DTO
 * @throws DomainError TABLE_NOT_FOUND if table does not exist
 * @throws DomainError TABLE_ALREADY_CLOSED if table is already closed
 */
export async function closeTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<GamingTableDTO> {
  // 1. Fetch current table state
  const { data: table, error: fetchError } = await supabase
    .from('gaming_table')
    .select(GAMING_TABLE_SELECT)
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .single();

  if (fetchError || !table) {
    throw new DomainError('TABLE_NOT_FOUND');
  }

  // 2. Validate transition
  assertValidTransition(table.status, 'closed');

  // 3. End any active dealer rotation
  await supabase
    .from('dealer_rotation')
    .update({ ended_at: new Date().toISOString() })
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('ended_at', null);

  // 4. Update status to closed (terminal)
  const { data: updated, error: updateError } = await supabase
    .from('gaming_table')
    .update({ status: 'closed' })
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .select(GAMING_TABLE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new DomainError('INTERNAL_ERROR', 'Failed to close table');
  }

  return toGamingTableDTO(updated);
}
