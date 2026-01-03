/**
 * MTLService Mappers
 *
 * Row → DTO transformers with badge computation.
 * Provides compile-time safety when schema changes.
 *
 * @see PRD-005 MTL Service
 * @see DTO_CANONICAL_STANDARD.md Pattern A
 */

import type { Database } from "@/types/database.types";

import type {
  MtlEntryDTO,
  MtlEntryWithNotesDTO,
  MtlAuditNoteDTO,
  MtlGamingDaySummaryDTO,
  CasinoThresholds,
  EntryBadge,
  AggBadge,
  MtlDirection,
} from "./dtos";

// ============================================================================
// Row Types (from database)
// ============================================================================

type MtlEntryRow = Database["public"]["Tables"]["mtl_entry"]["Row"];
type MtlAuditNoteRow = Database["public"]["Tables"]["mtl_audit_note"]["Row"];
type MtlGamingDaySummaryRow =
  Database["public"]["Views"]["mtl_gaming_day_summary"]["Row"];

/**
 * Entry row with nested audit notes from detail query
 */
export type MtlEntryWithNotesRow = MtlEntryRow & {
  mtl_audit_note: MtlAuditNoteRow[];
};

// ============================================================================
// Badge Computation Functions
// ============================================================================

/**
 * Derive Tier 1 Entry Badge (UX convenience)
 *
 * Per-transaction threshold indication for UI display.
 * CTR uses strictly > ("more than $10,000") per 31 CFR § 1021.311.
 */
export function deriveEntryBadge(
  amount: number,
  thresholds: CasinoThresholds,
): EntryBadge {
  // CTR: strictly > ("more than $10,000") per 31 CFR § 1021.311
  if (amount > thresholds.ctrThreshold) {
    return "ctr_met";
  }

  // Near CTR: > 90% of threshold
  if (amount > thresholds.ctrThreshold * 0.9) {
    return "ctr_near";
  }

  // Watchlist: >= (internal threshold, not regulatory)
  if (amount >= thresholds.watchlistFloor) {
    return "watchlist_near";
  }

  return "none";
}

/**
 * Derive Tier 2 Aggregate Badge (COMPLIANCE AUTHORITY)
 *
 * Daily aggregate threshold indication per 31 CFR § 1021.311.
 * This is the authoritative compliance trigger surface.
 * Cash-in and cash-out are evaluated SEPARATELY per IRS guidance.
 *
 * IMPORTANT: CTR uses strictly > ("more than $10,000"), NOT >=
 */
export function deriveAggBadge(
  dailyTotal: number,
  thresholds: CasinoThresholds,
): AggBadge {
  // CTR: strictly > ("more than $10,000") per 31 CFR § 1021.311
  if (dailyTotal > thresholds.ctrThreshold) {
    return "agg_ctr_met";
  }

  // Near CTR: > 90% of threshold
  if (dailyTotal > thresholds.ctrThreshold * 0.9) {
    return "agg_ctr_near";
  }

  // Watchlist: >= (internal threshold, not regulatory)
  if (dailyTotal >= thresholds.watchlistFloor) {
    return "agg_watchlist";
  }

  return "none";
}

// ============================================================================
// Entry Mappers
// ============================================================================

/**
 * Map MTL entry row to DTO with badge computation
 */
export function mapMtlEntryRow(
  row: MtlEntryRow,
  thresholds: CasinoThresholds,
): MtlEntryDTO {
  return {
    id: row.id,
    patron_uuid: row.patron_uuid,
    casino_id: row.casino_id,
    staff_id: row.staff_id,
    rating_slip_id: row.rating_slip_id,
    visit_id: row.visit_id,
    amount: row.amount,
    // Direction is constrained to 'in' | 'out' by database CHECK constraint
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB-enforced enum
    direction: row.direction as MtlDirection,
    txn_type: row.txn_type,
    source: row.source,
    area: row.area,
    gaming_day: row.gaming_day,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    entry_badge: deriveEntryBadge(row.amount, thresholds),
  };
}

