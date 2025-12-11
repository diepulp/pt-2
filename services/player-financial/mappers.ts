/**
 * PlayerFinancialService Mappers
 *
 * Type-safe transformations from Supabase rows/views to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see PRD-009 Player Financial Service
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327-365
 */

import type { Database } from "@/types/database.types";

import type { FinancialTransactionDTO, VisitFinancialSummaryDTO } from "./dtos";

// === Selected Row Types ===

/**
 * Type for rows returned by financial transaction queries.
 * Uses generated Database types for type safety.
 */
type FinancialTransactionRow =
  Database["public"]["Tables"]["player_financial_transaction"]["Row"];

/**
 * Type for RPC response from rpc_create_financial_txn.
 * Returns the full transaction record.
 */
type CreateFinancialTxnRpcResponse = FinancialTransactionRow;

/**
 * Type for rows returned by visit_financial_summary view.
 */
type VisitFinancialSummaryRow =
  Database["public"]["Views"]["visit_financial_summary"]["Row"];

// === Financial Transaction Mappers ===

/**
 * Maps a financial transaction row to FinancialTransactionDTO.
 * Explicitly maps all public fields.
 */
export function toFinancialTransactionDTO(
  row: FinancialTransactionRow,
): FinancialTransactionDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    player_id: row.player_id,
    visit_id: row.visit_id,
    rating_slip_id: row.rating_slip_id,
    amount: row.amount,
    direction: row.direction,
    source: row.source,
    tender_type: row.tender_type ?? "",
    created_by_staff_id: row.created_by_staff_id,
    related_transaction_id: row.related_transaction_id,
    created_at: row.created_at,
    gaming_day: row.gaming_day,
    idempotency_key: row.idempotency_key,
  };
}

/**
 * Maps an array of financial transaction rows to FinancialTransactionDTO[].
 */
export function toFinancialTransactionDTOList(
  rows: FinancialTransactionRow[],
): FinancialTransactionDTO[] {
  return rows.map(toFinancialTransactionDTO);
}

/**
 * Maps a nullable financial transaction row to FinancialTransactionDTO | null.
 */
export function toFinancialTransactionDTOOrNull(
  row: FinancialTransactionRow | null,
): FinancialTransactionDTO | null {
  return row ? toFinancialTransactionDTO(row) : null;
}

/**
 * Maps rpc_create_financial_txn response to FinancialTransactionDTO.
 */
export function toFinancialTransactionDTOFromRpc(
  response: CreateFinancialTxnRpcResponse,
): FinancialTransactionDTO {
  return toFinancialTransactionDTO(response);
}

// === Visit Financial Summary Mappers ===

/**
 * Maps a visit_financial_summary view row to VisitFinancialSummaryDTO.
 */
export function toVisitFinancialSummaryDTO(
  row: VisitFinancialSummaryRow,
): VisitFinancialSummaryDTO {
  // View columns are nullable due to GROUP BY; provide safe defaults
  return {
    visit_id: row.visit_id ?? "",
    casino_id: row.casino_id ?? "",
    total_in: row.total_in ?? 0,
    total_out: row.total_out ?? 0,
    net_amount: row.net_amount ?? 0,
    transaction_count: row.transaction_count ?? 0,
    first_transaction_at: row.first_transaction_at,
    last_transaction_at: row.last_transaction_at,
  };
}

/**
 * Maps a nullable visit financial summary row to VisitFinancialSummaryDTO | null.
 */
export function toVisitFinancialSummaryDTOOrNull(
  row: VisitFinancialSummaryRow | null,
): VisitFinancialSummaryDTO | null {
  return row ? toVisitFinancialSummaryDTO(row) : null;
}

/**
 * Maps an array of visit financial summary rows to VisitFinancialSummaryDTO[].
 */
export function toVisitFinancialSummaryDTOList(
  rows: VisitFinancialSummaryRow[],
): VisitFinancialSummaryDTO[] {
  return rows.map(toVisitFinancialSummaryDTO);
}
