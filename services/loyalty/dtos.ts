/**
 * LoyaltyService DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for loyalty ledger and balance operations.
 * All DTOs use camelCase (not snake_case) and explicit interfaces.
 *
 * Financial envelope wrapping (PRD-070 WS2):
 *   - `AccrueOnCloseOutput.theo` is wrapped in `FinancialValue` per
 *     WAVE-1-CLASSIFICATION-RULES §3.6 (authority `estimated`,
 *     source `"loyalty.theo"`, completeness `complete` on accrual).
 *   - Points (`pointsDelta`, balances, `bonusPoints`, `points_redeemed`) are a
 *     carve-out (§6.3) — a separate unit system outside the envelope scope.
 *   - Comp/entitlement face values and print-payload currency are DEFERRED to
 *     Phase 1.2 — wrapping cascades into `components/loyalty/*` and the frozen
 *     PRD-052 §8.1 fulfillment-payload contract. Deferrals are marked inline.
 *
 * @see PRD-004 Loyalty Service - Ledger-Based Points System
 * @see PRD-070 Financial Telemetry Wave 1 Phase 1.1
 * @see EXECUTION-SPEC-PRD-004.md WS3
 * @see LEDGER-PAGINATION-CONTRACT.md
 * @see IDEMPOTENCY-DRIFT-CONTRACT.md
 */

import type { Database } from '@/types/database.types';
import type { FinancialValue } from '@/types/financial';

// === Enum Types ===

/**
 * Loyalty ledger entry reason codes (canonical per ADR-019 v2).
 */
export type LoyaltyReason =
  | 'base_accrual' // Deterministic theo-based credit on rating slip close
  | 'promotion' // Campaign/offer overlay credit
  | 'redeem' // Comp issuance (DEBIT, negative points_delta)
  | 'manual_reward' // Service recovery credit
  | 'adjustment' // Admin correction (can be +/-)
  | 'reversal'; // Reverse a previous entry (references original via metadata)

/**
 * Game type enum (re-exported from database types).
 */
export type GameType = Database['public']['Enums']['game_type'];

// === Read DTOs ===

/**
 * Loyalty ledger entry (read DTO).
 * Represents a single point transaction (credit or debit).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface LoyaltyLedgerEntryDTO {
  /** Ledger entry ID */
  id: string;

  /** Casino ID (multi-tenant isolation) */
  casinoId: string;

  /** Player ID */
  playerId: string;

  /** Associated rating slip (nullable for manual operations) */
  ratingSlipId: string | null;

  /** Associated visit (nullable) */
  visitId: string | null;

  /** Staff member who created this entry (nullable for automated accruals) */
  staffId: string | null;

  /** Signed points delta (positive=credit, negative=debit) */
  pointsDelta: number;

  /** Entry reason code */
  reason: LoyaltyReason;

  /** Idempotency key for request deduplication */
  idempotencyKey: string | null;

  /** Campaign ID (for promotions) */
  campaignId: string | null;

  /** Source entity kind (e.g., 'rating_slip', 'campaign', 'manual') */
  sourceKind: string | null;

  /** Source entity ID */
  sourceId: string | null;

  /** Calculation provenance and audit metadata */
  metadata: Record<string, unknown>;

  /** Human-readable note (required for redeem/adjustment) */
  note: string | null;

  /** Entry creation timestamp (ISO 8601) */
  createdAt: string;
}

/**
 * Player loyalty balance and tier info.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface PlayerLoyaltyDTO {
  /** Player ID */
  playerId: string;

  /** Casino ID */
  casinoId: string;

  /** Current points balance (can be negative with authorized overdraw) */
  currentBalance: number;

  /** Player tier (bronze, silver, gold, platinum, etc.) */
  tier: string | null;

  /** Player-specific loyalty preferences */
  preferences: Record<string, unknown>;

  /** Last balance update timestamp (ISO 8601) */
  updatedAt: string;
}

// === Base Accrual DTOs ===

/**
 * Input for base accrual on rating slip close.
 */
export interface AccrueOnCloseInput {
  /** Rating slip ID to accrue points for */
  ratingSlipId: string;

  /** Casino ID (redundant for validation, derived from RLS context) */
  casinoId: string;

  /** Idempotency key (prevents duplicate accrual on retry) */
  idempotencyKey: string;
}

/**
 * Output from base accrual operation.
 */
