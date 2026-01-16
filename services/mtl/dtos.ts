/**
 * MTLService DTOs (Pattern A - Contract-First)
 *
 * Manual DTO interfaces for AML/CTR compliance tracking.
 * Pattern A allows manual interfaces since DTOs are domain contracts,
 * not schema mirrors. Mappers enforce the boundary with compile-time safety.
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

import type { Database } from "@/types/database.types";

// ============================================================================
// Enum Types (derived from database enums for type safety)
// ============================================================================

/**
 * Transaction type classification per PRD-005
 */
export type MtlTxnType = Database["public"]["Enums"]["mtl_txn_type"];
// Values: 'buy_in' | 'cash_out' | 'marker' | 'front_money' | 'chip_fill'

/**
 * Transaction source channel per PRD-005
 */
export type MtlSource = Database["public"]["Enums"]["mtl_source"];
// Values: 'table' | 'cage' | 'kiosk' | 'other'

/**
 * Transaction direction
 */
export type MtlDirection = "in" | "out";

/**
 * Tier 1: Entry Badge (UX convenience)
 * Per-transaction threshold indication for UI display.
 * NOT the compliance trigger - see AggBadge for that.
 */
export type EntryBadge = "none" | "watchlist_near" | "ctr_near" | "ctr_met";

/**
 * Tier 2: Aggregate Badge (COMPLIANCE AUTHORITY)
 * Daily aggregate threshold indication per 31 CFR § 1021.311.
 * This is the authoritative compliance trigger surface.
 * Cash-in and cash-out tracked separately per IRS guidance.
 */
export type AggBadge =
  | "none"
  | "agg_watchlist"
  | "agg_ctr_near"
  | "agg_ctr_met";

// ============================================================================
// Casino Thresholds (shared with view-model)
// ============================================================================

/**
 * Casino-specific threshold configuration from casino_settings
 */
export interface CasinoThresholds {
  /** Internal watchlist threshold (default $3,000), comparison: >= */
  watchlistFloor: number;
  /** CTR reporting threshold (default $10,000), comparison: > (strictly greater) */
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
  gaming_day: string;
  // Cash-in aggregates
  total_in: number;
  count_in: number;
  max_single_in: number | null;
  first_in_at: string | null;
  last_in_at: string | null;
  /** Tier 2 aggregate badge for cash-in (COMPLIANCE) */
  agg_badge_in: AggBadge;
  // Cash-out aggregates
  total_out: number;
  count_out: number;
  max_single_out: number | null;
  first_out_at: string | null;
  last_out_at: string | null;
  /** Tier 2 aggregate badge for cash-out (COMPLIANCE) */
  agg_badge_out: AggBadge;
  // Overall
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
  /** Filter entries with amount >= this value */
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
  /** Filter summaries with total_in >= this value */
  min_total_in?: number;
  /** Filter summaries with total_out >= this value */
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
