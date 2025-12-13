/**
 * LoyaltyService Factory
 *
 * Functional factory for loyalty ledger management.
 * Pattern A: Contract-First with manual DTOs for cross-context consumption.
 *
 * Key invariants:
 * - All transactions are append-only (immutable after creation)
 * - Base accrual uses deterministic theo calculation from policy_snapshot
 * - Redemptions require note and can support controlled overdraw
 * - RPC handles idempotency and validation
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS4
 * @see ADR-019 Loyalty Points Policy
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section LoyaltyService
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  AccrueOnCloseInput,
  AccrueOnCloseOutput,
  ApplyPromotionInput,
  ApplyPromotionOutput,
  LedgerListQuery,
  LedgerPageResponse,
  ManualCreditInput,
  ManualCreditOutput,
  PlayerLoyaltyDTO,
  RedeemInput,
  RedeemOutput,
  SessionRewardSuggestionOutput,
} from './dtos';
import type { ReconcileBalanceRpcResponse } from './mappers';

// Re-export DTOs, keys, and HTTP fetchers for consumers
export * from './dtos';
export * from './keys';
export * from './http';

// Re-export schemas selectively (avoid type conflicts with dtos)
export {
  loyaltyReasonSchema,
  accrueOnCloseInputSchema,
  redeemInputSchema,
  manualCreditInputSchema,
  applyPromotionInputSchema,
  suggestionQuerySchema,
  balanceQuerySchema,
  ledgerListQuerySchema,
  encodeLedgerCursor,
  decodeLedgerCursor,
} from './schemas';

// === Service Interface ===

/**
 * LoyaltyService interface - explicit, no ReturnType inference.
 *
 * All write operations require RLS context (casino_id, staff_role).
 * Read operations are automatically scoped by RLS policies.
 */
export interface LoyaltyService {
  /**
   * Triggers base accrual on rating slip close.
   * Uses deterministic theo calculation from policy_snapshot.loyalty.
   * Idempotent: duplicate calls return existing entry.
   *
   * @param input - Accrual input with rating slip ID and idempotency key
   * @returns AccrueOnCloseOutput with ledger entry and balance info
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_OPEN if slip is not closed
   * @throws RATING_SLIP_MISSING_REQUIRED_DATA if policy snapshot is missing
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  accrueOnClose(input: AccrueOnCloseInput): Promise<AccrueOnCloseOutput>;

  /**
   * Issues a comp redemption (debit).
   * Supports controlled overdraw with role gating (pit_boss/admin).
   * Idempotent: duplicate calls return existing entry.
   *
   * @param input - Redemption input with points, staff, and note
   * @returns RedeemOutput with balance before/after and overdraw info
   * @throws INSUFFICIENT_BALANCE if balance too low without overdraw
   * @throws FORBIDDEN if overdraw requested without authorization
   * @throws LOYALTY_POLICY_VIOLATION if overdraw exceeds cap
   */
  redeem(input: RedeemInput): Promise<RedeemOutput>;

  /**
   * Issues a manual credit (service recovery).
   * Requires pit_boss or admin role.
   * Idempotent: duplicate calls return existing entry.
   *
   * @param input - Manual credit input with points, staff, and note
   * @returns ManualCreditOutput with ledger entry and balance
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   * @throws VALIDATION_ERROR if note is missing
   */
  manualCredit(input: ManualCreditInput): Promise<ManualCreditOutput>;

  /**
   * Applies a promotional overlay credit.
   * Business uniqueness: one promotion per campaign per slip.
   *
   * @param input - Promotion input with campaign ID and bonus points
   * @returns ApplyPromotionOutput with ledger entry
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  applyPromotion(input: ApplyPromotionInput): Promise<ApplyPromotionOutput>;

  /**
   * Evaluates session reward suggestion (read-only).
   * Does NOT mint points - used for UI preview during active sessions.
   *
   * @param slipId - Rating slip ID to evaluate
   * @param asOfTs - Optional timestamp for calculation (defaults to now)
   * @returns SessionRewardSuggestionOutput with estimated theo and points
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   */
  evaluateSuggestion(
    slipId: string,
    asOfTs?: string,
  ): Promise<SessionRewardSuggestionOutput>;

  /**
   * Gets player loyalty balance and tier info.
   * Returns null if player has no loyalty record.
   *
   * @param playerId - Player UUID
   * @param casinoId - Casino UUID
   * @returns PlayerLoyaltyDTO or null
   */
  getBalance(
    playerId: string,
    casinoId: string,
  ): Promise<PlayerLoyaltyDTO | null>;

  /**
   * Gets paginated ledger entries for a player.
   * Uses keyset pagination with (created_at DESC, id ASC) ordering.
   *
   * @param query - Ledger query with filters and cursor
   * @returns LedgerPageResponse with entries and cursor
   */
  getLedger(query: LedgerListQuery): Promise<LedgerPageResponse>;

  /**
   * Reconciles player loyalty balance from ledger sum (admin-only).
   * Used for drift detection recovery and QA smoke tests.
   *
   * @param playerId - Player UUID
   * @param casinoId - Casino UUID
   * @returns Reconciliation result with old/new balance and drift flag
   * @throws FORBIDDEN if caller is not admin
   */
  reconcileBalance(
    playerId: string,
    casinoId: string,
  ): Promise<ReconcileBalanceRpcResponse>;
}

// === Service Factory ===

/**
 * Creates a LoyaltyService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createLoyaltyService(
  supabase: SupabaseClient<Database>,
): LoyaltyService {
  return {
    accrueOnClose: (input) => crud.accrueOnClose(supabase, input),
    redeem: (input) => crud.redeem(supabase, input),
    manualCredit: (input) => crud.manualCredit(supabase, input),
    applyPromotion: (input) => crud.applyPromotion(supabase, input),
    evaluateSuggestion: (slipId, asOfTs) =>
      crud.evaluateSuggestion(supabase, slipId, asOfTs),
    getBalance: (playerId, casinoId) =>
      crud.getBalance(supabase, playerId, casinoId),
    getLedger: (query) => crud.getLedger(supabase, query),
    reconcileBalance: (playerId, casinoId) =>
      crud.reconcileBalance(supabase, playerId, casinoId),
  };
}