export interface AccrueOnCloseOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /**
   * Points awarded (always positive, 0 if theo <= 0).
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.3): points unit system — bare number.
   */
  pointsDelta: number;

  /**
   * Theoretical win envelope (cents) from the policy snapshot on accrual.
   *
   * Per WAVE-1-CLASSIFICATION-RULES §3.6: authority `estimated`, source
   * `"loyalty.theo"`, completeness `'complete'` at accrual because closing a
   * slip implies a pinned policy-snapshot theo. If the close path ever allows
   * accrual on a gapped slip, this completeness value MUST be revisited
   * (expected treatment: `'unknown'` per the `unknown for gapped sessions`
   * clause in §3.6).
   */
  theo: FinancialValue;

  /**
   * Player balance after accrual.
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.3): points balance — bare number.
   */
  balanceAfter: number;

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Redemption DTOs ===

/**
 * Input for comp redemption (debit).
 */
export interface RedeemInput {
  /** Casino ID */
  casinoId: string;

  /** Player ID */
  playerId: string;

  /** Points to redeem (POSITIVE cost, will be negated internally) */
  points: number;

  /** Comp description (REQUIRED, e.g., "Dinner for 2 at steakhouse") */
  note: string;

  /** Idempotency key */
  idempotencyKey: string;

  /** Allow overdraw (requires pit_boss or admin role) */
  allowOverdraw?: boolean;

  /** Reward catalog item ID (optional, for tracking) */
  rewardId?: string;

  /** External reference (optional, for third-party integrations) */
  reference?: string;
}

/**
 * Output from redemption operation.
 *
 * All numeric fields are points (§6.3 carve-out — separate unit system, not currency).
 */
export interface RedeemOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /** Points deducted (NEGATIVE value). Carve-out (§6.3): points unit — bare number. */
  pointsDelta: number;

  /** Player balance before redemption. Carve-out (§6.3): points — bare number. */
  balanceBefore: number;

  /** Player balance after redemption. Carve-out (§6.3): points — bare number. */
  balanceAfter: number;

  /** True if overdraw was applied (balance went negative) */
  overdrawApplied: boolean;

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Manual Credit DTOs ===

/**
 * Input for manual credit (service recovery, goodwill).
 */
export interface ManualCreditInput {
  /** Casino ID */
  casinoId: string;

  /** Player ID */
  playerId: string;

  /** Points to award (POSITIVE only) */
  points: number;

  /** Justification (REQUIRED, e.g., "Service recovery for slot malfunction") */
  note: string;

  /** Idempotency key */
  idempotencyKey: string;
}

/**
 * Output from manual credit operation.
 *
 * All numeric fields are points (§6.3 carve-out — separate unit system, not currency).
 */
export interface ManualCreditOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /** Points awarded (positive). Carve-out (§6.3): points unit — bare number. */
  pointsDelta: number;

  /** Player balance after credit. Carve-out (§6.3): points — bare number. */
  balanceAfter: number;

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Promotion DTOs ===

/**
 * Input for promotional overlay credit.
 */
export interface ApplyPromotionInput {
  /** Casino ID */
  casinoId: string;

  /** Rating slip ID to attach promotion to */
  ratingSlipId: string;

  /** Campaign ID (unique identifier for promotion) */
  campaignId: string;

  /** Promotional multiplier (optional, e.g., 1.5 for 50% bonus) */
  promoMultiplier?: number;

  /** Fixed bonus points (positive, overrides multiplier if both provided) */
  bonusPoints: number;

  /** Idempotency key */
  idempotencyKey: string;
}

/**
 * Output from promotion application.
 */
export interface ApplyPromotionOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /** Promotional points awarded (positive). Carve-out (§6.3): points unit — bare number. */
  promoPointsDelta: number;

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Mid-Session Reward DTOs ===

/**
 * Reason codes accepted by the mid-session reward RPC.
 * Distinct from the canonical LoyaltyReason (ledger entry reasons).
 */
export type MidSessionRewardReason =
  | 'mid_session'
  | 'session_end'
  | 'manual_adjustment'
  | 'promotion'
  | 'correction';

export type RatingSlipStatusForReward = 'open' | 'paused';

/**
 * Domain input for mid-session reward issuance.
 */
export interface MidSessionRewardInput {
  casinoId: string;
  playerId: string;
  ratingSlipId: string;
  staffId: string;
  points: number;
  idempotencyKey: string;
  reason?: MidSessionRewardReason;
  slipStatus: string;
}

/**
 * RPC parameter shape for rpc_issue_mid_session_reward.
 */
export interface MidSessionRewardRpcInput {
  p_player_id: string;
  p_rating_slip_id: string;
  p_points: number;
  p_idempotency_key: string;
  p_reason: MidSessionRewardReason;
}

// === Session Reward Suggestion DTOs ===

/**
 * Output from session reward suggestion (read-only helper).
 * Used for live preview of potential points during session.
 */
