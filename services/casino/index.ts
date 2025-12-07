/**
 * CasinoService
 *
 * Service factory for casino configuration, staff management, and gaming day computation.
 * Follows functional factory pattern (no classes).
 *
 * Key responsibilities:
 * - Casino CRUD operations
 * - Casino settings (temporal authority for gaming day, timezone)
 * - Staff management with role constraints
 * - Gaming day computation via RPC
 *
 * @see SPEC-PRD-000-casino-foundation.md
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §882-1006
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  CasinoDTO,
  CasinoListFilters,
  CasinoSettingsDTO,
  CasinoStaffFilters,
  CreateCasinoDTO,
  CreateStaffDTO,
  GamingDayDTO,
  StaffDTO,
  UpdateCasinoDTO,
  UpdateCasinoSettingsDTO,
} from './dtos';

// === Service Interface ===

/**
 * CasinoService interface - explicit, no ReturnType inference.
 * Pattern B (Canonical CRUD) per SLAD §429-471.
 */
export interface CasinoServiceInterface {
  // === Casino CRUD ===

  /**
   * List casinos with pagination and filters.
   * RLS scopes results based on user role.
   */
  list(filters?: CasinoListFilters): Promise<{
    items: CasinoDTO[];
    cursor: string | null;
  }>;

  /**
   * Get casino by ID.
   * Returns null if not found.
   */
  getById(casinoId: string): Promise<CasinoDTO | null>;

  /**
   * Create a new casino.
   */
  create(input: CreateCasinoDTO): Promise<CasinoDTO>;

  /**
   * Update an existing casino.
   */
  update(casinoId: string, input: UpdateCasinoDTO): Promise<CasinoDTO>;

  /**
   * Delete a casino (soft delete via status change).
   */
  delete(casinoId: string): Promise<void>;

  // === Casino Settings ===

  /**
   * Get settings for a casino.
   * RLS automatically scopes to authenticated user's casino.
   */
  getSettings(casinoId: string): Promise<CasinoSettingsDTO | null>;

  /**
   * Update casino settings.
   * Warning: Changing timezone or gaming_day_start_time affects all downstream services.
   */
  updateSettings(
    casinoId: string,
    input: UpdateCasinoSettingsDTO,
  ): Promise<CasinoSettingsDTO>;

  // === Staff Management ===

  /**
   * List staff with pagination and filters.
   * RLS scopes results to the casino.
   */
  listStaff(filters?: CasinoStaffFilters): Promise<{
    items: StaffDTO[];
    cursor: string | null;
  }>;

  /**
   * Get staff member by ID.
   * Returns null if not found.
   */
  getStaffById(staffId: string): Promise<StaffDTO | null>;

  /**
   * Create a staff member.
   * Enforces role constraint: dealer cannot have user_id; pit_boss/admin must have user_id.
   */
  createStaff(input: CreateStaffDTO): Promise<StaffDTO>;

  // === Gaming Day ===

  /**
   * Compute the gaming day for a given timestamp.
   * Uses casino's gaming_day_start_time and timezone settings.
   *
   * @param casinoId - Casino UUID
   * @param timestamp - Optional ISO 8601 timestamp (defaults to now)
   */
  computeGamingDay(casinoId: string, timestamp?: string): Promise<GamingDayDTO>;
}

// === Service Factory ===

/**
 * Creates a CasinoService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createCasinoService(
  supabase: SupabaseClient<Database>,
): CasinoServiceInterface {
  return {
    // === Casino CRUD (delegated to crud.ts) ===

    list: (filters) => crud.listCasinos(supabase, filters),

    getById: (casinoId) => crud.getCasinoById(supabase, casinoId),

    create: (input) => crud.createCasino(supabase, input),

    update: (casinoId, input) => crud.updateCasino(supabase, casinoId, input),

    delete: (casinoId) => crud.deleteCasino(supabase, casinoId),

    // === Casino Settings (delegated to crud.ts) ===

    getSettings: (casinoId) => crud.getCasinoSettings(supabase, casinoId),

    updateSettings: (casinoId, input) =>
      crud.updateCasinoSettings(supabase, casinoId, input),

    // === Staff Management (delegated to crud.ts) ===

    listStaff: (filters) => crud.listStaff(supabase, filters),

    getStaffById: (staffId) => crud.getStaffById(supabase, staffId),

    createStaff: (input) => crud.createStaff(supabase, input),

    // === Gaming Day (business logic, not pure CRUD) ===

    async computeGamingDay(casinoId, timestamp) {
      // Get casino settings for timezone
      const settings = await crud.getCasinoSettings(supabase, casinoId);
      if (!settings) {
        throw new DomainError('CASINO_SETTINGS_NOT_FOUND');
      }

      const rpcArgs: { p_casino_id: string; p_timestamp?: string } = {
        p_casino_id: casinoId,
      };
      if (timestamp) {
        rpcArgs.p_timestamp = timestamp;
      }

      const { data, error } = await supabase.rpc('compute_gaming_day', rpcArgs);

      if (error) {
        throw new DomainError('INTERNAL_ERROR', error.message, {
          details: error,
        });
      }

      // RPC returns ISO date string (YYYY-MM-DD)
      return {
        gaming_day: data as string,
        casino_id: casinoId,
        computed_at: new Date().toISOString(),
        timezone: settings.timezone,
      };
    },
  };
}

// Re-export CRUD functions for direct use in server actions
export {
  createCasino,
  createStaff,
  deleteCasino,
  getCasinoById,
  getCasinoSettings,
  getStaffById,
  listCasinos,
  listStaff,
  updateCasino,
  updateCasinoSettings,
} from './crud';
