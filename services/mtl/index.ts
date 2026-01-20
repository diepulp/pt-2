/**
 * MTLService Factory
 *
 * Functional factory for MTL (Monetary Transaction Log) compliance tracking.
 * Pattern A: Contract-First with manual DTOs for compliance domain contracts.
 *
 * Key invariants:
 * - MTL entries are IMMUTABLE (append-only ledger)
 * - No update or delete operations exist
 * - Gaming day is auto-computed from occurred_at at insert time
 * - Two-tier badge system: Entry (UX) and Aggregate (COMPLIANCE)
 * - CTR threshold uses strictly > ("more than $10,000") per 31 CFR § 1021.311
 *
 * Authorization (ADR-025):
 * - Entry READ: pit_boss, cashier, admin
 * - Entry WRITE: pit_boss, cashier, admin
 * - Gaming Day Summary: pit_boss, admin (UI-gated)
 * - Audit Note WRITE: pit_boss, admin
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 * @see ADR-024 RLS Context Injection
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  CreateMtlAuditNoteInput,
  CreateMtlEntryInput,
  MtlAuditNoteDTO,
  MtlEntryDTO,
  MtlEntryFilters,
  MtlEntryWithNotesDTO,
  MtlGamingDaySummaryDTO,
  MtlGamingDaySummaryFilters,
} from './dtos';

// Re-export DTOs, keys, and HTTP fetchers for consumers
export * from './dtos';
export * from './keys';
export * from './http';

// ============================================================================
// Service Interface
// ============================================================================

/**
 * MTLService interface - explicit, no ReturnType inference.
 *
 * Append-only ledger - no update or delete operations.
 */
export interface MtlServiceInterface {
  // === Create Operations (Append-Only) ===

  /**
   * Create a new MTL entry.
   * Idempotent - returns existing entry if idempotency_key matches.
   *
   * @param input - CreateMtlEntryInput with idempotency_key
   * @returns MtlEntryDTO with computed entry_badge
   */
  createEntry(input: CreateMtlEntryInput): Promise<MtlEntryDTO>;

  /**
   * Create an audit note for an MTL entry.
   * Append-only - notes cannot be modified after creation.
   *
   * @param input - CreateMtlAuditNoteInput
   * @returns MtlAuditNoteDTO
   * @throws MTL_ENTRY_NOT_FOUND if referenced entry doesn't exist
   */
  createAuditNote(input: CreateMtlAuditNoteInput): Promise<MtlAuditNoteDTO>;

  // === Read Operations ===

  /**
   * Get MTL entry by ID with audit notes.
   *
   * @param entryId - Entry UUID
   * @returns MtlEntryWithNotesDTO
   * @throws MTL_ENTRY_NOT_FOUND if entry doesn't exist
   */
  getEntryById(entryId: string): Promise<MtlEntryWithNotesDTO>;

  /**
   * List MTL entries with filters and cursor pagination.
   *
   * @param filters - MtlEntryFilters
   * @returns Paginated list of MtlEntryDTO
   */
  listEntries(
    filters: MtlEntryFilters,
  ): Promise<{ items: MtlEntryDTO[]; next_cursor: string | null }>;

  /**
   * Get audit notes for an MTL entry.
   *
   * @param entryId - Entry UUID
   * @returns Array of MtlAuditNoteDTO
   */
  getAuditNotes(entryId: string): Promise<MtlAuditNoteDTO[]>;

  /**
   * Query Gaming Day Summary view with filters.
   * This is the COMPLIANCE AUTHORITY surface for CTR determination.
   *
   * @param filters - MtlGamingDaySummaryFilters
   * @returns Paginated list of MtlGamingDaySummaryDTO with aggregate badges
   */
  getGamingDaySummary(
    filters: MtlGamingDaySummaryFilters,
  ): Promise<{ items: MtlGamingDaySummaryDTO[]; next_cursor: string | null }>;
}

// ============================================================================
// Service Factory
// ============================================================================

/**
 * Creates an MTLService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createMtlService(
  supabase: SupabaseClient<Database>,
): MtlServiceInterface {
  return {
    // Create operations (append-only)
    createEntry: (input) => crud.createEntry(supabase, input),
    createAuditNote: (input) => crud.createAuditNote(supabase, input),

    // Read operations
    getEntryById: (entryId) => crud.getEntryById(supabase, entryId),
    listEntries: (filters) => crud.listEntries(supabase, filters),
    getAuditNotes: (entryId) => crud.getAuditNotes(supabase, entryId),
    getGamingDaySummary: (filters) =>
      crud.getGamingDaySummary(supabase, filters),
  };
}
