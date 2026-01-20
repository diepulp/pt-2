/**
 * MTLService CRUD Operations
 *
 * Append-only ledger operations for AML/CTR compliance tracking.
 * Uses direct Supabase queries with RLS enforcement.
 *
 * Pattern A (Contract-First) per SLAD section 341-342.
 *
 * IMPORTANT: MTL entries are IMMUTABLE. No update or delete operations exist.
 * This is enforced at multiple levels:
 * - RLS policies (no UPDATE/DELETE policies)
 * - REVOKE privileges
 * - BEFORE triggers (belt+suspenders)
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 * @see ADR-024 RLS Context Injection
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CreateMtlAuditNoteInput,
  CreateMtlEntryInput,
  MtlAuditNoteDTO,
  MtlEntryDTO,
  MtlEntryFilters,
  MtlEntryWithNotesDTO,
  MtlGamingDaySummaryDTO,
  MtlGamingDaySummaryFilters,
  CasinoThresholds,
} from './dtos';
import {
  mapMtlEntryRow,
  mapMtlEntryRowList,
  mapMtlEntryWithNotesRow,
  mapMtlAuditNoteRow,
  mapMtlAuditNoteRowList,
  mapGamingDaySummaryRowList,
  DEFAULT_THRESHOLDS,
  type MtlEntryWithNotesRow,
} from './mappers';
import {
  MTL_ENTRY_SELECT,
  MTL_ENTRY_DETAIL_SELECT,
  MTL_AUDIT_NOTE_SELECT,
  MTL_GAMING_DAY_SUMMARY_SELECT,
} from './selects';

// ============================================================================
// Error Mapping
// ============================================================================

/**
 * Maps Postgres error codes to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || '';

  // Handle RPC-raised exceptions
  if (message.includes('MTL_ENTRY_NOT_FOUND')) {
    return new DomainError('MTL_ENTRY_NOT_FOUND', 'MTL entry not found');
  }

  if (message.includes('MTL_IMMUTABLE_ENTRY')) {
    return new DomainError(
      'MTL_IMMUTABLE_ENTRY',
      'MTL entry cannot be modified after creation',
    );
  }

  // 23505 = Unique constraint violation (idempotency key)
  if (error.code === '23505') {
    // This is expected for idempotent writes - handled specially in createEntry
    return new DomainError(
      'UNIQUE_VIOLATION',
      'Entry with this idempotency key already exists',
    );
  }

  // 23503 = Foreign key violation
  if (error.code === '23503') {
    if (message.includes('patron_uuid')) {
      return new DomainError('NOT_FOUND', 'Referenced patron not found');
    }
    if (message.includes('casino_id')) {
      return new DomainError('NOT_FOUND', 'Referenced casino not found');
    }
    if (message.includes('mtl_entry_id')) {
      return new DomainError(
        'MTL_ENTRY_NOT_FOUND',
        'Referenced MTL entry not found',
      );
    }
    return new DomainError(
      'FOREIGN_KEY_VIOLATION',
      'Referenced resource not found',
    );
  }

  // PGRST116 = No rows returned (not found)
  if (error.code === 'PGRST116') {
    return new DomainError('MTL_ENTRY_NOT_FOUND', 'MTL entry not found');
  }

  return new DomainError('INTERNAL_ERROR', error.message, { details: error });
}

// ============================================================================
// Threshold Fetching
// ============================================================================

/**
 * Fetch casino thresholds from casino_settings.
 * Falls back to defaults if not found.
 *
 * IMPORTANT: casino_settings stores thresholds in DOLLARS,
 * but all amounts in the system use CENTS (per ISSUE-FB8EB717).
 * This function converts dollars to cents for consistent comparison.
 */
