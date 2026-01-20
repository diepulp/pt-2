/**
 * Player Financial Service React Query Hooks
 *
 * Hooks for financial transaction queries and mutations:
 * - Transaction detail and list queries
 * - Visit financial summary (aggregated totals)
 * - Create transaction mutation
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS4
 */

// Query key factory
export { playerFinancialKeys } from './keys';

// Transaction query hooks
export {
  useFinancialTransaction,
  useFinancialTransactions,
  useVisitFinancialSummary,
} from './use-financial-transactions';

// Mutation hooks
export {
  useCreateFinancialTransaction,
  useCreateFinancialAdjustment,
  type CreateFinancialTxnInput,
  type CreateFinancialAdjustmentInput,
} from './use-financial-mutations';

// Re-export DTOs for convenience
export type {
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitFinancialSummaryDTO,
  VisitCashInWithAdjustmentsDTO,
  FinancialDirection,
  FinancialSource,
  TenderType,
  FinancialTxnKind,
  AdjustmentReasonCode,
} from '@/services/player-financial/dtos';
