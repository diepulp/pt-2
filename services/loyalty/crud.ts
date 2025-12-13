/**
 * LoyaltyService CRUD Operations
 *
 * Database operations for loyalty ledger management.
 * Uses RPCs for all write operations (SECURITY INVOKER pattern).
 * Pattern A (Contract-First): Manual DTOs for cross-context consumption.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS4
 * @see RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

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
import type {
  AccrueOnCloseRpcResponse,
  ApplyPromotionRpcResponse,
  LedgerRpcRow,
  ManualCreditRpcResponse,
  PlayerLoyaltyRow,
  RedeemRpcResponse,
  ReconcileBalanceRpcResponse,
  SessionSuggestionRpcResponse,
} from './mappers';
import {
  toAccrueOnCloseOutput,
  toApplyPromotionOutput,
  toLedgerPageResponse,
  toManualCreditOutput,
  toPlayerLoyaltyDTOOrNull,
  toRedeemOutput,
  toSessionSuggestionOutput,
} from './mappers';
import { decodeLedgerCursor } from './schemas';
import { PLAYER_LOYALTY_SELECT } from './selects';

// === Error Mapping ===

/**
 * Maps Postgres error codes and RPC error messages to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || '';

  // Handle RPC-raised exceptions
  if (message.includes('UNAUTHORIZED')) {
    return new DomainError(
      'UNAUTHORIZED',
      'RLS context not set (authentication required)',
    );
  }

  if (message.includes('CASINO_MISMATCH')) {
    return new DomainError(
      'FORBIDDEN',
      'Casino context mismatch - cross-casino access denied',
    );
  }

  if (message.includes('FORBIDDEN')) {
    // Extract role info if present
    const roleMatch = message.match(/Role (\w+) cannot/);
    const roleInfo = roleMatch ? ` (current role: ${roleMatch[1]})` : '';
    return new DomainError('FORBIDDEN', `Insufficient permissions${roleInfo}`);
  }

  if (message.includes('LOYALTY_SLIP_NOT_FOUND')) {
    return new DomainError(
      'RATING_SLIP_NOT_FOUND',
      'Rating slip not found for loyalty operation',
    );
  }

  if (message.includes('LOYALTY_SLIP_NOT_CLOSED')) {
    return new DomainError(
      'RATING_SLIP_NOT_OPEN',
      'Rating slip must be closed for base accrual',
    );
  }

  if (message.includes('LOYALTY_SNAPSHOT_MISSING')) {
    return new DomainError(
      'RATING_SLIP_MISSING_REQUIRED_DATA',
      'Rating slip is missing loyalty policy snapshot',
    );
  }

  if (message.includes('LOYALTY_PLAYER_NOT_FOUND')) {
    return new DomainError(
      'LOYALTY_ACCOUNT_NOT_FOUND',
      'Player has no loyalty account',
    );
  }

  if (message.includes('LOYALTY_INSUFFICIENT_BALANCE')) {
    return new DomainError(
      'INSUFFICIENT_BALANCE',
      'Insufficient loyalty points balance for redemption',
    );
  }

  if (message.includes('LOYALTY_OVERDRAW_NOT_AUTHORIZED')) {
    return new DomainError(
      'FORBIDDEN',
      'Overdraw requires pit_boss or admin role',
    );
  }

  if (message.includes('LOYALTY_OVERDRAW_EXCEEDS_CAP')) {
    return new DomainError(
      'LOYALTY_POLICY_VIOLATION',
      'Overdraw would exceed maximum allowed limit',
    );
  }

  if (message.includes('LOYALTY_POINTS_INVALID')) {
    return new DomainError(
      'LOYALTY_POINTS_NEGATIVE',
      'Points value must be positive',
    );
  }

  if (message.includes('LOYALTY_NOTE_REQUIRED')) {
    return new DomainError(
      'VALIDATION_ERROR',
      'Note is required for this operation',
    );
  }

  // Handle Postgres error codes
  // 23505 = Unique constraint violation (idempotency key)
  if (error.code === '23505') {
    if (message.includes('idempotency_key')) {
      return new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'A transaction with this idempotency key already exists',
      );
    }
    return new DomainError(
      'REWARD_ALREADY_ISSUED',
      'Duplicate loyalty ledger entry detected',
    );
  }

  // 23503 = Foreign key violation
  if (error.code === '23503') {
    if (message.includes('player_id')) {
      return new DomainError('PLAYER_NOT_FOUND', 'Player not found');
    }
    if (message.includes('rating_slip_id')) {
      return new DomainError('RATING_SLIP_NOT_FOUND', 'Rating slip not found');
    }
    if (message.includes('visit_id')) {
      return new DomainError('VISIT_NOT_FOUND', 'Visit not found');
    }
    return new DomainError(
      'FOREIGN_KEY_VIOLATION',
      'Referenced record not found',
    );
  }

  // PGRST116 = Not found (no rows returned)
  if (error.code === 'PGRST116' || message.includes('No rows found')) {
    return new DomainError('NOT_FOUND', 'Requested loyalty record not found');
  }

  // Default to internal error
  return new DomainError('INTERNAL_ERROR', message, { details: error });
}

// === Accrual Operations ===

/**
 * Triggers base accrual on rating slip close via RPC.
 * Uses deterministic theo calculation from policy_snapshot.loyalty.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Accrual input with rating slip ID and idempotency key
 * @returns AccrueOnCloseOutput with ledger entry and balance info
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_NOT_OPEN if slip is not closed
 * @throws RATING_SLIP_MISSING_REQUIRED_DATA if policy snapshot is missing
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function accrueOnClose(
  supabase: SupabaseClient<Database>,
  input: AccrueOnCloseInput,
): Promise<AccrueOnCloseOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)('rpc_accrue_on_close', {
      p_rating_slip_id: input.ratingSlipId,
      p_casino_id: input.casinoId,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for accrual operation',
      );
    }

    // RPC returns a single row as array with one element
    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toAccrueOnCloseOutput(row as AccrueOnCloseRpcResponse);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Redemption Operations ===

/**
 * Issues a comp redemption (debit) via RPC.
 * Supports controlled overdraw with role gating.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Redemption input with points, staff, and note
 * @returns RedeemOutput with balance before/after and overdraw info
 * @throws INSUFFICIENT_BALANCE if balance too low without overdraw
 * @throws FORBIDDEN if overdraw requested without authorization
 * @throws LOYALTY_POLICY_VIOLATION if overdraw exceeds cap
 */
