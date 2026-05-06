/**
 * MTLService DTOs (Pattern A - Contract-First)
 *
 * Manual DTO interfaces for AML/CTR compliance tracking.
 * Pattern A allows manual interfaces since DTOs are domain contracts,
 * not schema mirrors. Mappers enforce the boundary with compile-time safety.
 *
 * Financial envelope wrapping (PRD-070 WS2):
 * All currency fields in this service are DEFERRED to Phase 1.2. MTL DTOs
 * cascade directly into heavy UI consumption across `components/mtl/*` and
 * `app/review/mtl-form/*`; wrapping would require a paired direct-consumer
 * workstream per PRD-070 G1. The Phase 1.2 Deferral Register MUST be
 * amended (WS9 obligation) to include the MTL fields enumerated below with
 * their classification targets. Compliance isolation rule (§3.4) applies
 * regardless of envelope state: compliance-class values MUST NEVER be
 * aggregated with any other authority class.
 *
 * Inputs and filter thresholds are §6.1/§6.2 carve-outs (bare number, not
 * emitted financial facts).
 *
 * @see PRD-005 MTL Service
 * @see PRD-070 Financial Telemetry Wave 1 Phase 1.1
 * @see ADR-025 MTL Authorization Model
 */

import type { Database } from '@/types/database.types';

// ============================================================================
// Enum Types (derived from database enums for type safety)
// ============================================================================

/**
 * Transaction type classification per PRD-005
 */
export type MtlTxnType = Database['public']['Enums']['mtl_txn_type'];
// Values: 'buy_in' | 'cash_out' | 'marker' | 'front_money' | 'chip_fill'

/**
 * Transaction source channel per PRD-005
 */
export type MtlSource = Database['public']['Enums']['mtl_source'];
// Values: 'table' | 'cage' | 'kiosk' | 'other'

/**
 * Transaction direction
 */
export type MtlDirection = 'in' | 'out';

/**
 * Tier 1: Entry Badge (UX convenience)
 * Per-transaction threshold indication for UI display.
 * NOT the compliance trigger - see AggBadge for that.
 */
export type EntryBadge = 'none' | 'watchlist_near' | 'ctr_near' | 'ctr_met';

/**
 * Tier 2: Aggregate Badge (COMPLIANCE AUTHORITY)
 * Daily aggregate threshold indication per 31 CFR § 1021.311.
 * This is the authoritative compliance trigger surface.
 * Cash-in and cash-out tracked separately per IRS guidance.
 */
export type AggBadge =
  | 'none'
  | 'agg_watchlist'
  | 'agg_ctr_near'
  | 'agg_ctr_met';

// ============================================================================
// Casino Thresholds (shared with view-model)
// ============================================================================

/**
 * Casino-specific threshold configuration from casino_settings
 * IMPORTANT: All values in CENTS per ISSUE-FB8EB717 standardization
 */
export interface CasinoThresholds {
  /** Internal watchlist threshold (default $3,000 = 300000 cents), comparison: >= */
  watchlistFloor: number;
  /** CTR reporting threshold (default $10,000 = 1000000 cents), comparison: > (strictly greater) */
  ctrThreshold: number;
}

// ============================================================================
// Entry DTOs
// ============================================================================

/**
 * MTL Entry DTO for list and detail responses
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per SLAD §341
export interface MtlEntryDTO {
  id: string;
  patron_uuid: string;
  casino_id: string;
  staff_id: string | null;
  rating_slip_id: string | null;
  visit_id: string | null;
  /**
   * Amount in CENTS per ISSUE-FB8EB717 standardization (e.g., 300000 = $3,000).
   *
   * DEFERRED (PRD-070 WS2 → Phase 1.2): wrapping cascades into UI consumers:
   *   - `components/mtl/entry-list.tsx:229`
   *   - `components/mtl/entry-detail.tsx:168`
   *   - `components/mtl/mtl-entry-form.tsx:{460,462,547,679,681}`
   *   - `components/mtl/mtl-entry-view-modal.tsx:{226,228,306,429,431}`
   *   - `components/mtl/compliance-dashboard.tsx:386`
   *   - `app/review/mtl-form/mtl-entry-form.tsx:{515,517,611,756,758}`
   * Phase 1.1 G1 deferral — requires paired direct-consumer workstream.
   * Classification target when wrapped (CLASSIFICATION-RULES §3.4):
   *   type `'compliance'`, source `"mtl_entry"`, completeness `'complete'` per row.
   * Compliance isolation rule: MUST NEVER be aggregated with non-compliance authorities.
   */
  amount: number;
  direction: MtlDirection;
  txn_type: MtlTxnType;
  source: MtlSource;
  area: string | null;
  gaming_day: string | null;
  /** When transaction actually happened (user-entered, paper form timestamp) */
  occurred_at: string;
  /** When row was inserted (server time, audit trail) */
  created_at: string;
  /** Tier 1 entry badge (UX) - computed at read time */
  entry_badge: EntryBadge;
}

