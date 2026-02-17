/**
 * PlayerFinancialService DTOs
 *
 * Pattern A (Contract-First): Manual interfaces for cross-context consumption.
 * Financial transactions are append-only ledger entries consumed by multiple services.
 *
 * @see PRD-009 Player Financial Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section PlayerFinancialService
 * @see EXECUTION-SPEC-PRD-009.md
 */

// === Enum Types ===
// Note: These match the database enums defined in migration 20251211015115_prd009_player_financial_service.sql
// After migration is applied and types regenerated, these can be changed to:
// export type FinancialDirection = Database['public']['Enums']['financial_direction'];

/**
 * Transaction direction.
 *
 * - `in`: Money coming in (buy-in, marker issuance)
 * - `out`: Money going out (cashout, marker repayment)
 */
export type FinancialDirection = 'in' | 'out';

/**
 * Transaction source/origin.
 *
 * - `pit`: Originated at gaming table (pit boss action)
 * - `cage`: Originated at cashier cage (cashier action)
 * - `system`: System-generated (automated processes)
 */
export type FinancialSource = 'pit' | 'cage' | 'system';

/**
 * Tender type for transaction.
 *
 * Common values:
 * - `cash`: Physical currency
 * - `chips`: Gaming chips
 * - `marker`: Casino credit marker
 * - `check`: Personal check
 * - `wire`: Wire transfer
 */
export type TenderType = string;

// === Financial Transaction DTOs ===

/**
 * Public financial transaction record.
 *
 * Append-only ledger entry for player financial activity.
 * Immutable after creation (no updates/deletes allowed per ADR-015).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Cross-context consumption, manual interface preferred
export interface FinancialTransactionDTO {
  /** Unique transaction ID */
  id: string;
  /** Casino scope */
  casino_id: string;
  /** Player who owns this transaction */
  player_id: string;
  /** Visit context (required - NOT NULL) */
  visit_id: string;
  /** Optional: Associated rating slip */
  rating_slip_id: string | null;
  /** Transaction amount in cents (1 dollar = 100). Can be negative for adjustments. */
  amount: number;
  /** Transaction direction ('in' or 'out') */
  direction: FinancialDirection;
  /** Transaction source ('pit', 'cage', 'system') */
  source: FinancialSource;
  /** Tender type (cash, chips, marker, adjustment, etc.) */
  tender_type: TenderType;
  /** Staff member who created this transaction */
  created_by_staff_id: string | null;
  /** Optional: Related transaction (for reversals, adjustments) */
  related_transaction_id: string | null;
  /** Transaction timestamp */
  created_at: string;
  /** Gaming day for this transaction */
  gaming_day: string | null;
  /** Idempotency key for duplicate prevention */
  idempotency_key: string | null;
  /** Transaction kind: 'original', 'adjustment', or 'reversal' */
  txn_kind: 'original' | 'adjustment' | 'reversal';
  /** Reason code for adjustments (null for original transactions) */
  reason_code:
    | 'data_entry_error'
    | 'duplicate'
    | 'wrong_player'
    | 'wrong_amount'
    | 'system_bug'
    | 'other'
    | null;
  /** Note explaining the transaction (required for adjustments) */
  note: string | null;
  /** Receipt/ticket reference for cage transactions (PRD-033) */
  external_ref: string | null;
}

/**
 * Visit financial summary (aggregated totals).
 *
 * Computed view of all transactions for a visit.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated response type
export interface VisitFinancialSummaryDTO {
  /** Visit ID */
  visit_id: string;
  /** Casino scope */
  casino_id: string;
  /** Total amount IN in cents (buy-ins, markers issued) */
  total_in: number;
  /** Total amount OUT in cents (cashouts, marker repayments) */
  total_out: number;
  /** Net amount in cents (total_in - total_out) */
  net_amount: number;
  /** Number of transactions */
  transaction_count: number;
  /** First transaction timestamp */
  first_transaction_at: string | null;
  /** Last transaction timestamp */
  last_transaction_at: string | null;
}

// === Input DTOs ===

/**
 * Input for creating a financial transaction.
 *
 * Used by RPC and service layer for validated transaction creation.
 */

