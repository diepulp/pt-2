'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/types/database.types';
import {
  createTableStateMachine,
  mapDbStatusToState,
  mapStateToDbStatus,
  type TableEvent,
  type TableState,
} from '@/services/table-context/table-state-machine';

// Type aliases from Database
type GamingTable = Database['public']['Tables']['gaming_table']['Row'];
type GamingTableInsert = Database['public']['Tables']['gaming_table']['Insert'];
type GamingTableUpdate = Database['public']['Tables']['gaming_table']['Update'];

// DTOs using Pick from Database types (Pattern B requirement)
export type TableDTO = Pick<
  GamingTable,
  'id' | 'casino_id' | 'label' | 'type' | 'status' | 'pit' | 'created_at'
>;

export type TableCreateDTO = Pick<GamingTableInsert, 'casino_id' | 'label' | 'type' | 'pit'>;
export type TableUpdateDTO = Partial<Pick<GamingTableUpdate, 'label' | 'type' | 'pit' | 'status'>>;

// Result type
type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Get all tables, optionally filtered by casino
 */
export async function getTables(casinoId?: string): Promise<ActionResult<TableDTO[]>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('gaming_table')
      .select('id, casino_id, label, type, status, pit, created_at')
      .order('label', { ascending: true });

    if (casinoId) {
      query = query.eq('casino_id', casinoId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch tables',
    };
  }
}

/**
 * Get a single table by ID
 */
export async function getTableById(id: string): Promise<ActionResult<TableDTO>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('gaming_table')
      .select('id, casino_id, label, type, status, pit, created_at')
      .eq('id', id)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch table',
    };
  }
}

/**
 * Create a new table
 */
export async function createTable(
  input: TableCreateDTO
): Promise<ActionResult<TableDTO>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('gaming_table')
      .insert({
        casino_id: input.casino_id,
        label: input.label,
        type: input.type,
        pit: input.pit,
        status: 'inactive', // Default status
      })
      .select('id, casino_id, label, type, status, pit, created_at')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/tables');
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to create table',
    };
  }
}

/**
 * Update a table
 */
export async function updateTable(
  id: string,
  input: TableUpdateDTO
): Promise<ActionResult<TableDTO>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('gaming_table')
      .update(input)
      .eq('id', id)
      .select('id, casino_id, label, type, status, pit, created_at')
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/tables');
    revalidatePath(`/tables/${id}`);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to update table',
    };
  }
}

/**
 * Delete a table (soft delete by setting status to closed)
 */
export async function deleteTable(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('gaming_table')
      .update({ status: 'closed' })
      .eq('id', id);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/tables');
    return { data: { id }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to delete table',
    };
  }
}

/**
 * Get the current logical state of a table
 * Maps database status to logical state (open, closed, break, reserved)
 */
export async function getTableState(tableId: string): Promise<ActionResult<TableState>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('gaming_table')
      .select('status')
      .eq('id', tableId)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    // For now, simple mapping. In future, could check metadata for break/reserved
    const logicalState = mapDbStatusToState(data.status);
    return { data: logicalState, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to get table state',
    };
  }
}

/**
 * Transition a table to a new state using the state machine
 */
export async function transitionTableState(
  tableId: string,
  event: TableEvent
): Promise<ActionResult<TableState>> {
  try {
    const supabase = await createClient();

    // Get current state
    const currentResult = await getTableState(tableId);
    if (currentResult.error) {
      return { data: null, error: currentResult.error };
    }

    const currentState = currentResult.data!;

    // Create state machine and attempt transition
    const stateMachine = createTableStateMachine(currentState);

    if (!stateMachine.canTransition(event)) {
      return {
        data: null,
        error: `Cannot ${event.type} from state ${currentState}`,
      };
    }

    const newState = stateMachine.transition(event);
    const newDbStatus = mapStateToDbStatus(newState);

    // Update database
    const { error } = await supabase
      .from('gaming_table')
      .update({ status: newDbStatus })
      .eq('id', tableId);

    if (error) {
      return { data: null, error: error.message };
    }

    revalidatePath('/tables');
    revalidatePath(`/tables/${tableId}`);
    return { data: newState, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to transition table state',
    };
  }
}

/**
 * Get active rating slips for a table
 */
export async function getActiveRatingSlips(tableId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      player_id: string;
      seat_number: string | null;
      average_bet: number | null;
      start_time: string;
      status: string;
    }>
  >
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('rating_slip')
      .select('id, player_id, seat_number, average_bet, start_time, status')
      .eq('table_id', tableId)
      .eq('status', 'open')
      .order('start_time', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch rating slips',
    };
  }
}

/**
 * Convenience functions for common state transitions
 */

export async function openTable(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'OPEN_TABLE' });
}

export async function closeTable(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'CLOSE_TABLE' });
}

export async function startTableBreak(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'START_BREAK' });
}

export async function endTableBreak(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'END_BREAK' });
}

export async function reserveTable(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'RESERVE' });
}

export async function unreserveTable(tableId: string): Promise<ActionResult<TableState>> {
  return transitionTableState(tableId, { type: 'UNRESERVE' });
}
