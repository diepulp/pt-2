/**
 * CasinoService CRUD Operations
 *
 * Low-level database operations for casino, casino_settings, and staff tables.
 * These functions can be used directly in server actions or through CasinoService.
 *
 * Pattern B (Canonical CRUD) per SLAD §341-342.
 *
 * @see SPEC-PRD-000-casino-foundation.md
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §882-1006
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CasinoDTO,
  CasinoListFilters,
  CasinoSettingsDTO,
  CasinoStaffFilters,
  CreateCasinoDTO,
  CreateStaffDTO,
  StaffDTO,
  UpdateCasinoDTO,
  UpdateCasinoSettingsDTO,
} from './dtos';
import {
  toCasinoDTO,
  toCasinoDTOList,
  toCasinoDTOOrNull,
  toCasinoSettingsDTO,
  toCasinoSettingsDTOOrNull,
  toStaffDTO,
  toStaffDTOList,
  toStaffDTOOrNull,
} from './mappers';
import {
  CASINO_SELECT_PUBLIC,
  CASINO_SETTINGS_SELECT,
  STAFF_SELECT_PUBLIC,
  STAFF_SELECT_PUBLIC_LIST,
} from './selects';

// === Casino CRUD ===

/**
 * List casinos with pagination and filters.
 */
export async function listCasinos(
  supabase: SupabaseClient<Database>,
  filters: CasinoListFilters = {},
): Promise<{ items: CasinoDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('casino')
    .select(CASINO_SELECT_PUBLIC)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.cursor) {
    query = query.lt('created_at', filters.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  const hasMore = (data?.length ?? 0) > limit;
  const items = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore ? items[items.length - 1]?.created_at : null;

  return { items: toCasinoDTOList(items), cursor };
}

/**
 * Get casino by ID.
 */
export async function getCasinoById(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<CasinoDTO | null> {
  const { data, error } = await supabase
    .from('casino')
    .select(CASINO_SELECT_PUBLIC)
    .eq('id', casinoId)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toCasinoDTOOrNull(data);
}

/**
 * Create a new casino.
 */
export async function createCasino(
  supabase: SupabaseClient<Database>,
  input: CreateCasinoDTO,
): Promise<CasinoDTO> {
  const { data, error } = await supabase
    .from('casino')
    .insert({
      name: input.name,
      location: input.location ?? null,
      address: input.address ?? null,
      company_id: input.company_id ?? null,
    })
    .select(CASINO_SELECT_PUBLIC)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DomainError('UNIQUE_VIOLATION', 'Casino already exists');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toCasinoDTO(data);
}

/**
 * Update an existing casino.
 */
export async function updateCasino(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  input: UpdateCasinoDTO,
): Promise<CasinoDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.address !== undefined) updateData.address = input.address;
  if (input.company_id !== undefined) updateData.company_id = input.company_id;

  const { data, error } = await supabase
    .from('casino')
    .update(updateData)
    .eq('id', casinoId)
    .select(CASINO_SELECT_PUBLIC)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('CASINO_NOT_FOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toCasinoDTO(data);
}

/**
 * Delete a casino (soft delete via status change).
 */
export async function deleteCasino(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<void> {
  const { error } = await supabase
    .from('casino')
    .update({ status: 'inactive' })
    .eq('id', casinoId);

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('CASINO_NOT_FOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }
}

// === Casino Settings CRUD ===

/**
 * Get settings for a casino.
 */
export async function getCasinoSettings(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<CasinoSettingsDTO | null> {
  const { data, error } = await supabase
    .from('casino_settings')
    .select(CASINO_SETTINGS_SELECT)
    .eq('casino_id', casinoId)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toCasinoSettingsDTOOrNull(data);
}

/**
 * Update casino settings.
 */
export async function updateCasinoSettings(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  input: UpdateCasinoSettingsDTO,
): Promise<CasinoSettingsDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.gaming_day_start_time !== undefined) {
    updateData.gaming_day_start_time = input.gaming_day_start_time;
  }
  if (input.timezone !== undefined) {
    updateData.timezone = input.timezone;
  }
  if (input.watchlist_floor !== undefined) {
    updateData.watchlist_floor = input.watchlist_floor;
  }
  if (input.ctr_threshold !== undefined) {
    updateData.ctr_threshold = input.ctr_threshold;
  }

  const { data, error } = await supabase
    .from('casino_settings')
    .update(updateData)
    .eq('casino_id', casinoId)
    .select(CASINO_SETTINGS_SELECT)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('CASINO_SETTINGS_NOT_FOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toCasinoSettingsDTO(data);
}

// === Staff CRUD ===

/**
 * List staff with pagination and filters.
 */
export async function listStaff(
  supabase: SupabaseClient<Database>,
  filters: CasinoStaffFilters = {},
): Promise<{ items: StaffDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('staff')
    .select(STAFF_SELECT_PUBLIC_LIST)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.role) {
    query = query.eq('role', filters.role);
  }

  if (filters.cursor) {
    query = query.lt('created_at', filters.cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  const hasMore = (data?.length ?? 0) > limit;
  const items = hasMore ? data!.slice(0, limit) : (data ?? []);
  // Extract cursor from raw data before mapping (staff row has created_at)
  const cursor = hasMore ? (items[items.length - 1]?.created_at ?? null) : null;

  return { items: toStaffDTOList(items), cursor };
}

/**
 * Get staff member by ID.
 */
export async function getStaffById(
  supabase: SupabaseClient<Database>,
  staffId: string,
): Promise<StaffDTO | null> {
  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_SELECT_PUBLIC)
    .eq('id', staffId)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toStaffDTOOrNull(data);
}

/**
 * Create a staff member.
 * Enforces role constraint: dealer cannot have user_id; pit_boss/admin must have user_id.
 */
export async function createStaff(
  supabase: SupabaseClient<Database>,
  input: CreateStaffDTO,
): Promise<StaffDTO> {
  // Validate role constraint
  if (input.role === 'dealer' && input.user_id) {
    throw new DomainError('STAFF_ROLE_CONSTRAINT_VIOLATION');
  }
  if ((input.role === 'pit_boss' || input.role === 'admin') && !input.user_id) {
    throw new DomainError('STAFF_ROLE_CONSTRAINT_VIOLATION');
  }

  const { data, error } = await supabase
    .from('staff')
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      role: input.role,
      employee_id: input.employee_id ?? null,
      email: input.email ?? null,
      casino_id: input.casino_id,
      user_id: input.user_id ?? null,
    })
    .select(STAFF_SELECT_PUBLIC)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DomainError(
        'STAFF_ALREADY_EXISTS',
        'Staff member already exists',
      );
    }
    if (error.code === '23503') {
      throw new DomainError('CASINO_NOT_FOUND', 'Casino does not exist');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toStaffDTO(data);
}