/**
 * MTL Entry with audit notes for detail view
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per SLAD §341
export interface MtlEntryWithNotesDTO extends MtlEntryDTO {
  audit_notes: MtlAuditNoteDTO[];
}

/**
 * MTL Audit Note DTO
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per SLAD §341
export interface MtlAuditNoteDTO {
  id: string;
  mtl_entry_id: string;
  staff_id: string | null;
  note: string;
  created_at: string;
}

// ============================================================================
// Gaming Day Summary DTOs (Compliance Authority)
// ============================================================================

/**
 * Gaming Day Summary DTO (COMPLIANCE AUTHORITY)
 * Aggregates per patron + gaming_day with separate in/out totals.
 * This is the authoritative compliance trigger surface per 31 CFR § 1021.311.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per SLAD §341
export interface MtlGamingDaySummaryDTO {
  casino_id: string;
  patron_uuid: string;
  /** Patron first name for display */
  patron_first_name: string | null;
  /** Patron last name for display */
  patron_last_name: string | null;
  /** Patron date of birth for compliance disambiguation */
  patron_date_of_birth: string | null;
  gaming_day: string;
  // Cash-in aggregates (all amounts in CENTS per ISSUE-FB8EB717).
  //
  // DEFERRED (PRD-070 WS2 → Phase 1.2): aggregate currency fields cascade into
  // `components/mtl/gaming-day-summary.tsx:{272,288}`,
  // `components/mtl/compliance-dashboard.tsx:132`,
  // `hooks/mtl/use-patron-daily-total.ts:{125,126}`, and
  // `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx:43`.
  // Classification target when wrapped (CLASSIFICATION-RULES §3.4):
  //   type `'compliance'`, source `"mtl_entry"`, completeness = `'partial'`
  //   until gaming day closes, `'complete'` after close, `'unknown'` at
  //   ambiguous boundary (gaming-day lifecycle via `rpc_current_gaming_day()`).
  // Compliance isolation rule applies (NEVER aggregate with non-compliance).
  total_in: number;
  count_in: number;
  /** DEFERRED — same classification target as `total_in` (per-field max). */
  max_single_in: number | null;
  first_in_at: string | null;
  last_in_at: string | null;
  /** Tier 2 aggregate badge for cash-in (COMPLIANCE) */
  agg_badge_in: AggBadge;
  // Cash-out aggregates (all amounts in CENTS per ISSUE-FB8EB717).
  // DEFERRED — same classification target as total_in.
  total_out: number;
  count_out: number;
  /** DEFERRED — same classification target as `total_in`. */
  max_single_out: number | null;
  first_out_at: string | null;
  last_out_at: string | null;
  /** Tier 2 aggregate badge for cash-out (COMPLIANCE) */
  agg_badge_out: AggBadge;
  // Overall. DEFERRED — same classification target as total_in.
  total_volume: number;
  entry_count: number;
}

// ============================================================================
// Input DTOs (for create operations)
// ============================================================================

/**
 * Input for creating MTL entry
 */
export interface CreateMtlEntryInput {
  patron_uuid: string;
  casino_id: string;
  staff_id?: string;
  rating_slip_id?: string;
  visit_id?: string;
  /**
   * Amount in CENTS per ISSUE-FB8EB717 standardization (e.g., 300000 = $3,000).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.1): operator input — bare number.
   * The committed row is emitted via `MtlEntryDTO.amount` (Phase 1.2 deferral).
   */
  amount: number;
  direction: MtlDirection;
  txn_type: MtlTxnType;
  /** Defaults to 'table' if not provided */
  source?: MtlSource;
  area?: string;
  /** When transaction occurred (defaults to now if not provided) */
  occurred_at?: string;
  /** Required for idempotency */
  idempotency_key: string;
}

/**
 * Input for creating MTL audit note
 */
export interface CreateMtlAuditNoteInput {
  mtl_entry_id: string;
  staff_id: string;
  note: string;
}

// ============================================================================
// Filter DTOs (for list queries)
// ============================================================================

/**
 * Filters for MTL entry list queries
 */
export interface MtlEntryFilters {
  casino_id: string;
  patron_uuid?: string;
  gaming_day?: string;
  /**
   * Filter entries with amount >= this value (in CENTS per ISSUE-FB8EB717).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.2): filter threshold — bare number.
   */
  min_amount?: number;
  txn_type?: MtlTxnType;
  source?: MtlSource;
  /** Filter by entry badge level */
  entry_badge?: EntryBadge;
  /** Cursor for keyset pagination (created_at, id) */
  cursor?: string;
  /** Max items to return (default 20, max 100) */
  limit?: number;
}

/**
 * Filters for Gaming Day Summary queries
 */
export interface MtlGamingDaySummaryFilters {
  casino_id: string;
  gaming_day: string;
  patron_uuid?: string;
  /** Filter by aggregate badge level for cash-in */
  agg_badge_in?: AggBadge;
  /** Filter by aggregate badge level for cash-out */
  agg_badge_out?: AggBadge;
  /**
   * Filter summaries with total_in >= this value (in CENTS per ISSUE-FB8EB717).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.2): filter threshold — bare number.
   */
  min_total_in?: number;
  /**
   * Filter summaries with total_out >= this value (in CENTS per ISSUE-FB8EB717).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.2): filter threshold — bare number.
   */
  min_total_out?: number;
  /** Cursor for pagination */
  cursor?: string;
  /** Max items to return (default 20, max 100) */
  limit?: number;
}

// ============================================================================
// Paginated Response Types
// ============================================================================

/**
 * Paginated list response for MTL entries
 */
export interface MtlEntryListResponse {
  items: MtlEntryDTO[];
  next_cursor: string | null;
}

/**
 * Paginated list response for Gaming Day Summary
 */
export interface MtlGamingDaySummaryListResponse {
  items: MtlGamingDaySummaryDTO[];
  next_cursor: string | null;
}
