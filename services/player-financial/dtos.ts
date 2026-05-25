/**
 * PlayerFinancialService DTOs
 *
 * Pattern A (Contract-First): Manual interfaces for cross-context consumption.
 * Financial transactions are append-only ledger entries consumed by multiple services.
 *
 * Financial envelope wrapping (PRD-070 WS2):
 *   - `VisitCashInWithAdjustmentsDTO.{original_total,adjustment_total,net_total}`
 *     are wrapped in `FinancialValue` per WAVE-1-CLASSIFICATION-RULES §3.1
 *     (PFT visit aggregate).
 *   - `FinancialTransactionDTO.amount` and `VisitFinancialSummaryDTO.*` are
 *     DEFERRED to Phase 1.2 — wrapping cascades into UI consumers in
 *     `app/(dashboard)/cashier/...`, `components/cashier/`,
 *     `hooks/mtl/use-patron-daily-total.ts`, and the WS4 modal-data route.
 *     See inline DEFERRED annotations for specific consumer paths and
 *     classification targets.
 *   - Input DTOs (`CreateFinancialTxnInput.amount`,
 *     `CreateFinancialAdjustmentInput.delta_amount`) keep bare `number` per
 *     §6.1 carve-out (operator input).
 *
 * @see PRD-009 Player Financial Service
 * @see PRD-070 Financial Telemetry Wave 1 Phase 1.1
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section PlayerFinancialService
 * @see EXECUTION-SPEC-PRD-009.md
 */

import type { Database } from '@/types/database.types';
import type { FinancialValue } from '@/types/financial';

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
  /**
   * Transaction amount in cents (1 dollar = 100). Can be negative for adjustments.
   *
   * DEFERRED (PRD-070 WS2 → Phase 1.2): wrapping in `FinancialValue` cascades
   * into UI consumers that read `.amount` as a bare number:
   *   - `components/cashier/void-confirmation-dialog.tsx:117`
   *   - `app/(dashboard)/cashier/patron-transactions/patron-transactions-view.tsx:236`
   * Phase 1.1 G1 deferral — requires paired direct-consumer workstream.
   * Classification target when wrapped (CLASSIFICATION-RULES §3.1):
   *   type `'actual'`, source `"PFT"` (or `"PFT.adjustment"` when
   *   `txn_kind === 'adjustment'`), completeness `'complete'` per row.
   */
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
 *
 * Currency fields are wrapped as `FinancialValue` per PRD-080 WS2
 * (CLASSIFICATION-RULES §3.1 PFT visit aggregate):
 *   type `'actual'`, source `"PFT"`, completeness `'unknown'` at service layer
 *   (visit lifecycle not available at mapper level — BFF routes with visit context
 *   may project completeness contextually per PRD-080 §4B).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated response type
export interface VisitFinancialSummaryDTO {
  /** Visit ID */
  visit_id: string;
  /** Casino scope */
  casino_id: string;
  /** Total amount IN. Envelope: actual / PFT / unknown (see type doc). */
  total_in: FinancialValue;
  /** Total amount OUT. Envelope: actual / PFT / unknown. */
  total_out: FinancialValue;
  /** Net amount (total_in − total_out). Envelope: actual / PFT / unknown. */
  net_amount: FinancialValue;
  /** Number of transactions */
  event_count: number;
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
  /**
   * Transaction amount in cents (positive number).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.1): operator input — bare number.
   * The committed transaction is emitted via `FinancialTransactionDTO.amount`
   * (which is itself a Phase 1.2 deferral — see that DTO's annotation).
   */
  amount: number;
  /** Transaction direction */
  direction: FinancialDirection;
  /** Transaction source */
  source: FinancialSource;
  /** Tender type */
  tender_type: TenderType;
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
  /** Player ID */
  player_id: string;
  /** Visit ID */
  visit_id: string;
  /**
   * Delta amount in cents (signed).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.1): operator input — bare number.
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
 *
 * Currency totals are wrapped in `FinancialValue` per PRD-070 WS2
 * (CLASSIFICATION-RULES §3.1 PFT visit aggregates). Visit-lifecycle is not
 * resolvable at this aggregation layer, so completeness is emitted as
 * `'unknown'` — consumers that know the visit state may re-wrap with
 * lifecycle-aware completeness.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Computed aggregate DTO, not a table projection
export type VisitCashInWithAdjustmentsDTO = {
  /**
   * Sum of original 'in' transactions in cents (before adjustments).
   * Envelope: `actual` / `"PFT"` / completeness based on visit-lifecycle (see type doc).
   */
  original_total: FinancialValue;
  /**
   * Sum of all adjustment transactions in cents (can be negative).
   * Envelope: `actual` / `"PFT.adjustment"` / completeness based on visit-lifecycle.
   */
  adjustment_total: FinancialValue;
  /**
   * Net total in cents (original_total.value + adjustment_total.value).
   * Envelope: `actual` / `"PFT"` / completeness inherits from inputs (worst-of).
   */
  net_total: FinancialValue;
  /** Number of adjustment transactions */
  adjustment_count: number;
};

