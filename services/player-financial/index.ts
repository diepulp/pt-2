/**
 * PlayerFinancialService Factory
 *
 * Functional factory for player financial transaction management.
 * Pattern A: Contract-First with manual DTOs for cross-context consumption.
 *
 * Key invariants:
 * - All transactions are append-only (immutable after creation)
 * - Transactions must be associated with an active visit
 * - Amount must always be positive (direction indicates flow)
 * - RPC handles idempotency and validation
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS2
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section PlayerFinancialService
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitFinancialSummaryDTO,
} from "./dtos";

// Re-export DTOs, keys, and HTTP fetchers for consumers
export * from "./dtos";
export * from "./keys";
export * from "./http";

// === Service Interface ===

/**
 * PlayerFinancialService interface - explicit, no ReturnType inference.
 *
 * All write operations require RLS context (casino_id, created_by_staff_id).
 * Read operations are automatically scoped by RLS policies.
 */
export interface PlayerFinancialService {
  /**
   * Creates a new financial transaction with idempotency.
   * Uses rpc_create_financial_txn which validates:
   * - Visit exists and is active
   * - Amount is positive
   * - Direction and source are valid enum values
   * - Idempotency key is unique (if provided)
   *
   * @param input - Transaction creation input
   * @returns Created transaction DTO
   * @throws TRANSACTION_AMOUNT_INVALID if amount <= 0
   * @throws VISIT_NOT_FOUND if visit doesn't exist
   * @throws VISIT_NOT_OPEN if visit is not active
   * @throws PLAYER_NOT_FOUND if player doesn't exist
   * @throws IDEMPOTENCY_CONFLICT if idempotency key already used
   */
  create(input: CreateFinancialTxnInput): Promise<FinancialTransactionDTO>;

  /**
   * Gets a single financial transaction by ID.
   * Returns null if not found or not accessible via RLS.
   *
   * @param id - Transaction UUID
   * @returns Transaction DTO or null
   */
  getById(id: string): Promise<FinancialTransactionDTO | null>;

  /**
   * Gets a financial transaction by idempotency key.
   * Used for duplicate detection in idempotent POST requests.
   *
   * @param casinoId - Casino UUID for RLS scoping
   * @param idempotencyKey - Idempotency key to search for
   * @returns Transaction DTO or null if not found
   */
  getByIdempotencyKey(
    casinoId: string,
    idempotencyKey: string,
  ): Promise<FinancialTransactionDTO | null>;

  /**
   * Lists financial transactions with pagination and filters.
   * Results are automatically scoped to the casino via RLS.
   *
   * Filters:
   * - player_id: Filter by player
   * - visit_id: Filter by visit
   * - table_id: Filter by gaming table (via rating_slip join)
   * - direction: Filter by 'in' or 'out'
   * - source: Filter by 'pit', 'cage', or 'system'
   * - tender_type: Filter by tender type (cash, chips, marker, etc.)
   * - gaming_day: Filter by gaming day (ISO date YYYY-MM-DD)
   *
   * @param query - List filters and pagination params
   * @returns Paginated transaction list with cursor
   */
  list(query: FinancialTxnListQuery): Promise<{
    items: FinancialTransactionDTO[];
    cursor: string | null;
  }>;

  /**
   * Gets aggregated financial summary for a visit.
   * Uses visit_financial_summary materialized view.
   *
   * Returns:
   * - total_in: Sum of all 'in' transactions
   * - total_out: Sum of all 'out' transactions
   * - net_amount: total_in - total_out
   * - transaction_count: Number of transactions
   * - first/last transaction timestamps
   *
   * @param visitId - Visit UUID
   * @returns Visit financial summary with totals
   */
  getVisitSummary(visitId: string): Promise<VisitFinancialSummaryDTO>;
}

// === Service Factory ===

/**
 * Creates a PlayerFinancialService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createPlayerFinancialService(
  supabase: SupabaseClient<Database>,
): PlayerFinancialService {
  return {
    create: (input) => crud.createTransaction(supabase, input),
    getById: (id) => crud.getById(supabase, id),
    getByIdempotencyKey: (casinoId, idempotencyKey) =>
      crud.getByIdempotencyKey(supabase, casinoId, idempotencyKey),
    list: (query) => crud.list(supabase, query),
    getVisitSummary: (visitId) => crud.getVisitSummary(supabase, visitId),
  };
}
