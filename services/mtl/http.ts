/**
 * MTLService HTTP Fetchers
 *
 * Client-side fetch functions for MTL API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

import { fetchJSON } from "@/lib/http/fetch-json";
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";

import type {
  CreateMtlAuditNoteInput,
  CreateMtlEntryInput,
  MtlAuditNoteDTO,
  MtlEntryDTO,
  MtlEntryFilters,
  MtlEntryWithNotesDTO,
  MtlGamingDaySummaryDTO,
  MtlGamingDaySummaryFilters,
} from "./dtos";

const BASE = "/api/v1/mtl";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// ============================================================================
// MTL Entry CRUD
// ============================================================================

/**
 * Creates a new MTL entry.
 * Idempotent - returns existing entry if idempotency_key matches.
 *
 * POST /api/v1/mtl/entries
 */
export async function createMtlEntry(
  input: CreateMtlEntryInput,
): Promise<MtlEntryDTO> {
  return fetchJSON<MtlEntryDTO>(`${BASE}/entries`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Fetches a paginated list of MTL entries with optional filters.
 *
 * GET /api/v1/mtl/entries?casino_id=X&patron_uuid=Y&gaming_day=Z&...
 */
export async function listMtlEntries(
  filters: MtlEntryFilters,
): Promise<{ items: MtlEntryDTO[]; next_cursor: string | null }> {
  const {
    casino_id,
    patron_uuid,
    gaming_day,
    min_amount,
    txn_type,
    source,
    entry_badge,
    cursor,
    limit,
  } = filters;

  const params = buildParams({
    casino_id,
    patron_uuid,
    gaming_day,
    min_amount,
    txn_type,
    source,
    entry_badge,
    cursor,
    limit,
  });

  const url = `${BASE}/entries?${params}`;
  return fetchJSON<{ items: MtlEntryDTO[]; next_cursor: string | null }>(url);
}

/**
 * Fetches a single MTL entry by ID with its audit notes.
 *
 * GET /api/v1/mtl/entries/{entryId}
 */
export async function getMtlEntry(
  entryId: string,
): Promise<MtlEntryWithNotesDTO> {
  return fetchJSON<MtlEntryWithNotesDTO>(`${BASE}/entries/${entryId}`);
}

// ============================================================================
// MTL Audit Notes
// ============================================================================

/**
 * Creates an audit note for an MTL entry.
 * Append-only - notes cannot be modified after creation.
 *
 * POST /api/v1/mtl/entries/{entryId}/audit-notes
 */
export async function createMtlAuditNote(
  entryId: string,
  input: Omit<CreateMtlAuditNoteInput, "mtl_entry_id">,
): Promise<MtlAuditNoteDTO> {
  return fetchJSON<MtlAuditNoteDTO>(`${BASE}/entries/${entryId}/audit-notes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify({ ...input, mtl_entry_id: entryId }),
  });
}

/**
 * Fetches audit notes for an MTL entry.
 *
 * GET /api/v1/mtl/entries/{entryId}/audit-notes
 */
export async function getMtlAuditNotes(
  entryId: string,
): Promise<MtlAuditNoteDTO[]> {
  return fetchJSON<MtlAuditNoteDTO[]>(`${BASE}/entries/${entryId}/audit-notes`);
}

// ============================================================================
// Gaming Day Summary (Compliance Authority)
// ============================================================================

/**
 * Fetches the Gaming Day Summary - the COMPLIANCE AUTHORITY surface.
 * Aggregates per patron + gaming_day with separate in/out totals.
 *
 * GET /api/v1/mtl/gaming-day-summary?casino_id=X&gaming_day=Y&...
 */
export async function getGamingDaySummary(
  filters: MtlGamingDaySummaryFilters,
): Promise<{ items: MtlGamingDaySummaryDTO[]; next_cursor: string | null }> {
  const {
    casino_id,
    gaming_day,
    patron_uuid,
    agg_badge_in,
    agg_badge_out,
    min_total_in,
    min_total_out,
    cursor,
    limit,
  } = filters;

  const params = buildParams({
    casino_id,
    gaming_day,
    patron_uuid,
    agg_badge_in,
    agg_badge_out,
    min_total_in,
    min_total_out,
    cursor,
    limit,
  });

  const url = `${BASE}/gaming-day-summary?${params}`;
  return fetchJSON<{
    items: MtlGamingDaySummaryDTO[];
    next_cursor: string | null;
  }>(url);
}
