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
import { reconcileStaffClaims } from '@/lib/supabase/claims-reconcile';
import type { Database } from '@/types/database.types';

import type {
  AcceptInviteInput,
  AcceptInviteResult,
  BootstrapCasinoInput,
  BootstrapCasinoResult,
  CasinoDTO,
  CasinoListFilters,
  CasinoSettingsDTO,
  CasinoStaffFilters,
  CreateCasinoDTO,
  CreateInviteInput,
  CreateInviteResult,
  CreateStaffDTO,
  StaffDTO,
  StaffInviteDTO,
  UpdateCasinoDTO,
  UpdateCasinoSettingsDTO,
  UpdateStaffDTO,
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
  toStaffInviteDTOList,
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

  // AUTH-HARDENING WS3: Deterministic claims sync — errors propagate
  await reconcileStaffClaims({
    staffId: data.id,
    userId: input.user_id ?? null,
    casinoId: input.casino_id,
    staffRole: input.role,
    currentStatus: 'active',
  });

  return toStaffDTO(data);
}

/**
 * Update an existing staff member.
 * Syncs JWT claims if role or casino_id changes (ADR-015 Phase 2).
 */
export async function updateStaff(
  supabase: SupabaseClient<Database>,
  staffId: string,
  input: UpdateStaffDTO,
): Promise<StaffDTO> {
  // Get current staff record to check if user_id exists and if role/casino changed
  // Need full row with user_id for JWT sync, not DTO
  const { data: currentRow, error: fetchError } = await supabase
    .from('staff')
    .select('*')
    .eq('id', staffId)
    .maybeSingle();

  if (fetchError) {
    throw new DomainError('INTERNAL_ERROR', fetchError.message, {
      details: fetchError,
    });
  }

  if (!currentRow) {
    throw new DomainError('STAFF_NOT_FOUND');
  }

  const updateData: Record<string, unknown> = {};
  if (input.first_name !== undefined) updateData.first_name = input.first_name;
  if (input.last_name !== undefined) updateData.last_name = input.last_name;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.employee_id !== undefined)
    updateData.employee_id = input.employee_id;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.casino_id !== undefined) updateData.casino_id = input.casino_id;
  if (input.user_id !== undefined) updateData.user_id = input.user_id;
  if (input.status !== undefined) updateData.status = input.status;

  const { data, error } = await supabase
    .from('staff')
    .update(updateData)
    .eq('id', staffId)
    .select(STAFF_SELECT_PUBLIC)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('STAFF_NOT_FOUND');
    }
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

  // AUTH-HARDENING WS3: Deterministic claims reconciliation — errors propagate
  await reconcileStaffClaims({
    staffId: data.id,
    userId:
      input.user_id !== undefined
        ? (input.user_id ?? null)
        : (currentRow.user_id ?? null),
    casinoId: data.casino_id ?? currentRow.casino_id,
    staffRole: data.role,
    currentStatus: input.status ?? currentRow.status,
    previousUserId: currentRow.user_id,
    previousCasinoId: currentRow.casino_id,
    previousStatus: currentRow.status,
  });

  return toStaffDTO(data);
}

// === Player Enrollment (ADR-022 SLAD Fix) ===

/**
 * Enroll player in a casino.
 *
 * SLAD ownership: CasinoService owns player_casino table per bounded context.
 * This is the canonical enrollment operation.
 *
 * Idempotent - returns existing enrollment if already enrolled.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player identifier
 * @param casinoId - Casino identifier
 * @param enrolledBy - Staff member who enrolled the player
 * @returns Enrollment DTO
 *
 * @throws {DomainError} PLAYER_NOT_FOUND - Player doesn't exist
 * @throws {DomainError} INTERNAL_ERROR - Database error
 *
 * @see ADR-022 EXEC-SPEC Section 8.3
 * @see DOD-022 Section B7 - Bounded Context Ownership
 */