// === Transactional Outbox DTOs (Wave 2 — PRD-081) ===

// Derived from Wave 2 finance_outbox Row (WS1_DDL). Picks string-compatible fields
// directly; payload narrowed from Json → Record<string, unknown>; union types narrowed.
type FinancialOutboxRow = Database['public']['Tables']['finance_outbox']['Row'];

/**
 * Exposure: consumer-facing event envelope for downstream adjustment processors.
 * Excludes: delivery_attempts, last_attempted_at, last_error (internal retry/error state — ADR-054 Wave 2).
 *
 * gaming_day added in PRD-087 Gate A (requires `npm run db:types-local` after M1–M5 migrations).
 */
export type FinancialOutboxEventDTO = Pick<
  FinancialOutboxRow,
  | 'event_id'
  | 'event_type'
  | 'casino_id'
  | 'table_id'
  | 'player_id'
  | 'aggregate_id'
  | 'gaming_day'
  | 'created_at'
  | 'processed_at'
> & {
  fact_class: 'ledger' | 'operational';
  origin_label: 'actual' | 'estimated' | 'observed' | 'compliance';
  payload: Record<string, unknown>;
};

// === Admin Observability DTOs (Wave 2 Phase 2.3a — PRD-086) ===
//
// Standalone types — NOT extending FinancialOutboxEventDTO.
// FinancialOutboxEventDTO is the frozen consumer contract (excludes relay fields).
// OutboxAdminEventDTO is the observability contract (includes relay lifecycle fields).
// Both derive from the same DB row source but evolve independently.

/**
 * Full outbox row shape for the internal admin observability surface.
 * Includes relay lifecycle fields (delivery_attempts, last_attempted_at, last_error)
 * that are intentionally absent from FinancialOutboxEventDTO.
 * origin_label and fact_class pass through from the DB row unchanged — no synthetic
 * reconstruction or upgrade is permitted at any layer (ADR-054 D5).
 */
export type OutboxAdminEventDTO = Pick<
  FinancialOutboxRow,
  | 'event_id'
  | 'event_type'
  | 'casino_id'
  | 'table_id'
  | 'player_id'
  | 'aggregate_id'
  | 'created_at'
  | 'processed_at'
  | 'delivery_attempts'
  | 'last_attempted_at'
  | 'last_error'
> & {
  fact_class: 'ledger' | 'operational';
  origin_label: 'actual' | 'estimated' | 'observed' | 'compliance';
  payload: Record<string, unknown>;
};

/**
 * Relay health summary for the internal admin observability surface.
 * Derived from rpc_get_outbox_relay_health Returns[number] — single health row.
 * oldest_pending_age_seconds is null when there are no pending rows.
 */
export type OutboxRelayHealthDTO =
  Database['public']['Functions']['rpc_get_outbox_relay_health']['Returns'][number];

// === Operational Consumer DTOs (Wave 2 Phase 2.4 — PRD-088) ===

