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

import { fetchJSON } from "@/lib/http/fetch-json";
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";

import type {
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitFinancialSummaryDTO,
} from "./dtos";

const BASE = "/api/v1/financial-transactions";

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
    method: "POST",
    headers: {
      "content-type": "application/json",
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
