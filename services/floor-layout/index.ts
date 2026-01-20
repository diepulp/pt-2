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
  CreateFloorLayoutDTO,
  FloorLayoutActivationDTO,
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
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
  };
}

// Re-export CRUD functions for direct use in server actions
export {
  getActiveLayout,
  getLayoutById,
  getVersionById,
  listLayouts,
  listVersions,
} from './crud';
