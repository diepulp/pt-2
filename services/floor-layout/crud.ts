/**
 * FloorLayoutService CRUD Operations
 *
 * Database operations for floor layout management.
 * Pattern B: Canonical CRUD with select projections and mappers.
 *
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 1580-1719
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  AssignOrMoveResultDTO,
  ClearResultDTO,
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
  PitAssignmentStateDTO,
} from './dtos';
import {
  toAssignOrMoveResultDTO,
  toClearResultDTO,
  toFloorLayoutDTO,
  toFloorLayoutDTOList,
  toFloorLayoutVersionDTO,
  toFloorLayoutVersionDTOList,
  toFloorLayoutVersionWithSlotsDTO,
  toFloorPitDTOList,
  toFloorTableSlotDTOList,
  toPitAssignmentStateDTO,
} from './mappers';

// === Layout CRUD ===

/**
 * List floor layouts with pagination.
 */
export async function listLayouts(
  supabase: SupabaseClient<Database>,
  filters: FloorLayoutListFilters,
): Promise<{ items: FloorLayoutDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('floor_layout')
    .select('*')
    .eq('casino_id', filters.casino_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.cursor) {
    query = query.lt('created_at', filters.cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = toFloorLayoutDTOList(data);
  const nextCursor =
    items.length === limit ? items[items.length - 1]?.created_at : null;

  return { items, cursor: nextCursor ?? null };
}

/**
 * Get a floor layout by ID.
 */
export async function getLayoutById(
  supabase: SupabaseClient<Database>,
  layoutId: string,
): Promise<FloorLayoutDTO | null> {
  const { data, error } = await supabase
    .from('floor_layout')
    .select('*')
    .eq('id', layoutId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return toFloorLayoutDTO(data);
}

// === Version CRUD ===

/**
 * List versions for a layout.
 */
export async function listVersions(
  supabase: SupabaseClient<Database>,
  filters: FloorLayoutVersionFilters,
): Promise<{
  items: FloorLayoutVersionDTO[] | FloorLayoutVersionWithSlotsDTO[];
}> {
  let query = supabase
    .from('floor_layout_version')
    .select('*')
    .eq('layout_id', filters.layout_id)
    .order('version_no', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const versions = toFloorLayoutVersionDTOList(data);
  const includeSlots = filters.include_slots ?? false;

  if (!includeSlots || versions.length === 0) {
    return { items: versions };
  }

  // Fetch pits and slots for all versions
  const versionIds = versions.map((v) => v.id);

  const [pitsResult, slotsResult] = await Promise.all([
    supabase.from('floor_pit').select('*').in('layout_version_id', versionIds),
    supabase
      .from('floor_table_slot')
      .select('*')
      .in('layout_version_id', versionIds),
  ]);

  if (pitsResult.error) throw pitsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const pits = toFloorPitDTOList(pitsResult.data);
  const slots = toFloorTableSlotDTOList(slotsResult.data);

  // Group by version
  const pitsByVersion = new Map<string, typeof pits>();
  pits.forEach((pit) => {
    const list = pitsByVersion.get(pit.layout_version_id) ?? [];
    list.push(pit);
    pitsByVersion.set(pit.layout_version_id, list);
  });

  const slotsByVersion = new Map<string, typeof slots>();
  slots.forEach((slot) => {
    const list = slotsByVersion.get(slot.layout_version_id) ?? [];
    list.push(slot);
    slotsByVersion.set(slot.layout_version_id, list);
  });

  const enriched: FloorLayoutVersionWithSlotsDTO[] = versions.map((version) =>
    toFloorLayoutVersionWithSlotsDTO(
      version,
      pitsByVersion.get(version.id) ?? [],
      slotsByVersion.get(version.id) ?? [],
    ),
  );

  return { items: enriched };
}

/**
 * Get a version by ID.
 */
export async function getVersionById(
  supabase: SupabaseClient<Database>,
  versionId: string,
): Promise<FloorLayoutVersionDTO | null> {
  const { data, error } = await supabase
    .from('floor_layout_version')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return toFloorLayoutVersionDTO(data);
}

// === Activation CRUD ===

/**
 * Get active floor layout for a casino.
 * Returns the currently activated layout.
 */
export async function getActiveLayout(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<import('./dtos').FloorLayoutActivationDTO | null> {
  const { data, error } = await supabase
    .from('floor_layout_activation')
    .select('*')
    .eq('casino_id', casinoId)
    .is('deactivated_at', null)
    .order('activated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// === Pit Assignment Operations (PRD-067) ===

/**
 * Map RPC exception messages raised by rpc_assign_or_move_table_to_slot /
 * rpc_clear_slot_assignment to typed DomainErrors.
 *
 * The RPCs RAISE EXCEPTION with a 'CODE: message' prefix (e.g.
 * 'SLOT_NOT_FOUND: slot ... does not exist'). The prefix is the domain code.
 */
function mapPitAssignmentRpcError(error: {
  code?: string;
  message: string;
}): DomainError {
  const prefix = error.message.split(':')[0]?.trim() ?? '';

  switch (prefix) {
    case 'UNAUTHORIZED':
      return new DomainError('UNAUTHORIZED', error.message, {
        details: safeErrorDetails(error),
      });
    case 'FORBIDDEN_ADMIN_REQUIRED':
      return new DomainError('FORBIDDEN_ADMIN_REQUIRED', error.message, {
        httpStatus: 403,
        details: safeErrorDetails(error),
      });
    case 'NO_ACTIVE_LAYOUT':
      return new DomainError('NO_ACTIVE_LAYOUT', error.message, {
        httpStatus: 409,
        details: safeErrorDetails(error),
      });
    case 'SLOT_NOT_FOUND':
      return new DomainError('SLOT_NOT_FOUND', error.message, {
        details: safeErrorDetails(error),
      });
    case 'SLOT_NOT_ACTIVE':
      return new DomainError('SLOT_NOT_ACTIVE', error.message, {
        httpStatus: 409,
        details: safeErrorDetails(error),
      });
    case 'SLOT_HAS_NO_PIT':
      return new DomainError('SLOT_HAS_NO_PIT', error.message, {
        httpStatus: 422,
        details: safeErrorDetails(error),
      });
    case 'SLOT_OCCUPIED':
      return new DomainError('SLOT_OCCUPIED', error.message, {
        httpStatus: 409,
        details: safeErrorDetails(error),
      });
    case 'TABLE_NOT_FOUND':
      return new DomainError('TABLE_NOT_FOUND', error.message, {
        details: safeErrorDetails(error),
      });
    case 'CROSS_CASINO_FORBIDDEN':
      return new DomainError('CROSS_CASINO_FORBIDDEN', error.message, {
        httpStatus: 403,
        details: safeErrorDetails(error),
      });
    case 'PIT_NOT_FOUND':
      return new DomainError('PIT_NOT_FOUND', error.message, {
        details: safeErrorDetails(error),
      });
    default:
      return new DomainError('INTERNAL_ERROR', error.message, {
        details: safeErrorDetails(error),
      });
  }
}

/**
 * Get the flat aggregate state powering the admin pit-configuration panel.
 * Scoped to the casino's single active layout version (see DEC-003).
 * Returns null when the casino has no active layout.
 */
export async function getPitAssignmentState(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<PitAssignmentStateDTO | null> {
  // Resolve the active layout_version_id deterministically. Matches the
  // RPC's active-layout selection (most-recent activation row with
  // deactivated_at IS NULL).
  const activation = await supabase
    .from('floor_layout_activation')
    .select('layout_version_id')
    .eq('casino_id', casinoId)
    .is('deactivated_at', null)
    .order('activated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activation.error) {
    throw new DomainError('INTERNAL_ERROR', activation.error.message, {
      details: safeErrorDetails(activation.error),
    });
  }
  if (!activation.data) return null;

  const layoutVersionId = activation.data.layout_version_id;

  const [pitsResult, slotsResult, tablesResult] = await Promise.all([
    supabase
      .from('floor_pit')
      .select('*')
      .eq('layout_version_id', layoutVersionId),
    supabase
      .from('floor_table_slot')
      .select('*')
      .eq('layout_version_id', layoutVersionId),
    supabase
      .from('gaming_table')
      .select('id, label, type, status')
      .eq('casino_id', casinoId),
  ]);

  if (pitsResult.error) {
    throw new DomainError('INTERNAL_ERROR', pitsResult.error.message, {
      details: safeErrorDetails(pitsResult.error),
    });
  }
  if (slotsResult.error) {
    throw new DomainError('INTERNAL_ERROR', slotsResult.error.message, {
      details: safeErrorDetails(slotsResult.error),
    });
  }
  if (tablesResult.error) {
    throw new DomainError('INTERNAL_ERROR', tablesResult.error.message, {
      details: safeErrorDetails(tablesResult.error),
    });
  }

  return toPitAssignmentStateDTO({
    layoutVersionId,
    pitRows: pitsResult.data ?? [],
    slotRows: slotsResult.data ?? [],
    allCasinoTables: tablesResult.data ?? [],
  });
}

/**
 * Assign a table to a slot, or move it from its current slot to the target.
 * Wraps rpc_assign_or_move_table_to_slot (ADR-024 INV-8 — no casino/actor params).
 */
export async function assignOrMoveTableToSlot(
  supabase: SupabaseClient<Database>,
  tableId: string,
  slotId: string,
): Promise<AssignOrMoveResultDTO> {
  const { data, error } = await supabase.rpc(
    'rpc_assign_or_move_table_to_slot',
    {
      p_table_id: tableId,
      p_slot_id: slotId,
    },
  );

  if (error) throw mapPitAssignmentRpcError(error);
  if (!data) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'rpc_assign_or_move_table_to_slot returned no data',
    );
  }

  return toAssignOrMoveResultDTO(data);
}

/**
 * Clear a slot's table assignment. Idempotent for already-empty slots.
 * Wraps rpc_clear_slot_assignment (ADR-024 INV-8 — no casino/actor params).
 */
export async function clearSlotAssignment(
  supabase: SupabaseClient<Database>,
  slotId: string,
): Promise<ClearResultDTO> {
  const { data, error } = await supabase.rpc('rpc_clear_slot_assignment', {
    p_slot_id: slotId,
  });

  if (error) throw mapPitAssignmentRpcError(error);
  if (!data) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'rpc_clear_slot_assignment returned no data',
    );
  }

  return toClearResultDTO(data);
}