/**
 * Map list of MTL entry rows to DTOs
 */
export function mapMtlEntryRowList(
  rows: MtlEntryRow[],
  thresholds: CasinoThresholds,
): MtlEntryDTO[] {
  return rows.map((row) => mapMtlEntryRow(row, thresholds));
}

/**
 * Map MTL entry row to DTO or null
 */
export function mapMtlEntryRowOrNull(
  row: MtlEntryRow | null,
  thresholds: CasinoThresholds,
): MtlEntryDTO | null {
  return row ? mapMtlEntryRow(row, thresholds) : null;
}

// ============================================================================
// Entry with Notes Mappers
// ============================================================================

/**
 * Map MTL entry row with notes to DTO
 */
export function mapMtlEntryWithNotesRow(
  row: MtlEntryWithNotesRow,
  thresholds: CasinoThresholds,
): MtlEntryWithNotesDTO {
  return {
    ...mapMtlEntryRow(row, thresholds),
    audit_notes: mapMtlAuditNoteRowList(row.mtl_audit_note || []),
  };
}

// ============================================================================
// Audit Note Mappers
// ============================================================================

/**
 * Map MTL audit note row to DTO
 */
export function mapMtlAuditNoteRow(row: MtlAuditNoteRow): MtlAuditNoteDTO {
  return {
    id: row.id,
    mtl_entry_id: row.mtl_entry_id,
    staff_id: row.staff_id,
    note: row.note,
    created_at: row.created_at,
  };
}

/**
 * Map list of MTL audit note rows to DTOs
 */
export function mapMtlAuditNoteRowList(
  rows: MtlAuditNoteRow[],
): MtlAuditNoteDTO[] {
  return rows.map(mapMtlAuditNoteRow);
}

// ============================================================================
// Gaming Day Summary Mappers
// ============================================================================

/**
 * Map Gaming Day Summary row to DTO with aggregate badges
 */
export function mapGamingDaySummaryRow(
  row: MtlGamingDaySummaryRow,
  thresholds: CasinoThresholds,
): MtlGamingDaySummaryDTO {
  // Handle nulls from view (GROUP BY can produce nulls)
  const totalIn = row.total_in ?? 0;
  const totalOut = row.total_out ?? 0;

  return {
    casino_id: row.casino_id ?? "",
    patron_uuid: row.patron_uuid ?? "",
    gaming_day: row.gaming_day ?? "",
    // Cash-in aggregates
    total_in: totalIn,
    count_in: row.count_in ?? 0,
    max_single_in: row.max_single_in,
    first_in_at: row.first_in_at,
    last_in_at: row.last_in_at,
    agg_badge_in: deriveAggBadge(totalIn, thresholds),
    // Cash-out aggregates
    total_out: totalOut,
    count_out: row.count_out ?? 0,
    max_single_out: row.max_single_out,
    first_out_at: row.first_out_at,
    last_out_at: row.last_out_at,
    agg_badge_out: deriveAggBadge(totalOut, thresholds),
    // Overall
    total_volume: row.total_volume ?? 0,
    entry_count: row.entry_count ?? 0,
  };
}

/**
 * Map list of Gaming Day Summary rows to DTOs
 */
export function mapGamingDaySummaryRowList(
  rows: MtlGamingDaySummaryRow[],
  thresholds: CasinoThresholds,
): MtlGamingDaySummaryDTO[] {
  return rows.map((row) => mapGamingDaySummaryRow(row, thresholds));
}

// ============================================================================
// Default Thresholds (fallback if casino_settings not available)
// ============================================================================

/**
 * Default thresholds per PRD-005
 * These match the casino_settings table defaults.
 */
export const DEFAULT_THRESHOLDS: CasinoThresholds = {
  watchlistFloor: 3000,
  ctrThreshold: 10000,
};