export async function redeem(
  supabase: SupabaseClient<Database>,
  input: RedeemInput,
): Promise<RedeemOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)('rpc_redeem', {
      p_casino_id: input.casinoId,
      p_player_id: input.playerId,
      p_points: input.points,
      p_issued_by_staff_id: input.issuedByStaffId,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey,
      p_allow_overdraw: input.allowOverdraw ?? false,
      p_reward_id: input.rewardId ?? null,
      p_reference: input.reference ?? null,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for redemption operation',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toRedeemOutput(row as RedeemRpcResponse);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Manual Credit Operations ===

/**
 * Issues a manual credit (service recovery) via RPC.
 * Requires pit_boss or admin role.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Manual credit input with points, staff, and note
 * @returns ManualCreditOutput with ledger entry and balance
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 * @throws VALIDATION_ERROR if note is missing
 */
export async function manualCredit(
  supabase: SupabaseClient<Database>,
  input: ManualCreditInput,
): Promise<ManualCreditOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)('rpc_manual_credit', {
      p_casino_id: input.casinoId,
      p_player_id: input.playerId,
      p_points: input.points,
      p_awarded_by_staff_id: input.awardedByStaffId,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for manual credit operation',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toManualCreditOutput(row as ManualCreditRpcResponse);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Promotion Operations ===

/**
 * Applies a promotional overlay credit via RPC.
 * Business uniqueness: one promotion per campaign per slip.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Promotion input with campaign ID and bonus points
 * @returns ApplyPromotionOutput with ledger entry
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function applyPromotion(
  supabase: SupabaseClient<Database>,
  input: ApplyPromotionInput,
): Promise<ApplyPromotionOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)('rpc_apply_promotion', {
      p_casino_id: input.casinoId,
      p_rating_slip_id: input.ratingSlipId,
      p_campaign_id: input.campaignId,
      p_promo_multiplier: input.promoMultiplier ?? null,
      p_bonus_points: input.bonusPoints,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for promotion operation',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toApplyPromotionOutput(row as ApplyPromotionRpcResponse);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Suggestion Operations ===

/**
 * Evaluates session reward suggestion (read-only).
 * Does NOT mint points - used for UI preview during active sessions.
 *
 * @param supabase - Supabase client with RLS context
 * @param slipId - Rating slip ID to evaluate
 * @param asOfTs - Optional timestamp for calculation (defaults to now)
 * @returns SessionRewardSuggestionOutput with estimated theo and points
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 */
export async function evaluateSuggestion(
  supabase: SupabaseClient<Database>,
  slipId: string,
  asOfTs?: string,
): Promise<SessionRewardSuggestionOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'evaluate_session_reward_suggestion',
      {
        p_rating_slip_id: slipId,
        p_as_of_ts: asOfTs ?? null,
      },
    );

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for suggestion evaluation',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toSessionSuggestionOutput(row as SessionSuggestionRpcResponse);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Balance Operations ===

/**
 * Gets player loyalty balance and tier info.
 * Returns null if player has no loyalty record.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param casinoId - Casino UUID
 * @returns PlayerLoyaltyDTO or null
 */
export async function getBalance(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<PlayerLoyaltyDTO | null> {
  try {
    // Use wildcard select to avoid type errors with schema differences
    // Current schema uses 'balance', new schema will use 'current_balance'
    const { data, error } = await supabase
      .from('player_loyalty')
      .select('*')
      .eq('player_id', playerId)
      .eq('casino_id', casinoId)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data) {
      return null;
    }

    // Handle both old schema (balance) and new schema (current_balance)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema compatibility layer
    const rawData = data as any;
    const row: PlayerLoyaltyRow = {
      player_id: rawData.player_id,
      casino_id: rawData.casino_id,
      current_balance: rawData.current_balance ?? rawData.balance ?? 0,
      tier: rawData.tier ?? null,
      preferences:
        typeof rawData.preferences === 'object' && rawData.preferences !== null
          ? rawData.preferences
          : {},
      updated_at: rawData.updated_at,
    };

    return toPlayerLoyaltyDTOOrNull(row);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Ledger Operations ===

/**
 * Gets paginated ledger entries for a player via RPC.
 * Uses keyset pagination with (created_at DESC, id ASC) ordering.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Ledger query with filters and cursor
 * @returns LedgerPageResponse with entries and cursor
 */
export async function getLedger(
  supabase: SupabaseClient<Database>,
  query: LedgerListQuery,
): Promise<LedgerPageResponse> {
  try {
    // Decode cursor if provided
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (query.cursor) {
      const decoded = decodeLedgerCursor(query.cursor);
      cursorCreatedAt = decoded.created_at;
      cursorId = decoded.id;
    }

    const limit = Math.min(query.limit ?? 20, 100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_get_player_ledger',
      {
        p_casino_id: query.casinoId,
        p_player_id: query.playerId,
        p_cursor_created_at: cursorCreatedAt,
        p_cursor_id: cursorId,
        p_limit: limit,
      },
    );

    if (error) {
      throw mapDatabaseError(error);
    }

    // Handle empty result
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        entries: [],
        cursor: null,
        hasMore: false,
      };
    }

    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return toLedgerPageResponse(data as LedgerRpcRow[], limit);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Admin Operations ===

/**
 * Reconciles player loyalty balance from ledger sum (admin-only).
 * Used for drift detection recovery and QA smoke tests.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param casinoId - Casino UUID
 * @returns Reconciliation result with old/new balance and drift flag
 * @throws FORBIDDEN if caller is not admin
 */
export async function reconcileBalance(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<ReconcileBalanceRpcResponse> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_reconcile_loyalty_balance',
      {
        p_player_id: playerId,
        p_casino_id: casinoId,
      },
    );

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for reconciliation',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping
    return row as ReconcileBalanceRpcResponse;
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}
