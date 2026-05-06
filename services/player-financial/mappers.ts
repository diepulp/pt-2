/**
 * PlayerFinancialService Mappers
 *
 * Type-safe transformations from Supabase rows/views to DTOs.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * Financial envelope wrapping (PRD-070 WS2): `VisitCashInWithAdjustmentsDTO`
 * currency totals are wrapped as `FinancialValue` here via
 * `toVisitCashInWithAdjustmentsDTO`. Other currency fields on this service
 * (`FinancialTransactionDTO.amount`, `VisitFinancialSummaryDTO.*`) are Phase 1.2
 * deferrals — see `dtos.ts` for the inline DEFERRED annotations.
 *
 * @see PRD-009 Player Financial Service
 * @see PRD-070 Financial Telemetry Wave 1 Phase 1.1
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 327-365
 */

import { financialValueSchema } from '@/lib/financial/schema';
import type { Database } from '@/types/database.types';

import type {
  FinancialTransactionDTO,
  VisitCashInWithAdjustmentsDTO,
  VisitFinancialSummaryDTO,
} from './dtos';

// === Selected Row Types ===

/**
 * Type for rows returned by financial transaction queries.
 * Uses generated Database types for type safety.
 */
type FinancialTransactionRow =
  Database['public']['Tables']['player_financial_transaction']['Row'];

/**
 * Type for RPC response from rpc_create_financial_txn.
 * Returns the full transaction record.
 */
type CreateFinancialTxnRpcResponse = FinancialTransactionRow;

/**
 * Type for rows returned by visit_financial_summary view.
 */
type VisitFinancialSummaryRow =
  Database['public']['Views']['visit_financial_summary']['Row'];

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
    visit_id: row.visit_id ?? '',
    rating_slip_id: row.rating_slip_id,
    amount: row.amount,
    direction: row.direction ?? 'in',
    source: row.source ?? 'pit',
    tender_type: row.tender_type ?? '',
    created_by_staff_id: row.created_by_staff_id,
    related_transaction_id: row.related_transaction_id,
    created_at: row.created_at,
    gaming_day: row.gaming_day,
    idempotency_key: row.idempotency_key,
    txn_kind: row.txn_kind,
    reason_code: row.reason_code,
    note: row.note,
    external_ref: row.external_ref,
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
  // View columns are nullable due to GROUP BY; provide safe defaults.
  // completeness.status is always 'unknown' at this layer — visit lifecycle
  // is not available from the view. BFF routes may override when constructing
  // surface DTOs (PRD-080 §4B projection constraint).
  return {
    visit_id: row.visit_id ?? '',
    casino_id: row.casino_id ?? '',
    total_in: financialValueSchema.parse({
      value: row.total_in ?? 0,
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'unknown' },
    }),
    total_out: financialValueSchema.parse({
      value: row.total_out ?? 0,
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'unknown' },
    }),
    net_amount: financialValueSchema.parse({
      value: row.net_amount ?? 0,
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'unknown' },
    }),
    event_count: row.event_count ?? 0,
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

// === Visit Cash-In With Adjustments Mappers ===

/**
 * Shape of the `get_visit_cash_in_with_adjustments` RPC row after coercion.
 * Source totals are numeric columns; coerce via Number() at the boundary.
 */
type VisitCashInWithAdjustmentsRpcRow = {
  original_total: number | string | null;
  adjustment_total: number | string | null;
  net_total: number | string | null;
  adjustment_count: number | string | null;
};

/**
 * Maps `get_visit_cash_in_with_adjustments` RPC row to its DTO.
 *
 * Currency totals are wrapped as `FinancialValue` per
 * WAVE-1-CLASSIFICATION-RULES §3.1 (PFT visit aggregates). Visit lifecycle
 * is not knowable at this layer — completeness emits `'unknown'` explicitly
 * per PRD-070 WS1 contract ("never omit; `'unknown'` when the mapper cannot
 * determine"). Downstream consumers with visit-state context may re-wrap
 * with lifecycle-aware completeness.
 */
export function toVisitCashInWithAdjustmentsDTO(
  row: VisitCashInWithAdjustmentsRpcRow | null,
): VisitCashInWithAdjustmentsDTO {
  if (!row) {
    return {
      original_total: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      adjustment_total: {
        value: 0,
        type: 'actual',
        source: 'PFT.adjustment',
        completeness: { status: 'unknown' },
      },
      net_total: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      adjustment_count: 0,
    };
  }

  const originalCents = Number(row.original_total) || 0;
  const adjustmentCents = Number(row.adjustment_total) || 0;
  const netCents = Number(row.net_total) || 0;

  return {
    original_total: {
      value: originalCents,
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'unknown' },
    },
    adjustment_total: {
      value: adjustmentCents,
      type: 'actual',
      source: 'PFT.adjustment',
      completeness: { status: 'unknown' },
    },
    net_total: {
      value: netCents,
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'unknown' },
    },
    adjustment_count: Number(row.adjustment_count) || 0,
  };
}
