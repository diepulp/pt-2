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
export type FinancialDirection = "in" | "out";

/**
 * Transaction source/origin.
 *
 * - `pit`: Originated at gaming table (pit boss action)
 * - `cage`: Originated at cashier cage (cashier action)
 * - `system`: System-generated (automated processes)
 */
export type FinancialSource = "pit" | "cage" | "system";

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
  /** Transaction amount (always positive, direction indicates flow) */
  amount: number;
  /** Transaction direction ('in' or 'out') */
  direction: FinancialDirection;
  /** Transaction source ('pit', 'cage', 'system') */
  source: FinancialSource;
  /** Tender type (cash, chips, marker, etc.) */
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
  /** Total amount IN (buy-ins, markers issued) */
  total_in: number;
  /** Total amount OUT (cashouts, marker repayments) */
  total_out: number;
  /** Net amount (total_in - total_out) */
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
  /** Transaction amount (positive number) */
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