export interface CreateFinancialTxnInput {
  /** Casino ID (must match RLS context) */
  casino_id: string;
  /** Player ID */
  player_id: string;
  /** Visit ID (required - NOT NULL) */
  visit_id: string;
  /** Transaction amount in cents (positive number) */
  amount: number;
  /** Transaction direction */
  direction: FinancialDirection;
  /** Transaction source */
  source: FinancialSource;
  /** Tender type */
  tender_type: TenderType;
  /** Staff member creating this transaction (must match RLS context) */
  created_by_staff_id: string;
  /** Optional: Associated rating slip */
  rating_slip_id?: string;
  /** Optional: Related transaction (for reversals) */
  related_transaction_id?: string;
  /** Optional: Idempotency key */
  idempotency_key?: string;
  /** Optional: Custom timestamp (defaults to now()) */
  created_at?: string;
  /** Optional: Receipt/ticket reference for cage transactions (PRD-033) */
  external_ref?: string;
}

// === Filter Types ===

/**
 * Filters for financial transaction list queries.
 *
 * All filters are optional; omit for unfiltered list.
 */

export interface FinancialTxnListQuery {
  /** Filter by player */
  player_id?: string;
  /** Filter by visit */
  visit_id?: string;
  /** Filter by gaming table (via rating_slip_id join) */
  table_id?: string;
  /** Filter by direction */
  direction?: FinancialDirection;
  /** Filter by source */
  source?: FinancialSource;
  /** Filter by tender type */
  tender_type?: TenderType;
  /** Filter by gaming day */
  gaming_day?: string;
  /** Results per page (default 20) */
  limit?: number;
  /** Cursor for pagination (transaction ID) */
  cursor?: string;
}

/**
 * Query parameters for visit financial summary.
 */

export interface VisitTotalQuery {
  /** Visit ID (required) */
  visit_id: string;
}

// === Adjustment Types (Issue 1: Compliance-friendly corrections) ===

/**
 * Transaction kind: distinguishes original entries from corrections.
 *
 * - `original`: Standard transaction (buy-in, cashout)
 * - `adjustment`: Correction to a previous transaction
 * - `reversal`: Complete undo of an adjustment
 */
export type FinancialTxnKind = 'original' | 'adjustment' | 'reversal';

/**
 * Reason codes for financial adjustments.
 * Required for audit trail compliance.
 */
export type AdjustmentReasonCode =
  | 'data_entry_error' // Staff entered wrong amount
  | 'duplicate' // Transaction was recorded twice
  | 'wrong_player' // Applied to wrong player
  | 'wrong_amount' // Amount was incorrect
  | 'system_bug' // System created erroneous record
  | 'other'; // Requires detailed note

/**
 * Input for creating a financial adjustment.
 *
 * Adjustments are compliance-friendly corrections that don't modify
 * or delete original transactions. Instead, they add a new record
 * that explains the correction.
 *
 * @see rpc_create_financial_adjustment in database
 */
export interface CreateFinancialAdjustmentInput {
  /** Casino ID (must match RLS context) */
  casino_id: string;
  /** Player ID */
  player_id: string;
  /** Visit ID */
  visit_id: string;
  /**
   * Delta amount in cents (signed).
   * - Positive: increases total (e.g., +5000 cents = +$50 if buy-in was under-reported)
   * - Negative: decreases total (e.g., -10000 cents = -$100 if buy-in was over-reported)
   */
  delta_amount: number;
  /** Reason for the adjustment (required) */
  reason_code: AdjustmentReasonCode;
  /** Detailed explanation (required, min 10 chars) */
  note: string;
  /** Optional: Link to the original transaction being corrected */
  original_txn_id?: string;
  /** Optional: Idempotency key for duplicate prevention */
  idempotency_key?: string;
}

/**
 * Visit cash-in summary with adjustments breakdown.
 *
 * Provides the UX of "editable total" while preserving audit trail.
 * Shows: Original entries, adjustment total, and net total.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Computed aggregate DTO, not a table projection
export type VisitCashInWithAdjustmentsDTO = {
  /** Sum of original 'in' transactions in cents (before adjustments) */
  original_total: number;
  /** Sum of all adjustment transactions in cents (can be negative) */
  adjustment_total: number;
  /** Net total in cents (original_total + adjustment_total) */
  net_total: number;
  /** Number of adjustment transactions */
  adjustment_count: number;
};
