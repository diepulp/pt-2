/**
 * RatingSlipService React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 * All list operations include scope for partial invalidation.
 *
 * @see PRD-002 Rating Slip Service
 * @see EXECUTION-SPEC-PRD-002.md WS-6
 */

import { serializeKeyFilters } from "@/services/shared/key-utils";

import type { RatingSlipListFilters } from "./dtos";

// Note: RatingSlipListFilters is re-exported from dtos.ts via index.ts

const ROOT = ["rating-slip"] as const;

// Helper to serialize filters - converts to generic record for serialization
const serialize = (filters: RatingSlipListFilters = {}): string =>
  serializeKeyFilters(filters);

// Helper for table-scoped filters
type TableScopedFilters = Omit<RatingSlipListFilters, "table_id" | "visit_id">;
const serializeTableFilters = (filters: TableScopedFilters = {}): string =>
  serializeKeyFilters(filters);

export const ratingSlipKeys = {
  /** Root key for all rating slip queries */
  root: ROOT,

  // === List Queries ===

  /**
   * List rating slips with optional filters.
   * Includes .scope for surgical invalidation of all list queries.
   */
  list: Object.assign(
    (filters: RatingSlipListFilters = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),

  // === Detail Queries ===

  /** Single rating slip by ID (includes pauses) */
  detail: (slipId: string) => [...ROOT, "detail", slipId] as const,

  /** Get calculated duration for a slip (excludes paused time) */
  duration: (slipId: string) => [...ROOT, "duration", slipId] as const,

  // === Scoped Queries ===

  /**
   * Rating slips for a specific table.
   * Includes .scope for surgical invalidation of all forTable queries.
   */
  forTable: Object.assign(
    (tableId: string, filters: TableScopedFilters = {}) =>
      [...ROOT, "for-table", tableId, serializeTableFilters(filters)] as const,
    { scope: [...ROOT, "for-table"] as const },
  ),

  /** Rating slips for a specific visit */
  forVisit: (visitId: string) => [...ROOT, "for-visit", visitId] as const,

  /**
   * Active (open or paused) rating slips for a table.
   * Used for pit boss view of current table activity.
   */
  activeForTable: (tableId: string) =>
    [...ROOT, "active-for-table", tableId] as const,

  // === Mutation Keys ===

  /** Key for start mutation */
  start: () => [...ROOT, "start"] as const,

  /** Key for pause mutation */
  pause: (slipId: string) => [...ROOT, "pause", slipId] as const,

  /** Key for resume mutation */
  resume: (slipId: string) => [...ROOT, "resume", slipId] as const,

  /** Key for close mutation */
  close: (slipId: string) => [...ROOT, "close", slipId] as const,

  /** Key for update average bet mutation */
  updateAverageBet: (slipId: string) =>
    [...ROOT, "update-average-bet", slipId] as const,

  // === Closed Sessions (Start From Previous Panel) ===

  /**
   * Closed slips for gaming day.
   * Used by the "Start From Previous" panel.
   */
  closedToday: (casinoId: string, gamingDay: string) =>
    [...ROOT, "closed-today", casinoId, gamingDay] as const,
};
