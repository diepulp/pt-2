/**
 * FloorLayoutService Factory
 *
 * Functional factory for floor layout management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * @see PRD-004 Floor Layout Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §1580-1719
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  AssignOrMoveResultDTO,
  ClearResultDTO,
  FloorLayoutActivationDTO,
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
  PitAssignmentStateDTO,
} from './dtos';

// Re-export DTOs for consumers
export * from './dtos';
export { floorLayoutKeys } from './keys';
export * as http from './http';

// === Service Interface ===

/**
 * FloorLayoutService interface - explicit, no ReturnType inference.
 */
export interface FloorLayoutServiceInterface {
  /**
   * List floor layouts with pagination and filters.
   * RLS scopes results to the casino.
   */
  listLayouts(filters: FloorLayoutListFilters): Promise<{
    items: FloorLayoutDTO[];
    cursor: string | null;
  }>;

  /**
   * Get floor layout by ID.
   * Returns null if not found.
   */
  getLayoutById(layoutId: string): Promise<FloorLayoutDTO | null>;

  /**
   * List versions for a specific layout.
   * Optionally include pits and table slots.
   */
  listVersions(filters: FloorLayoutVersionFilters): Promise<{
    items: FloorLayoutVersionDTO[] | FloorLayoutVersionWithSlotsDTO[];
  }>;

  /**
   * Get a specific layout version by ID.
   * Returns null if not found.
   */
  getVersionById(versionId: string): Promise<FloorLayoutVersionDTO | null>;

  /**
   * Get active floor layout for a casino.
   * Returns the currently activated layout version.
   * Returns null if no layout is active.
   */
  getActiveLayout(casinoId: string): Promise<FloorLayoutActivationDTO | null>;

  /**
   * PRD-067: Aggregate pit-assignment state for the admin panel.
   * Returns null when the casino has no active floor layout.
   */
  getPitAssignmentState(
    casinoId: string,
  ): Promise<PitAssignmentStateDTO | null>;

  /**
   * PRD-067: Assign a table to a slot, or move it from its current slot.
   * Wraps the authoritative rpc_assign_or_move_table_to_slot RPC.
   */
  assignOrMoveTableToSlot(
    tableId: string,
    slotId: string,
  ): Promise<AssignOrMoveResultDTO>;

  /**
   * PRD-067: Clear a slot's table assignment.
   * Idempotent at the RPC layer — empty slots return success with
   * `idempotent: true`.
   */
  clearSlotAssignment(slotId: string): Promise<ClearResultDTO>;
}

// === Service Factory ===

/**
 * Creates a FloorLayoutService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createFloorLayoutService(
  supabase: SupabaseClient<Database>,
): FloorLayoutServiceInterface {
  return {
    listLayouts: (filters) => crud.listLayouts(supabase, filters),

    getLayoutById: (layoutId) => crud.getLayoutById(supabase, layoutId),

    listVersions: (filters) => crud.listVersions(supabase, filters),

    getVersionById: (versionId) => crud.getVersionById(supabase, versionId),

    getActiveLayout: (casinoId) => crud.getActiveLayout(supabase, casinoId),

    getPitAssignmentState: (casinoId) =>
      crud.getPitAssignmentState(supabase, casinoId),

    assignOrMoveTableToSlot: (tableId, slotId) =>
      crud.assignOrMoveTableToSlot(supabase, tableId, slotId),

    clearSlotAssignment: (slotId) => crud.clearSlotAssignment(supabase, slotId),
  };
}

// Re-export CRUD functions for direct use in server actions
export {
  assignOrMoveTableToSlot,
  clearSlotAssignment,
  getActiveLayout,
  getLayoutById,
  getPitAssignmentState,
  getVersionById,
  listLayouts,
  listVersions,
} from './crud';
