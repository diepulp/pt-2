/**
 * PlayerFinancialService React Query Key Factories
 *
 * Query keys for financial transaction data fetching.
 * Uses hierarchical key structure for surgical cache invalidation.
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS2
 */

import type { FinancialTxnListQuery, VisitTotalQuery } from "./dtos";

const ROOT = ["player-financial"] as const;

export const playerFinancialKeys = {
  /** Root key for all player financial queries */
  root: ROOT,

  // === Transaction Queries ===

  /**
   * All financial transactions scope.
   * Use for invalidating all transaction lists.
   */
  transactions: Object.assign(() => [...ROOT, "transactions"] as const, {
    scope: [...ROOT, "transactions"] as const,
  }),

  /**
   * Transaction list with filters.
   * Includes filters for player_id, visit_id, direction, source, etc.
   */
  transactionList: (filters: FinancialTxnListQuery = {}) =>
    [...ROOT, "transactions", "list", filters] as const,

  /**
   * Single transaction detail.
   */
  transactionDetail: (id: string) =>
    [...ROOT, "transactions", "detail", id] as const,

  // === Visit Summary Queries ===

  /**
   * All visit summaries scope.
   * Use for invalidating all visit summary queries.
   */
  visitSummaries: Object.assign(() => [...ROOT, "visit-summaries"] as const, {
    scope: [...ROOT, "visit-summaries"] as const,
  }),

  /**
   * Visit financial summary (aggregated totals).
   */
  visitSummary: (query: VisitTotalQuery) =>
    [...ROOT, "visit-summaries", query.visit_id] as const,

  // === Invalidation Helpers ===

  /**
   * Invalidate all data for a specific player.
   * Use after player-level state changes.
   */
  forPlayer: (playerId: string) => [...ROOT, "player", playerId] as const,

  /**
   * Invalidate all data for a specific visit.
   * Use after visit financial activity.
   */
  forVisit: (visitId: string) => [...ROOT, "visit", visitId] as const,
};
