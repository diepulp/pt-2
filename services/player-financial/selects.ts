/**
 * PlayerFinancialService Select Projections
 *
 * Named column sets for Supabase queries.
 * Prevents over-fetching and maintains consistent field exposure.
 * Pattern A: Manual column lists matching DTO contracts.
 *
 * @see SLAD §334 - Named column sets
 * @see PRD-009 Player Financial Service
 */

// === Financial Transaction Selects ===

/** Full transaction record for detail views (getById, getByIdempotencyKey) */
export const FINANCIAL_TXN_SELECT =
  'id, casino_id, player_id, visit_id, rating_slip_id, amount, direction, source, tender_type, created_by_staff_id, related_transaction_id, created_at, gaming_day, idempotency_key, txn_kind, reason_code, note, external_ref' as const;

/** Transaction list fields (same as FINANCIAL_TXN_SELECT for mapper compatibility) */
export const FINANCIAL_TXN_SELECT_LIST = FINANCIAL_TXN_SELECT;

/** Minimal projection for aggregations (id, amount, direction, timestamp) */
export const FINANCIAL_TXN_SELECT_MIN =
  'id, amount, direction, created_at' as const;

// === Visit Financial Summary Selects ===

/** Visit financial summary (from materialized view) */
export const VISIT_SUMMARY_SELECT =
  'visit_id, casino_id, total_in, total_out, net_amount, event_count, first_transaction_at, last_transaction_at' as const;
