/**
 * Dashboard React Query Key Factories
 *
 * Query keys for pit dashboard data fetching.
 * Uses .scope pattern for surgical cache invalidation.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 */

import {
  serializeKeyFilters,
  type KeyFilter,
} from "@/services/shared/key-utils";

import type { DashboardTablesFilters, DashboardSlipsFilters } from "./types";

const ROOT = ["dashboard"] as const;

// Helper to serialize filters - cast to KeyFilter for type compatibility
const serializeFilters = (filters: Record<string, unknown> = {}): string =>
  serializeKeyFilters(filters as KeyFilter);

export const dashboardKeys = {
  /** Root key for all dashboard queries */
  root: ROOT,

  // === Table Queries ===

  /**
   * All tables for a casino with dashboard metadata.
   * Includes .scope for surgical invalidation of all tables queries.
   */
  tables: Object.assign(
    (casinoId: string, filters: DashboardTablesFilters = {}) =>
      [...ROOT, "tables", casinoId, serializeFilters(filters)] as const,
    { scope: [...ROOT, "tables"] as const },
  ),

  // === Slips Queries ===

  /**
   * Active slips for a specific table.
   * Includes .scope for surgical invalidation of all slips queries.
   */
  slips: Object.assign(
    (tableId: string, filters: DashboardSlipsFilters = {}) =>
      [...ROOT, "slips", tableId, serializeFilters(filters)] as const,
    { scope: [...ROOT, "slips"] as const },
  ),

  /** Active slips for a specific table (shorthand without filters) */
  activeSlips: (tableId: string) => [...ROOT, "active-slips", tableId] as const,

  // === Stats Queries ===

  /**
   * Aggregate dashboard stats for a casino.
   * Includes active tables count, open slips count, checked-in players.
   */
  stats: (casinoId: string) => [...ROOT, "stats", casinoId] as const,

  // === Invalidation Helpers ===

  /**
   * Invalidate all dashboard data for a casino.
   * Use after major state changes (e.g., table lifecycle changes).
   */
  all: (casinoId: string) => [...ROOT, casinoId] as const,
};
