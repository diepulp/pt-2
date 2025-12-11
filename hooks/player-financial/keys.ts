/**
 * PlayerFinancialService React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 * All list operations include scope for partial invalidation.
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS4
 */

import type { FinancialTxnListQuery } from "@/services/player-financial/dtos";
import {
  serializeKeyFilters,
  type KeyFilter,
} from "@/services/shared/key-utils";

const ROOT = ["player-financial"] as const;

// Helper to serialize filters - cast to KeyFilter for type compatibility
const serialize = (filters: FinancialTxnListQuery = {}): string =>
  serializeKeyFilters(filters as KeyFilter);

export const playerFinancialKeys = {
  /** Root key for all player financial queries */
  root: ROOT,

  // === Transaction Queries ===

  /**
   * List financial transactions with optional filters.
   * Includes .scope for surgical invalidation of all list queries.
   */
  list: Object.assign(
    (filters: FinancialTxnListQuery = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),

  // === Detail Queries ===

  /** Single financial transaction by ID */
  detail: (txnId: string) => [...ROOT, "detail", txnId] as const,

  // === Visit Summary Queries ===

  /**
   * Financial summary for a specific visit.
   * Aggregated totals: total_in, total_out, net_amount.
   */
  visitSummary: (visitId: string) =>
    [...ROOT, "visit-summary", visitId] as const,

  /**
   * Scope for all visit summary queries.
   * Used for invalidation when transactions change.
   */
  visitSummaryScope: [...ROOT, "visit-summary"] as const,

  // === Scoped Queries ===

  /** Financial transactions for a specific player */
  forPlayer: (playerId: string) => [...ROOT, "for-player", playerId] as const,

  /** Financial transactions for a specific visit */
  forVisit: (visitId: string) => [...ROOT, "for-visit", visitId] as const,

  // === Mutation Keys ===

  /** Key for create transaction mutation */
  create: () => [...ROOT, "create"] as const,
};
