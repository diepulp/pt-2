/**
 * LoyaltyService HTTP Fetchers
 *
 * Client-side fetch functions for LoyaltyService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS4
 */

import { fetchJSON, mutateJSON } from '@/lib/http/fetch-json';

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

const BASE_LOYALTY = '/api/v1/loyalty';
const BASE_PLAYERS = '/api/v1/players';

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

// === Accrual Operations ===

/**
 * Triggers base accrual on rating slip close.
 * Idempotent via server-side idempotency key handling.
 *
 * POST /api/v1/loyalty/accrue
 */
export async function accrueOnClose(
  input: AccrueOnCloseInput,
): Promise<AccrueOnCloseOutput> {
  return mutateJSON<AccrueOnCloseOutput, AccrueOnCloseInput>(
    `${BASE_LOYALTY}/accrue`,
    input,
    input.idempotencyKey,
  );
}

// === Redemption Operations ===

/**
 * Issues a comp redemption (debit).
 * Supports overdraw with pit_boss/admin authorization.
 *
 * POST /api/v1/loyalty/redeem
 */
export async function redeem(input: RedeemInput): Promise<RedeemOutput> {
  return mutateJSON<RedeemOutput, RedeemInput>(
    `${BASE_LOYALTY}/redeem`,
    input,
    input.idempotencyKey,
  );
}

// === Manual Credit Operations ===

/**
 * Issues a manual credit (service recovery).
 * Requires pit_boss or admin role.
 *
 * POST /api/v1/loyalty/manual-credit
 */
export async function manualCredit(
  input: ManualCreditInput,
): Promise<ManualCreditOutput> {
  return mutateJSON<ManualCreditOutput, ManualCreditInput>(
    `${BASE_LOYALTY}/manual-credit`,
    input,
    input.idempotencyKey,
  );
}

// === Promotion Operations ===

/**
 * Applies a promotional overlay credit.
 * Business uniqueness: one promotion per campaign per slip.
 *
 * POST /api/v1/loyalty/promotion
 */
export async function applyPromotion(
  input: ApplyPromotionInput,
): Promise<ApplyPromotionOutput> {
  return mutateJSON<ApplyPromotionOutput, ApplyPromotionInput>(
    `${BASE_LOYALTY}/promotion`,
    input,
    input.idempotencyKey,
  );
}

// === Suggestion Operations ===

/**
 * Evaluates session reward suggestion (read-only).
 * Does NOT mint points - used for UI preview.
 *
 * GET /api/v1/loyalty/suggestion?ratingSlipId=...&asOfTs=...
 */
export async function evaluateSuggestion(
  ratingSlipId: string,
  asOfTs?: string,
): Promise<SessionRewardSuggestionOutput> {
  const params = buildParams({
    ratingSlipId,
    asOfTs,
  });

  const url = `${BASE_LOYALTY}/suggestion?${params}`;
  return fetchJSON<SessionRewardSuggestionOutput>(url);
}

// === Balance Operations ===

/**
 * Gets player loyalty balance and tier info.
 *
 * GET /api/v1/players/{playerId}/loyalty?casinoId=...
 */
export async function getPlayerLoyalty(
  playerId: string,
  casinoId: string,
): Promise<PlayerLoyaltyDTO | null> {
  const params = buildParams({ casinoId });
  const url = `${BASE_PLAYERS}/${playerId}/loyalty?${params}`;
  return fetchJSON<PlayerLoyaltyDTO | null>(url);
}

// === Ledger Operations ===

/**
 * Fetches paginated ledger entries for a player.
 * Uses keyset pagination with opaque cursor.
 *
 * GET /api/v1/loyalty/ledger?playerId=...&casinoId=...&cursor=...&limit=...
 */
export async function getLedger(
  query: LedgerListQuery,
): Promise<LedgerPageResponse> {
  const {
    casinoId,
    playerId,
    cursor,
    limit,
    ratingSlipId,
    visitId,
    reason,
    fromDate,
    toDate,
  } = query;

  const params = buildParams({
    casinoId,
    playerId,
    cursor,
    limit,
    ratingSlipId,
    visitId,
    reason,
    fromDate,
    toDate,
  });

  const url = `${BASE_LOYALTY}/ledger?${params}`;
  return fetchJSON<LedgerPageResponse>(url);
}