export interface SessionRewardSuggestionOutput {
  /**
   * Estimated theoretical win (cents) based on current session data.
   *
   * DEFERRED (PRD-070 WS2 → Phase 1.2): live-preview value cascades through
   * `app/api/v1/rating-slips/[id]/modal-data/route.ts` into the rating-slip
   * modal UI. Wrapping is blocked by the WS4 exception slice boundary — this
   * is not part of WS2 scope.
   *
   * Classification target when wrapped (CLASSIFICATION-RULES §3.2 via the
   * rating-slip-theo row): type `estimated`, source `"rating_slip.theo"`,
   * completeness `'partial'` for live/open sessions (preview) or `'unknown'`
   * when session data is insufficient.
   */
  suggestedTheo: number;

  /** Estimated points based on current policy. Carve-out (§6.3): points — bare number. */
  suggestedPoints: number;

  /** Policy version used for calculation */
  policyVersion: string;

  /** Maximum recommended points (caps, limits) */
  maxRecommendedPoints: number;

  /** Human-readable notes (e.g., "Estimated based on 2.5 hours play") */
  notes: string;
}

// === Ledger Pagination DTOs ===

/**
 * Ledger list query filters and pagination params.
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §4
 */
export interface LedgerListQuery {
  /** Casino ID (required for RLS context) */
  casinoId: string;

  /** Player ID (required) */
  playerId: string;

  /** Opaque pagination cursor (base64-encoded JSON, omit for first page) */
  cursor?: string;

  /** Results per page (default 20, max 100) */
  limit?: number;

  /** Filter by rating slip */
  ratingSlipId?: string;

  /** Filter by visit */
  visitId?: string;

  /** Filter by reason code */
  reason?: LoyaltyReason;

  /** Filter by date range start (ISO date: YYYY-MM-DD) */
  fromDate?: string;

  /** Filter by date range end (ISO date: YYYY-MM-DD) */
  toDate?: string;
}

/**
 * Ledger cursor (internal structure, encoded as opaque base64 string).
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §2.1
 */
export interface LedgerCursor {
  /** ISO 8601 timestamp of last entry in previous page */
  created_at: string;

  /** UUID of last entry in previous page (tie-breaker) */
  id: string;
}

/**
 * Paginated ledger response.
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §4
 */
export interface LedgerPageResponse {
  /** Ledger entries for current page */
  entries: LoyaltyLedgerEntryDTO[];

  /**
   * Opaque cursor for next page.
   * - null: No more pages (this is the last page)
   * - string: Base64-encoded cursor for next fetch
   */
  cursor: string | null;

  /** Indicates if more pages exist (redundant with cursor !== null) */
  hasMore: boolean;
}

// === Issuance DTOs (PRD-052 WS2) ===

import type { EntitlementIssuanceResult } from './promo/dtos';

/**
 * Input for catalog-backed comp issuance via `issueComp()`.
 * Calls `rpc_redeem` directly (not via `redeem()`).
 *
 * @see PRD-052 §5.1 FR-5
 */

export interface IssueCompParams {
  /** Player to issue comp to */
  playerId: string;

  /** Reward catalog item ID (must be `points_comp` family) */
  rewardId: string;

  /** Associated visit (optional) */
  visitId?: string;

  /** Idempotency key for request deduplication */
  idempotencyKey: string;

  /** Human-readable note. Defaults to `"Comp: {rewardName}"` in issueComp if omitted. */
  note?: string;

  /**
   * Dollar amount in cents for variable-amount comps (operator input).
   *
   * Carve-out (WAVE-1-CLASSIFICATION-RULES §6.1): operator input — bare number.
   * When provided, overrides catalog points_cost: pointsCost = ceil(faceValueCents / CENTS_PER_POINT).
   * When omitted, falls back to catalog reward_price_points.points_cost.
   */
  faceValueCents?: number;

  /**
   * Allow overdraw (debit exceeds player balance).
   * Authorization enforced server-side by rpc_redeem (pit_boss/admin only).
   */
  allowOverdraw?: boolean;
}

/**
 * Result of a catalog-backed comp issuance.
 * Extends rpc_redeem output with catalog context.
 *
 * @see PRD-052 §8.1
 */

export interface CompIssuanceResult {
  /** Discriminator field for IssuanceResultDTO union */
  family: 'points_comp';

  /** Ledger entry ID created by rpc_redeem */
  ledgerId: string;

  /** Points debited (positive, represents cost). Carve-out (§6.3): points — bare number. */
  pointsDebited: number;

  /** Player balance before debit. Carve-out (§6.3): points — bare number. */
  balanceBefore: number;

  /** Player balance after debit. Carve-out (§6.3): points — bare number. */
  balanceAfter: number;

  /** Reward catalog item ID */
  rewardId: string;

