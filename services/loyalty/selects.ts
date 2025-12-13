/**
 * LoyaltyService Select Projections
 *
 * Named column sets for Supabase queries.
 * Prevents over-fetching and maintains consistent field exposure.
 * Pattern A: Manual column lists matching DTO contracts.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS4
 */

// === Loyalty Ledger Selects ===

/** Full ledger entry record for detail views */
export const LOYALTY_LEDGER_SELECT =
  'id, casino_id, player_id, rating_slip_id, visit_id, staff_id, points_delta, reason, idempotency_key, campaign_id, source_kind, source_id, metadata, note, created_at' as const;

/** Ledger list fields (same as LOYALTY_LEDGER_SELECT for mapper compatibility) */
export const LOYALTY_LEDGER_SELECT_LIST = LOYALTY_LEDGER_SELECT;

/** Minimal projection for aggregations (id, points_delta, timestamp) */
export const LOYALTY_LEDGER_SELECT_MIN =
  'id, points_delta, reason, created_at' as const;

// === Player Loyalty Selects ===

/** Player loyalty balance and tier info */
// Note: Uses 'balance' (current schema) - will become 'current_balance' after migration
export const PLAYER_LOYALTY_SELECT =
  'player_id, casino_id, balance, tier, preferences, updated_at' as const;
