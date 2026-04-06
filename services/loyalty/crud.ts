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
import { narrowJsonRecord } from '@/lib/json/narrows';
import type { Database } from '@/types/database.types';

import type {
  AccrueOnCloseInput,
  AccrueOnCloseOutput,
  ApplyPromotionInput,
  ApplyPromotionOutput,
  CompIssuanceResult,
  IssueCompParams,
  LedgerListQuery,
  LedgerPageResponse,
  ManualCreditInput,
  ManualCreditOutput,
  PlayerLoyaltyDTO,
  RedeemInput,
  RedeemOutput,
  SessionRewardSuggestionOutput,
  UpdateValuationPolicyInput,
  ValuationPolicyDTO,
} from './dtos';
import type { PlayerLoyaltyRow, ReconcileBalanceRpcResponse } from './mappers';
import {
  parseAccrueOnCloseResponse,
  parseApplyPromotionResponse,
  parseLedgerPageResponse,
  parseManualCreditResponse,
  parseRedeemResponse,
  parseSessionSuggestionResponse,
  toPlayerLoyaltyDTOOrNull,
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

  // ADR-014: Ghost visits excluded from loyalty accrual
  if (message.includes('LOYALTY_GHOST_VISIT_EXCLUDED')) {
    return new DomainError(
      'LOYALTY_GHOST_VISIT_EXCLUDED',
      'Ghost gaming visits are excluded from automated loyalty accrual. Rating slips for ghost visits contain compliance-only telemetry.',
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

  // Default to internal error — extract safe properties to avoid cyclic JSON on serialization
  return new DomainError('INTERNAL_ERROR', message, {
    details: { code: error.code, message: error.message },
  });
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
    const { data, error } = await supabase.rpc('rpc_accrue_on_close', {
      p_rating_slip_id: input.ratingSlipId,
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

    return parseAccrueOnCloseResponse(row);
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
    const { data, error } = await supabase.rpc('rpc_redeem', {
      p_player_id: input.playerId,
      p_points: input.points,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey,
      p_allow_overdraw: input.allowOverdraw ?? false,
      p_reward_id: input.rewardId ?? undefined,
      p_reference: input.reference ?? undefined,
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

    return parseRedeemResponse(row);
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
    const { data, error } = await supabase.rpc('rpc_manual_credit', {
      p_player_id: input.playerId,
      p_points: input.points,
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

    return parseManualCreditResponse(row);
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
    const { data, error } = await supabase.rpc('rpc_apply_promotion', {
      p_rating_slip_id: input.ratingSlipId,
      p_campaign_id: input.campaignId,
      p_promo_multiplier: input.promoMultiplier ?? undefined,
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

    return parseApplyPromotionResponse(row);
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
    const { data, error } = await supabase.rpc(
      'evaluate_session_reward_suggestion',
      {
        p_rating_slip_id: slipId,
        p_as_of_ts: asOfTs ?? undefined,
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

    return parseSessionSuggestionResponse(row);
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
    // Validate and normalize the response to PlayerLoyaltyRow type
    if (!data.player_id || !data.casino_id || !data.updated_at) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid player_loyalty row structure',
      );
    }

    const rawData = data;

    const row: PlayerLoyaltyRow = {
      player_id: rawData.player_id,
      casino_id: rawData.casino_id,
      current_balance: rawData.current_balance ?? 0,
      tier: rawData.tier ?? null,
      preferences: narrowJsonRecord(rawData.preferences),
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
    let cursorCreatedAt: string | undefined = undefined;
    let cursorId: string | undefined = undefined;

    if (query.cursor) {
      const decoded = decodeLedgerCursor(query.cursor);
      cursorCreatedAt = decoded.created_at;
      cursorId = decoded.id;
    }

    const limit = Math.min(query.limit ?? 20, 100);

    const { data, error } = await supabase.rpc('rpc_get_player_ledger', {
      p_player_id: query.playerId,
      p_cursor_created_at: cursorCreatedAt,
      p_cursor_id: cursorId,
      p_limit: limit,
    });

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

    return parseLedgerPageResponse(data, limit);
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
    const { data, error } = await supabase.rpc(
      'rpc_reconcile_loyalty_balance',
      {
        p_player_id: playerId,
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

    // Validate RPC response structure
    if (
      typeof row !== 'object' ||
      row === null ||
      typeof row.old_balance !== 'number' ||
      typeof row.new_balance !== 'number' ||
      typeof row.drift_detected !== 'boolean'
    ) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid reconcile_loyalty_balance RPC response structure',
      );
    }

    return {
      old_balance: row.old_balance,
      new_balance: row.new_balance,
      drift_detected: row.drift_detected,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Valuation Policy Lookup (PRD-053) ===

/**
 * Fetch the active valuation rate (cents_per_point) for a casino.
 * Fail-closed: throws VALUATION_POLICY_MISSING if no active policy row exists.
 *
 * @see PRD-053 — Point Conversion Canonicalization
 * @see loyalty_valuation_policy table (ADR-039)
 */
export async function getActiveValuationCentsPerPoint(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('loyalty_valuation_policy')
      .select('cents_per_point')
      .eq('casino_id', casinoId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data) {
      throw new DomainError(
        'VALUATION_POLICY_MISSING',
        'No active valuation policy found for this casino. Configure a valuation rate before issuing comps.',
        { httpStatus: 422 },
      );
    }

    return Number(data.cents_per_point);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

/**
 * Fetch the full active valuation policy DTO for admin settings form.
 * Returns null if no active policy exists (admin sees "not configured" state).
 *
 * @see PRD-053 WS5b — Admin Service Layer
 */
export async function getActiveValuationPolicy(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<ValuationPolicyDTO | null> {
  const { data, error } = await supabase
    .from('loyalty_valuation_policy')
    .select('*')
    .eq('casino_id', casinoId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw mapDatabaseError(error);
  }

  if (!data) return null;

  return {
    id: data.id,
    casinoId: data.casino_id,
    centsPerPoint: Number(data.cents_per_point),
    effectiveDate: data.effective_date,
    versionIdentifier: data.version_identifier,
    isActive: data.is_active,
    createdByStaffId: data.created_by_staff_id,
    createdAt: data.created_at,
  };
}

/**
 * Update valuation policy via SECURITY DEFINER RPC.
 * Atomically deactivates current row and inserts new active row.
 * Casino ID derived from RLS context (ADR-024 INV-8).
 *
 * @see PRD-053 WS5b — Admin Service Layer
 */
export async function updateValuationPolicy(
  supabase: SupabaseClient<Database>,
  input: UpdateValuationPolicyInput,
): Promise<ValuationPolicyDTO> {
  // RPC not yet in generated types — cast supabase to call untyped RPC.
  // Regenerate with `npm run db:types-local` after migration lands on remote.
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- untyped RPC call
  const rpcClient = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await rpcClient.rpc('rpc_update_valuation_policy', {
    p_cents_per_point: input.centsPerPoint,
    p_effective_date: input.effectiveDate,
    p_version_identifier: input.versionIdentifier,
  });

  if (error) {
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC error type from untyped call
    throw mapDatabaseError(error as { code?: string; message: string });
  }

  if (!data) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'RPC returned no data for valuation policy update',
    );
  }

  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- RPC response mapping (types pending db:types-local)
  const row = data as {
    id: string;
    casino_id: string;
    cents_per_point: number;
    effective_date: string;
    version_identifier: string;
    is_active: boolean;
    created_by_staff_id: string | null;
    created_at: string;
  };

  return {
    id: row.id,
    casinoId: row.casino_id,
    centsPerPoint: Number(row.cents_per_point),
    effectiveDate: row.effective_date,
    versionIdentifier: row.version_identifier,
    isActive: row.is_active,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
  };
}

// === Catalog-Backed Issuance Operations (PRD-052 WS2) ===

/**
 * Issues a catalog-backed comp (points debit) via rpc_redeem.
 *
 * This is the catalog-backed orchestration for comp issuance.
 * Calls rpc_redeem DIRECTLY (not via redeem()). The existing redeem()
 * remains for non-catalog ad-hoc redemptions (manual adjustments).
 *
 * Invariant: catalog-backed issuance always uses issueComp(), never redeem().
 *
 * @param supabase - Supabase client with RLS context
 * @param params - Comp issuance parameters (playerId, rewardId, idempotencyKey, note?)
 * @param casinoId - Casino ID for balance lookup (derived from RLS context)
 * @returns CompIssuanceResult with catalog context
 * @throws REWARD_NOT_FOUND if reward does not exist
 * @throws REWARD_INACTIVE if reward is not active
 * @throws REWARD_FAMILY_MISMATCH if reward family is not points_comp
 * @throws INSUFFICIENT_BALANCE if balance is insufficient (advisory pre-check)
 *
 * @see PRD-052 §5.1 FR-5
 * @see EXEC-052 WS2
 */
export async function issueComp(
  supabase: SupabaseClient<Database>,
  params: IssueCompParams,
  casinoId: string,
): Promise<CompIssuanceResult> {
  // Lazy import to avoid circular dependency (reward is a sub-module of loyalty)
  const { getReward } = await import('./reward/crud');
  const { checkCadence, requiresNote } = await import('./cadence');

  try {
    // 1. Parallel pre-flight: fetch reward catalog + player balance + valuation rate
    const [reward, balance, centsPerPoint] = await Promise.all([
      getReward(supabase, params.rewardId),
      getBalance(supabase, params.playerId, casinoId),
      getActiveValuationCentsPerPoint(supabase, casinoId),
    ]);

    // 2. Validate reward exists
    if (!reward) {
      throw new DomainError(
        'REWARD_NOT_FOUND',
        `Reward ${params.rewardId} not found`,
      );
    }

    // 3. Validate reward is active
    if (!reward.isActive) {
      throw new DomainError(
        'REWARD_INACTIVE',
        `Reward "${reward.name}" is not active`,
      );
    }

    // 4. Validate reward family
    if (reward.family !== 'points_comp') {
      throw new DomainError(
        'REWARD_FAMILY_MISMATCH',
        `Expected points_comp family, got ${reward.family}`,
      );
    }

    // 5. PRD-061: Cadence check (only when reward_limits exist)
    if (reward.limits.length > 0) {
      // requires_note enforcement (§5.6)
      if (requiresNote(reward.limits) && !params.note) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Note is required for this reward (requires_note policy)',
        );
      }

      const cadenceResult = await checkCadence(
        supabase,
        params.playerId,
        params.rewardId,
        casinoId,
        'points_comp',
        reward.limits,
      );

      if (!cadenceResult.allowed) {
        throw new DomainError(cadenceResult.code!, cadenceResult.guidance, {
          httpStatus:
            cadenceResult.code === 'REWARD_VISIT_REQUIRED' ? 422 : 429,
          details: {
            retryAfterSeconds: cadenceResult.retryAfterSeconds,
            nextEligibleAt: cadenceResult.nextEligibleAt,
          },
        });
      }
    }

    // 6. Resolve points cost: caller-provided variable amount OR catalog default
    // ceil() on redeem is house-favorable rounding.
    const pointsCost = params.faceValueCents
      ? Math.ceil(params.faceValueCents / centsPerPoint)
      : reward.pricePoints?.pointsCost;
    if (!pointsCost || pointsCost <= 0) {
      throw new DomainError(
        'CATALOG_CONFIG_INVALID',
        `Reward "${reward.name}" has no valid points cost configured`,
      );
    }

    // 6. Advisory balance pre-check (UX only — RPC is authoritative. See PRD §5.3.)
    const currentBalance = balance?.currentBalance ?? 0;
    if (!params.allowOverdraw && currentBalance < pointsCost) {
      throw new DomainError(
        'INSUFFICIENT_BALANCE',
        `Insufficient balance: need ${pointsCost} pts, have ${currentBalance} pts`,
      );
    }

    // 7. Default note
    const note = params.note ?? `Comp: ${reward.name}`;

    // 8. Resolve issued face value: caller-provided takes precedence over catalog metadata
    const faceValueCents =
      params.faceValueCents ??
      (typeof reward.metadata?.face_value_cents === 'number'
        ? reward.metadata.face_value_cents
        : 0);

    // 9. Call rpc_redeem DIRECTLY (not via redeem())
    const { data, error } = await supabase.rpc('rpc_redeem', {
      p_player_id: params.playerId,
      p_points: pointsCost,
      p_note: note,
      p_idempotency_key: params.idempotencyKey,
      p_allow_overdraw: params.allowOverdraw ?? false,
      p_reward_id: params.rewardId,
      p_reference: `reward_catalog:${params.rewardId}:${reward.code}`,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for comp issuance',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const parsed = parseRedeemResponse(row);

    // 10. Map result with catalog context → CompIssuanceResult
    return {
      family: 'points_comp',
      ledgerId: parsed.ledgerId,
      pointsDebited: Math.abs(parsed.pointsDelta),
      balanceBefore: parsed.balanceBefore,
      balanceAfter: parsed.balanceAfter,
      rewardId: reward.id,
      rewardCode: reward.code,
      rewardName: reward.name,
      faceValueCents,
      isExisting: parsed.isExisting,
      issuedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Error type narrowing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}