  /** Reward code from catalog */
  rewardCode: string;

  /** Reward name from catalog */
  rewardName: string;

  /**
   * Issued face value in cents. Caller-provided value takes precedence over catalog metadata.
   *
   * DEFERRED (PRD-070 WS2 → Phase 1.2): wrapping cascades into
   * `components/loyalty/issuance-result-panel.tsx` which reads `.faceValueCents`
   * as a bare number. Phase 1.1 G1 deferral — requires paired direct-consumer
   * workstream to move the UI consumer in the same slice.
   *
   * Classification target when wrapped (CLASSIFICATION-RULES §3.6 loyalty comp
   * face-value row): type `actual`, source `"loyalty.comp_face_value"`,
   * completeness `'complete'` per issuance.
   */
  faceValueCents: number;

  /** True if this was an idempotent replay (no additional debit) */
  isExisting: boolean;

  /** Issuance timestamp (ISO 8601) */
  issuedAt: string;
}

/**
 * Frozen fulfillment payload for Vector C comp slip print.
 * Contract surface per PRD §8.1 — snake_case for cross-boundary consumption.
 *
 * @see PRD-052 §8.1 CompFulfillmentPayload
 */

export interface CompFulfillmentPayload {
  family: 'points_comp';
  ledger_id: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  /**
   * DEFERRED (PRD-070 WS2 → Phase 1.2): frozen PRD-052 §8.1 print-contract
   * shape consumed by `lib/print/` templates. Wrapping requires coordinated
   * print-template amendment. Classification target when wrapped: `actual` /
   * `"loyalty.comp_face_value"` / `'complete'`.
   */
  face_value_cents: number;
  /** Carve-out (§6.3): points — bare number. */
  points_redeemed: number;
  /** Carve-out (§6.3): points balance — bare number. */
  balance_after: number;
  // Context for print template
  player_name: string;
  player_id: string;
  casino_name: string;
  staff_name: string;
  issued_at: string; // ISO 8601
}

/**
 * Frozen fulfillment payload for Vector C entitlement coupon print.
 * Contract surface per PRD §8.1 — snake_case for cross-boundary consumption.
 *
 * @see PRD-052 §8.1 EntitlementFulfillmentPayload
 */

export interface EntitlementFulfillmentPayload {
  family: 'entitlement';
  coupon_id: string;
  validation_number: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  /**
   * DEFERRED (PRD-070 WS2 → Phase 1.2): frozen PRD-052 §8.1 print-contract
   * shape consumed by `lib/print/` templates. Classification target when
   * wrapped: `actual` / `"loyalty.entitlement_face_value"` / `'complete'`.
   */
  face_value_cents: number;
  /**
   * DEFERRED (PRD-070 WS2 → Phase 1.2): frozen PRD-052 §8.1 print-contract
   * shape. Classification target when wrapped: `actual` /
   * `"loyalty.entitlement_match_wager"` / `'complete'` per entitlement.
   */
  required_match_wager_cents: number | null; // null for free play
  expires_at: string | null; // ISO 8601
  // Context for print template
  player_name: string;
  player_id: string;
  player_tier: string;
  casino_name: string;
  staff_name: string;
  issued_at: string; // ISO 8601
}

/**
 * Discriminated union of fulfillment payloads — frozen for Vector C.
 *
 * @see PRD-052 §8.1
 */
export type FulfillmentPayload =
  | CompFulfillmentPayload
  | EntitlementFulfillmentPayload;

/**
 * Discriminated union of issuance results.
 * The `family` field discriminates between comp and entitlement results.
 *
 * @see EXEC-052 WS2
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First discriminated union type per EXEC-052 WS2
export type IssuanceResultDTO = CompIssuanceResult | EntitlementIssuanceResult;

// Note: EntitlementIssuanceResult is available via '@/services/loyalty' barrel (from promo sub-module).
// It is NOT re-exported here to avoid duplicate export with index.ts `export * from './promo'`.

// === Valuation Policy DTOs (PRD-053) ===

/**
 * Full valuation policy DTO for admin settings form.
 * Pattern A Contract-First manual DTO.
 *
 * @see PRD-053 WS5b — Admin Service Layer
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per PRD-053
export interface ValuationPolicyDTO {
  id: string;
  casinoId: string;
  centsPerPoint: number;
  effectiveDate: string;
  versionIdentifier: string;
  isActive: boolean;
  createdByStaffId: string | null;
  createdAt: string;
}

/**
 * Input for updating valuation policy (admin write).
 * NO casinoId — derived from RLS context (ADR-024 INV-8).
 */

export interface UpdateValuationPolicyInput {
  centsPerPoint: number;
  effectiveDate: string;
  versionIdentifier: string;
}