async function getCasinoThresholds(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<CasinoThresholds> {
  const { data, error } = await supabase
    .from('casino_settings')
    .select('watchlist_floor, ctr_threshold')
    .eq('casino_id', casinoId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_THRESHOLDS;
  }

  // Convert dollars to cents (casino_settings stores in dollars, amounts are in cents)
  const DOLLARS_TO_CENTS = 100;

  return {
    watchlistFloor: data.watchlist_floor
      ? data.watchlist_floor * DOLLARS_TO_CENTS
      : DEFAULT_THRESHOLDS.watchlistFloor,
    ctrThreshold: data.ctr_threshold
      ? data.ctr_threshold * DOLLARS_TO_CENTS
      : DEFAULT_THRESHOLDS.ctrThreshold,
  };
}

// ============================================================================
// Create Operations (Append-Only)
// ============================================================================

/**
 * Create a new MTL entry.
 * Idempotent - returns existing entry if idempotency_key matches.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - CreateMtlEntryInput
 * @returns MtlEntryDTO with computed entry_badge
 * @throws UNIQUE_VIOLATION if duplicate idempotency_key (handled as existing return)
 */
export async function createEntry(
  supabase: SupabaseClient<Database>,
  input: CreateMtlEntryInput,
): Promise<MtlEntryDTO> {
  // Prepare insert data
  const insertData = {
    patron_uuid: input.patron_uuid,
    casino_id: input.casino_id,
    staff_id: input.staff_id ?? null,
    rating_slip_id: input.rating_slip_id ?? null,
    visit_id: input.visit_id ?? null,
    amount: input.amount,
    direction: input.direction,
    txn_type: input.txn_type,
    source: input.source ?? 'table',
    area: input.area ?? null,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    idempotency_key: input.idempotency_key,
  };

  // Attempt insert
  const { data, error } = await supabase
    .from('mtl_entry')
    .insert(insertData)
    .select(MTL_ENTRY_SELECT)
    .single();

  // Handle idempotency - if duplicate key, fetch existing entry
  if (error?.code === '23505') {
    const { data: existing, error: fetchError } = await supabase
      .from('mtl_entry')
      .select(MTL_ENTRY_SELECT)
      .eq('casino_id', input.casino_id)
      .eq('idempotency_key', input.idempotency_key)
      .single();

    if (fetchError) throw mapDatabaseError(fetchError);
    if (!existing) {
      throw new DomainError(
        'MTL_ENTRY_NOT_FOUND',
        'Idempotent entry not found',
      );
    }

    const thresholds = await getCasinoThresholds(supabase, input.casino_id);
    return mapMtlEntryRow(existing, thresholds);
  }

  if (error) throw mapDatabaseError(error);
  if (!data) {
    throw new DomainError('INTERNAL_ERROR', 'Insert returned no data');
  }

  const thresholds = await getCasinoThresholds(supabase, input.casino_id);
  return mapMtlEntryRow(data, thresholds);
}

/**
 * Create an audit note for an MTL entry.
 * Append-only - notes cannot be modified after creation.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - CreateMtlAuditNoteInput
 * @returns MtlAuditNoteDTO
 * @throws MTL_ENTRY_NOT_FOUND if referenced entry doesn't exist
 */
export async function createAuditNote(
  supabase: SupabaseClient<Database>,
  input: CreateMtlAuditNoteInput,
): Promise<MtlAuditNoteDTO> {
  const { data, error } = await supabase
    .from('mtl_audit_note')
    .insert({
      mtl_entry_id: input.mtl_entry_id,
      staff_id: input.staff_id,
      note: input.note,
    })
    .select(MTL_AUDIT_NOTE_SELECT)
    .single();

  if (error) throw mapDatabaseError(error);
  if (!data) {
    throw new DomainError('INTERNAL_ERROR', 'Insert returned no data');
  }

  return mapMtlAuditNoteRow(data);
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get MTL entry by ID with audit notes.
 *
 * @param supabase - Supabase client with RLS context
 * @param entryId - Entry UUID
 * @returns MtlEntryWithNotesDTO
 * @throws MTL_ENTRY_NOT_FOUND if entry doesn't exist
 */
export async function getEntryById(
  supabase: SupabaseClient<Database>,
  entryId: string,
): Promise<MtlEntryWithNotesDTO> {
  const { data, error } = await supabase
    .from('mtl_entry')
    .select(MTL_ENTRY_DETAIL_SELECT)
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  if (!data) {
    throw new DomainError(
      'MTL_ENTRY_NOT_FOUND',
      `MTL entry not found: ${entryId}`,
    );
  }

  const thresholds = await getCasinoThresholds(supabase, data.casino_id);

  // Build typed row from query result (avoids `as` assertion)
  const rowWithNotes: MtlEntryWithNotesRow = {
    id: data.id,
    patron_uuid: data.patron_uuid,
    casino_id: data.casino_id,
    staff_id: data.staff_id,
    rating_slip_id: data.rating_slip_id,
    visit_id: data.visit_id,
    amount: data.amount,
    direction: data.direction,
    txn_type: data.txn_type,
    source: data.source,
    area: data.area,
    gaming_day: data.gaming_day,
    occurred_at: data.occurred_at,
    created_at: data.created_at,
    idempotency_key: data.idempotency_key,
    mtl_audit_note: data.mtl_audit_note ?? [],
  };

  return mapMtlEntryWithNotesRow(rowWithNotes, thresholds);
}

/**
 * List MTL entries with filters and cursor pagination.
 *
 * @param supabase - Supabase client with RLS context
 * @param filters - MtlEntryFilters
 * @returns Paginated list of MtlEntryDTO
 */
export async function listEntries(
  supabase: SupabaseClient<Database>,
  filters: MtlEntryFilters,
): Promise<{ items: MtlEntryDTO[]; next_cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('mtl_entry')
    .select(MTL_ENTRY_SELECT)
    .eq('casino_id', filters.casino_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  // Apply optional filters
  if (filters.patron_uuid) {
    query = query.eq('patron_uuid', filters.patron_uuid);
  }

  if (filters.gaming_day) {
    query = query.eq('gaming_day', filters.gaming_day);
  }

  if (filters.min_amount !== undefined) {
    query = query.gte('amount', filters.min_amount);
  }

  if (filters.txn_type) {
    query = query.eq('txn_type', filters.txn_type);
  }

  if (filters.source) {
    query = query.eq('source', filters.source);
  }

  // Handle cursor pagination using (created_at, id) keyset
  if (filters.cursor) {
    // Cursor format: "created_at|id"
    const [cursorCreatedAt, cursorId] = filters.cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      // Keyset pagination: (created_at, id) < (cursor_created_at, cursor_id)
      query = query.or(
        `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
      );
    }
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  const thresholds = await getCasinoThresholds(supabase, filters.casino_id);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);

  // Generate next cursor from last item
  const lastItem = rawItems[rawItems.length - 1];
  const nextCursor =
    hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null;

  // Filter by entry_badge if specified (computed at read time)
  let items = mapMtlEntryRowList(rawItems, thresholds);
  if (filters.entry_badge) {
    items = items.filter((item) => item.entry_badge === filters.entry_badge);
  }

  return {
    items,
    next_cursor: nextCursor,
  };
}

/**
 * Get audit notes for an MTL entry.
 *
 * @param supabase - Supabase client with RLS context
 * @param entryId - Entry UUID
 * @returns Array of MtlAuditNoteDTO
 */
export async function getAuditNotes(
  supabase: SupabaseClient<Database>,
  entryId: string,
): Promise<MtlAuditNoteDTO[]> {
  const { data, error } = await supabase
    .from('mtl_audit_note')
    .select(MTL_AUDIT_NOTE_SELECT)
    .eq('mtl_entry_id', entryId)
    .order('created_at', { ascending: true });

  if (error) throw mapDatabaseError(error);

  return mapMtlAuditNoteRowList(data ?? []);
}

/**
 * Query Gaming Day Summary view with filters.
 * This is the COMPLIANCE AUTHORITY surface for CTR determination.
 *
 * @param supabase - Supabase client with RLS context
 * @param filters - MtlGamingDaySummaryFilters
 * @returns Paginated list of MtlGamingDaySummaryDTO with aggregate badges
 */
export async function getGamingDaySummary(
  supabase: SupabaseClient<Database>,
  filters: MtlGamingDaySummaryFilters,
): Promise<{ items: MtlGamingDaySummaryDTO[]; next_cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('mtl_gaming_day_summary')
    .select(MTL_GAMING_DAY_SUMMARY_SELECT)
    .eq('casino_id', filters.casino_id)
    .eq('gaming_day', filters.gaming_day)
    .order('total_volume', { ascending: false })
    .limit(limit + 1);

  // Apply optional filters
  if (filters.patron_uuid) {
    query = query.eq('patron_uuid', filters.patron_uuid);
  }

  if (filters.min_total_in !== undefined) {
    query = query.gte('total_in', filters.min_total_in);
  }

  if (filters.min_total_out !== undefined) {
    query = query.gte('total_out', filters.min_total_out);
  }

  // Handle cursor pagination
  if (filters.cursor) {
    const [cursorVolume, cursorPatron] = filters.cursor.split('|');
    if (cursorVolume && cursorPatron) {
      query = query.or(
        `total_volume.lt.${cursorVolume},and(total_volume.eq.${cursorVolume},patron_uuid.lt.${cursorPatron})`,
      );
    }
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  const thresholds = await getCasinoThresholds(supabase, filters.casino_id);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);

  // Generate next cursor from last item
  const lastItem = rawItems[rawItems.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.total_volume}|${lastItem.patron_uuid}`
      : null;

  // Map to DTOs with badge computation
  let items = mapGamingDaySummaryRowList(rawItems, thresholds);

  // Filter by aggregate badges if specified (computed at read time)
  if (filters.agg_badge_in) {
    items = items.filter((item) => item.agg_badge_in === filters.agg_badge_in);
  }
  if (filters.agg_badge_out) {
    items = items.filter(
      (item) => item.agg_badge_out === filters.agg_badge_out,
    );
  }

  return {
    items,
    next_cursor: nextCursor,
  };
}
