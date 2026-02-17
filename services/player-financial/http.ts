/**
 * PlayerFinancialService HTTP Fetchers
 *
 * Client-side fetch functions for PlayerFinancialService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS2
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';
import { createBrowserComponentClient } from '@/lib/supabase/client';

import type {
  CreateFinancialAdjustmentInput,
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitCashInWithAdjustmentsDTO,
  VisitFinancialSummaryDTO,
} from './dtos';

const BASE = '/api/v1/financial-transactions';

// === Helper Functions ===

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Financial Transaction CRUD ===

/**
 * Creates a new financial transaction.
 * Idempotent via server-side idempotency key handling.
 *
 * POST /api/v1/financial-transactions
 */
export async function createFinancialTransaction(
  input: CreateFinancialTxnInput,
): Promise<FinancialTransactionDTO> {
  return fetchJSON<FinancialTransactionDTO>(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: input.idempotency_key || generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Fetches a paginated list of financial transactions with optional filters.
 *
 * GET /api/v1/financial-transactions?player_id=X&visit_id=Y&direction=Z&limit=N&cursor=C
 */
export async function listFinancialTransactions(
  query: FinancialTxnListQuery = {},
): Promise<{ items: FinancialTransactionDTO[]; cursor: string | null }> {
  const {
    player_id,
    visit_id,
    table_id,
    direction,
    source,
    tender_type,
    gaming_day,
    limit,
    cursor,
  } = query;

  const params = buildParams({
    player_id,
    visit_id,
    table_id,
    direction,
    source,
    tender_type,
    gaming_day,
    limit,
    cursor,
  });

  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: FinancialTransactionDTO[]; cursor: string | null }>(
    url,
  );
}

/**
 * Fetches a single financial transaction by ID.
 *
 * GET /api/v1/financial-transactions/{id}
 */
export async function getFinancialTransaction(
  id: string,
): Promise<FinancialTransactionDTO> {
  return fetchJSON<FinancialTransactionDTO>(`${BASE}/${id}`);
}

// === Visit Financial Summary ===

/**
 * Fetches aggregated financial summary for a visit.
 * Returns totals for in/out transactions, net amount, and transaction count.
 *
 * GET /api/v1/financial-transactions/visit/{visitId}/summary
 */
export async function getVisitFinancialSummary(
  visitId: string,
): Promise<VisitFinancialSummaryDTO> {
  return fetchJSON<VisitFinancialSummaryDTO>(
    `${BASE}/visit/${visitId}/summary`,
  );
}

// === Financial Adjustments (Issue 1: Compliance-friendly corrections) ===

/**
 * Error class for financial adjustment operations.
 */
export class FinancialAdjustmentError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinancialAdjustmentError';
  }
}

/**
 * Creates a financial adjustment via RPC.
 *
 * Adjustments are compliance-friendly corrections that don't modify
 * or delete original transactions. They add a new record with:
 * - txn_kind = 'adjustment'
 * - reason_code (required)
 * - note (required, min 10 chars)
 * - optional link to original transaction
 *
 * @param input - Adjustment creation input
 * @returns Created adjustment transaction DTO
 * @throws FinancialAdjustmentError on validation or authorization failures
 *
 * @example
 * ```ts
 * const adjustment = await createFinancialAdjustment({
 *   casino_id: 'uuid',
 *   player_id: 'uuid',
 *   visit_id: 'uuid',
 *   delta_amount: -100, // Reduce total by $100
 *   reason_code: 'data_entry_error',
 *   note: 'Original buy-in was entered as $500 but should have been $400',
 * });
 * ```
 */
export async function createFinancialAdjustment(
  input: CreateFinancialAdjustmentInput,
): Promise<FinancialTransactionDTO> {
  const supabase = createBrowserComponentClient();

  const { data, error } = await supabase.rpc(
    'rpc_create_financial_adjustment',
    {
      p_casino_id: input.casino_id,
      p_player_id: input.player_id,
      p_visit_id: input.visit_id,
      p_delta_amount: input.delta_amount,
      p_reason_code: input.reason_code,
      p_note: input.note,
      p_original_txn_id: input.original_txn_id,
      p_idempotency_key: input.idempotency_key,
    },
  );

  if (error) {
    const message = error.message || '';

    if (message.includes('UNAUTHORIZED')) {
      throw new FinancialAdjustmentError(
        'UNAUTHORIZED',
        'You are not authorized to create adjustments. Please log in.',
      );
    }
    if (message.includes('FORBIDDEN')) {
      throw new FinancialAdjustmentError(
        'FORBIDDEN',
        'Your role is not authorized to create financial adjustments.',
      );
    }
    if (message.includes('NOT_FOUND')) {
      throw new FinancialAdjustmentError(
        'NOT_FOUND',
        'The original transaction was not found.',
      );
    }
    if (message.includes('INVALID_INPUT')) {
      throw new FinancialAdjustmentError(
        'INVALID_INPUT',
        message.replace(/^INVALID_INPUT:\s*/, ''),
      );
    }

    throw new FinancialAdjustmentError(
      'INTERNAL_ERROR',
      message || 'Failed to create adjustment',
    );
  }

  if (!data) {
    throw new FinancialAdjustmentError(
      'INTERNAL_ERROR',
      'No data returned from adjustment creation',
    );
  }

  // Map snake_case response to DTO
  // Note: direction, source, tender_type are guaranteed non-null for adjustments
  return {
    id: data.id,
    casino_id: data.casino_id,
    player_id: data.player_id,
    visit_id: data.visit_id,
    rating_slip_id: data.rating_slip_id,
    amount: data.amount,
    direction: data.direction ?? 'in',
    source: data.source ?? 'pit',
    tender_type: data.tender_type ?? 'adjustment',
    created_by_staff_id: data.created_by_staff_id,
    related_transaction_id: data.related_transaction_id,
    created_at: data.created_at,
    gaming_day: data.gaming_day,
    idempotency_key: data.idempotency_key,
    txn_kind: data.txn_kind,
    reason_code: data.reason_code,
    note: data.note,
    external_ref: data.external_ref,
  };
}

/**
 * Gets visit cash-in totals with adjustments breakdown.
 *
 * Returns:
 * - original_total: Sum of original 'in' transactions
 * - adjustment_total: Sum of adjustment transactions (can be negative)
 * - net_total: original_total + adjustment_total
 * - adjustment_count: Number of adjustments
 *
 * @param visitId - Visit ID to query
 * @returns Cash-in summary with adjustments breakdown
 */
export async function getVisitCashInWithAdjustments(
  visitId: string,
): Promise<VisitCashInWithAdjustmentsDTO> {
  const supabase = createBrowserComponentClient();

  const { data, error } = await supabase.rpc(
    'get_visit_cash_in_with_adjustments',
    {
      p_visit_id: visitId,
    },
  );

  if (error) {
    throw new FinancialAdjustmentError(
      'QUERY_ERROR',
      error.message || 'Failed to get cash-in summary',
    );
  }

  // RPC returns a single row (not an array)
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    // No transactions for this visit - return zeros
    return {
      original_total: 0,
      adjustment_total: 0,
      net_total: 0,
      adjustment_count: 0,
    };
  }

  return {
    original_total: Number(row.original_total) || 0,
    adjustment_total: Number(row.adjustment_total) || 0,
    net_total: Number(row.net_total) || 0,
    adjustment_count: Number(row.adjustment_count) || 0,
  };
}
