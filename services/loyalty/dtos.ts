/**
 * LoyaltyService DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for loyalty ledger and balance operations.
 * All DTOs use camelCase (not snake_case) and explicit interfaces.
 *
 * @see PRD-004 Loyalty Service - Ledger-Based Points System
 * @see EXECUTION-SPEC-PRD-004.md WS3
 * @see LEDGER-PAGINATION-CONTRACT.md
 * @see IDEMPOTENCY-DRIFT-CONTRACT.md
 */

import type { Database } from '@/types/database.types';

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

  /** Points awarded (always positive, 0 if theo <= 0) */
  pointsDelta: number;

  /** Theoretical win amount in cents (from policy snapshot) */
  theo: number;

  /** Player balance after accrual */
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

  /** Staff member issuing the comp */
  issuedByStaffId: string;

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
 */
export interface RedeemOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /** Points deducted (NEGATIVE value) */
  pointsDelta: number;

  /** Player balance before redemption */
  balanceBefore: number;

  /** Player balance after redemption */
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

  /** Staff member awarding points */
  awardedByStaffId: string;

  /** Justification (REQUIRED, e.g., "Service recovery for slot malfunction") */
  note: string;

  /** Idempotency key */
  idempotencyKey: string;
}

/**
 * Output from manual credit operation.
 */
export interface ManualCreditOutput {
  /** Created ledger entry ID */
  ledgerId: string;

  /** Points awarded (positive) */
  pointsDelta: number;

  /** Player balance after credit */
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

  /** Promotional points awarded (positive) */
  promoPointsDelta: number;

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Session Reward Suggestion DTOs ===

/**
 * Output from session reward suggestion (read-only helper).
 * Used for live preview of potential points during session.
 */
export interface SessionRewardSuggestionOutput {
  /** Estimated theoretical win (cents) based on current session data */
  suggestedTheo: number;

  /** Estimated points based on current policy */
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