export async function enrollPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
  enrolledBy: string,
): Promise<PlayerEnrollmentDTO> {
  // Step 1: Create player_casino enrollment
  const { data, error } = await supabase
    .from('player_casino')
    .upsert(
      {
        player_id: playerId,
        casino_id: casinoId,
        enrolled_by: enrolledBy,
        status: 'active',
      },
      {
        onConflict: 'player_id,casino_id',
      },
    )
    .select('player_id, casino_id, status, enrolled_at, enrolled_by')
    .single();

  if (error) {
    if (error.code === '23503') {
      throw new DomainError('PLAYER_NOT_FOUND', 'Player does not exist');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  // NOTE: player_loyalty is created atomically by rpc_create_player (SECURITY DEFINER).
  // CasinoService must NOT write to player_loyalty (SRM bounded-context: LoyaltyService owns it).
  // See ISSUE-B5894ED8 remediation path for rationale.

  return toPlayerEnrollmentDTO(data);
}

// === Type Definitions for Enrollment ===

type PlayerEnrollmentDTO = {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
  enrolled_by: string | null;
};

function toPlayerEnrollmentDTO(row: {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
  enrolled_by: string | null;
}): PlayerEnrollmentDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    status: row.status,
    enrolled_at: row.enrolled_at,
    enrolled_by: row.enrolled_by,
  };
}

// === Onboarding (PRD-025) ===

/**
 * Bootstrap a new casino tenant — atomic casino + settings + admin staff.
 * Calls reconcileStaffClaims after success (ADR-030 D2).
 */
export async function bootstrapCasino(
  supabase: SupabaseClient<Database>,
  input: BootstrapCasinoInput,
): Promise<BootstrapCasinoResult> {
  const { data, error } = await supabase.rpc('rpc_bootstrap_casino', {
    p_casino_name: input.casino_name,
    p_timezone: input.timezone,
    p_gaming_day_start: input.gaming_day_start,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DomainError('STAFF_ALREADY_BOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new DomainError('INTERNAL_ERROR', 'Bootstrap RPC returned no data');
  }

  const result: BootstrapCasinoResult = {
    casino_id: row.casino_id,
    staff_id: row.staff_id,
    staff_role: row.staff_role,
  };

  // Sync JWT claims for the new admin (ADR-030 D2)
  await reconcileStaffClaims({
    staffId: result.staff_id,
    userId: (await supabase.auth.getUser()).data.user?.id ?? null,
    casinoId: result.casino_id,
    staffRole: result.staff_role,
    currentStatus: 'active',
  });

  return result;
}

/**
 * Create a staff invite (admin-only).
 * RPC handles context derivation, admin validation, and token hashing.
 */
export async function createStaffInvite(
  supabase: SupabaseClient<Database>,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const { data, error } = await supabase.rpc('rpc_create_staff_invite', {
    p_email: input.email,
    p_role: input.role,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DomainError('INVITE_ALREADY_EXISTS');
    }
    if (error.code === 'P0001') {
      throw new DomainError('FORBIDDEN');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Create invite RPC returned no data',
    );
  }

  return {
    invite_id: row.invite_id,
    raw_token: row.raw_token,
    expires_at: row.expires_at,
  };
}

/**
 * Accept a staff invite — creates staff binding.
 * Calls reconcileStaffClaims after success (ADR-030 D2).
 */
export async function acceptStaffInvite(
  supabase: SupabaseClient<Database>,
  input: AcceptInviteInput,
): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc('rpc_accept_staff_invite', {
    p_token: input.token,
  });

  if (error) {
    if (error.code === 'P0002') {
      throw new DomainError('INVITE_NOT_FOUND');
    }
    if (error.code === 'P0003') {
      throw new DomainError('INVITE_EXPIRED');
    }
    if (error.code === '23505') {
      throw new DomainError('STAFF_ALREADY_BOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Accept invite RPC returned no data',
    );
  }

  const result: AcceptInviteResult = {
    staff_id: row.staff_id,
    casino_id: row.casino_id,
    staff_role: row.staff_role,
  };

  // Sync JWT claims for the new staff member (ADR-030 D2)
  await reconcileStaffClaims({
    staffId: result.staff_id,
    userId: (await supabase.auth.getUser()).data.user?.id ?? null,
    casinoId: result.casino_id,
    staffRole: result.staff_role,
    currentStatus: 'active',
  });

  return result;
}

/**
 * List staff invites for the current casino (admin-only, RLS-scoped).
 * Excludes token_hash — column-level REVOKE prevents reading it anyway.
 */
export async function listStaffInvites(
  supabase: SupabaseClient<Database>,
): Promise<StaffInviteDTO[]> {
  const { data, error } = await supabase
    .from('staff_invite')
    .select(
      'id, casino_id, email, staff_role, expires_at, accepted_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toStaffInviteDTOList(data ?? []);
}