/**
 * DTO boundary result for the operational outbox consumer.
 * Internal OperationalConsumerResult uses errors: Error[]; this DTO serializes to string[].
 * Skipped (skipped_ledger, skipped_unknown) and not_found outcomes are represented as errors.
 *
 * `lagSamplesMs` (Phase 2.5, PRD-089 WS1_LOG): DB-clock derived per-row lag in
 * milliseconds for rows that processed successfully this cycle. Excluded outcomes
 * (duplicate / skipped / failed / claim-error / auth-fail) contribute zero samples
 * by construction — they are not in the event_id set passed to the lag query.
 * Internal contract for log emission; stripped from the HTTP response body.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Consumer result DTO; not a table projection, errors serialized at boundary
export type OperationalConsumerResultDTO = {
  processed: number;
  duplicate: number;
  errors: string[];
  lagSamplesMs: number[];
};

/**
 * Operational backlog breakdown for observability surfaces.
 * Distinguishes claimable rows (delivery_attempts < 5) from dead-letter rows (>= 5).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Observability aggregate; not a direct table projection
export type OutboxOperationalBacklogDTO = {
  claimable: number;
  deadLetter: number;
};

// === Operational Projection Response DTO (Wave 2 Phase 2.4 — PRD-088) ===

/**
 * Response shape for GET /api/v1/table-context/operational-projection.
 * Derived from shift_operational_projection via service-role read.
 *
 * type is always 'estimated' per ADR-054 R4 authority degradation rule —
 * no layer may upgrade shift_operational_projection-derived values to 'actual'.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF projection response; aggregates service-role row with completeness status
export type OperationalProjectionResponseDTO = {
  totalCents: number;
  count: number;
  completeness: { status: 'complete' | 'partial' | 'unknown' };
  type: 'estimated';
};

// === Relay Cycle Observability DTOs (Wave 2 Phase 2.5 — PRD-089 WS1_LOG) ===
//
// Internal contracts emitted by the relay route as one structured log line per
// cycle. These types describe log shape only — they are NOT exposed in the
// HTTP response body (the route preserves its prior `{ classA, operational }`
// JSON contract).
//
// Predicate parity (P1-BACKLOG-CLAIMABILITY-DEFINITION audit patch):
// operational backlog SQL predicates include `event_type IN
// ('grind.observed','fill.recorded','credit.recorded')` to match the
// `rpc_claim_operational_outbox_batch` claim path verbatim. The EXEC-SPEC
// canonical table did not enumerate this event_type whitelist; the RPC is the
// source of truth and the log-line follows it (drift flagged at WS1 dispatch).

/**
 * Class A relay branch result — extended for Phase 2.5 with `lagSamplesMs`.
 *
 * `lagSamplesMs` (P1-LAG-SAMPLE-CLOCK-CONTRACT): DB-clock derived per-row lag
 * in milliseconds for rows that processed successfully this cycle.
 * Internal contract for log emission; stripped from the HTTP response body.
 */
export type ClassARelayBranchResult = {
  processed: number;
  failed: number;
  lagSamplesMs: number[];
};

/**
 * Outbox backlog breakdown emitted in the relay cycle log line.
 *
 * Predicates match the claim RPC source of truth verbatim:
 *   ledger.total       = fact_class='ledger' AND processed_at IS NULL
 *   operational.claimable
 *                      = fact_class='operational'
 *                        AND event_type IN ('grind.observed','fill.recorded','credit.recorded')
 *                        AND processed_at IS NULL
 *                        AND delivery_attempts < 5
 *   operational.dead_letter
 *                      = fact_class='operational'
 *                        AND event_type IN ('grind.observed','fill.recorded','credit.recorded')
 *                        AND processed_at IS NULL
 *                        AND delivery_attempts >= 5
 *   operational.total  = claimable + dead_letter (computed in TS)
 */
export type OutboxBacklogSize = {
  ledger: { total: number };
  operational: { claimable: number; dead_letter: number; total: number };
};

/**
 * Lag-aggregate summary emitted in the relay cycle log line.
 * Computed from the combined Class A + operational lag sample array.
 * `null` when the combined sample array is empty (no rows processed this cycle).
 */
export type LagAggregates = {
  min: number;
  p50: number;
  p95: number;
  max: number;
};

/**
 * Authenticated relay cycle log line (FR-1).
 * Emitted when CRON_SECRET auth passed; covers both `ok` (no branch errors)
 * and `error` (at least one branch produced an error) outcomes.
 */
export type OutboxRelayCycleLogCycle = {
  cycle: 'outbox_relay_cycle';
  outcome: 'ok' | 'error';
  outbox_backlog_size: OutboxBacklogSize;
  lag_ms: LagAggregates | null;
  relay_duration_ms: number;
  class_a_branch: { processed: number; failed: number };
  operational_branch: { processed: number; duplicate: number; errors: number };
};

/**
 * Unauthenticated relay cycle log line (FR-2).
 * Emitted when CRON_SECRET auth failed; only minimal fields (no backlog/lag).
 */
export type OutboxRelayCycleLogAuthFail = {
  cycle: 'outbox_relay_cycle';
  outcome: 'auth_fail';
  relay_duration_ms: number;
};

/**
 * Structured log line shape — discriminated union of FR-1 and FR-2 variants.
 */
export type OutboxRelayCycleLog =
  | OutboxRelayCycleLogCycle
  | OutboxRelayCycleLogAuthFail;
