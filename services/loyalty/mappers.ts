/**
 * LoyaltyService Mappers
 *
 * Type-safe transformations from RPC responses to DTOs.
 * Uses explicit types for RPC returns since they don't depend on table Row types.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS4
 */

import type {
  AccrueOnCloseOutput,
  ApplyPromotionOutput,
  LedgerPageResponse,
  LoyaltyLedgerEntryDTO,
  LoyaltyReason,
  ManualCreditOutput,
  PlayerLoyaltyDTO,
  RedeemOutput,
  SessionRewardSuggestionOutput,
} from './dtos';
import { encodeLedgerCursor } from './schemas';

// === RPC Response Types ===

/**
 * Response from rpc_accrue_on_close.
 */
export interface AccrueOnCloseRpcResponse {
  ledger_id: string;
  points_delta: number;
  theo: number;
  balance_after: number;
  is_existing: boolean;
}

/**
 * Response from rpc_redeem.
 */
export interface RedeemRpcResponse {
  ledger_id: string;
  points_delta: number;
  balance_before: number;
  balance_after: number;
  overdraw_applied: boolean;
  is_existing: boolean;
}

/**
 * Response from rpc_manual_credit.
 */
export interface ManualCreditRpcResponse {
  ledger_id: string;
  points_delta: number;
  balance_after: number;
  is_existing: boolean;
}

/**
 * Response from rpc_apply_promotion.
 */
export interface ApplyPromotionRpcResponse {
  ledger_id: string;
  promo_points_delta: number;
  is_existing: boolean;
}

/**
 * Response from evaluate_session_reward_suggestion.
 */
export interface SessionSuggestionRpcResponse {
  suggested_theo: number;
  suggested_points: number;
  policy_version: string;
  max_recommended_points: number;
  notes: string;
}

/**
 * Response from rpc_reconcile_loyalty_balance.
 */
export interface ReconcileBalanceRpcResponse {
  old_balance: number;
  new_balance: number;
  drift_detected: boolean;
}

/**
 * Response row from rpc_get_player_ledger.
 */
export interface LedgerRpcRow {
  id: string;
  casino_id: string;
  player_id: string;
  rating_slip_id: string | null;
  visit_id: string | null;
  staff_id: string | null;
  points_delta: number;
  reason: LoyaltyReason;
  idempotency_key: string | null;
  campaign_id: string | null;
  source_kind: string | null;
  source_id: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  has_more: boolean;
}

/**
 * Row from player_loyalty table (direct query).
 */
export interface PlayerLoyaltyRow {
  player_id: string;
  casino_id: string;
  current_balance: number;
  tier: string | null;
  preferences: Record<string, unknown>;
  updated_at: string;
}

// === Accrual Mappers ===

/**
 * Maps rpc_accrue_on_close response to AccrueOnCloseOutput DTO.
 */
export function toAccrueOnCloseOutput(
  response: AccrueOnCloseRpcResponse,
): AccrueOnCloseOutput {
  return {
    ledgerId: response.ledger_id,
    pointsDelta: response.points_delta,
    theo: response.theo,
    balanceAfter: response.balance_after,
    isExisting: response.is_existing,
  };
}

// === Redemption Mappers ===

/**
 * Maps rpc_redeem response to RedeemOutput DTO.
 */
export function toRedeemOutput(response: RedeemRpcResponse): RedeemOutput {
  return {
    ledgerId: response.ledger_id,
    pointsDelta: response.points_delta,
    balanceBefore: response.balance_before,
    balanceAfter: response.balance_after,
    overdrawApplied: response.overdraw_applied,
    isExisting: response.is_existing,
  };
}

// === Manual Credit Mappers ===

/**
 * Maps rpc_manual_credit response to ManualCreditOutput DTO.
 */
export function toManualCreditOutput(
  response: ManualCreditRpcResponse,
): ManualCreditOutput {
  return {
    ledgerId: response.ledger_id,
    pointsDelta: response.points_delta,
    balanceAfter: response.balance_after,
    isExisting: response.is_existing,
  };
}

// === Promotion Mappers ===

/**
 * Maps rpc_apply_promotion response to ApplyPromotionOutput DTO.
 */
export function toApplyPromotionOutput(
  response: ApplyPromotionRpcResponse,
): ApplyPromotionOutput {
  return {
    ledgerId: response.ledger_id,
    promoPointsDelta: response.promo_points_delta,
    isExisting: response.is_existing,
  };
}

// === Session Suggestion Mappers ===

/**
 * Maps evaluate_session_reward_suggestion response to DTO.
 */
export function toSessionSuggestionOutput(
  response: SessionSuggestionRpcResponse,
): SessionRewardSuggestionOutput {
  return {
    suggestedTheo: response.suggested_theo,
    suggestedPoints: response.suggested_points,
    policyVersion: response.policy_version,
    maxRecommendedPoints: response.max_recommended_points,
    notes: response.notes,
  };
}

// === Ledger Mappers ===

/**
 * Maps a ledger RPC row to LoyaltyLedgerEntryDTO.
 */
export function toLoyaltyLedgerEntryDTO(
  row: Omit<LedgerRpcRow, 'has_more'>,
): LoyaltyLedgerEntryDTO {
  return {
    id: row.id,
    casinoId: row.casino_id,
    playerId: row.player_id,
    ratingSlipId: row.rating_slip_id,
    visitId: row.visit_id,
    staffId: row.staff_id,
    pointsDelta: row.points_delta,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    campaignId: row.campaign_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    metadata: row.metadata,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * Maps an array of ledger RPC rows to paginated response.
 * Extracts cursor from last row and determines hasMore.
 */
export function toLedgerPageResponse(
  rows: LedgerRpcRow[],
  limit: number,
): LedgerPageResponse {
  if (rows.length === 0) {
    return {
      entries: [],
      cursor: null,
      hasMore: false,
    };
  }

  // has_more flag comes from the RPC
  const hasMore = rows.some((row) => row.has_more);

  // Filter out has_more flag and map to DTOs
  const entries = rows.map((row) => {
    const { has_more: _, ...rest } = row;
    return toLoyaltyLedgerEntryDTO(rest);
  });

  // Generate cursor from last entry if there are more pages
  let cursor: string | null = null;
  if (hasMore && entries.length > 0) {
    const lastEntry = entries[entries.length - 1];
    cursor = encodeLedgerCursor(lastEntry.createdAt, lastEntry.id);
  }

  return {
    entries,
    cursor,
    hasMore,
  };
}

// === Player Loyalty Mappers ===

/**
 * Maps player_loyalty row to PlayerLoyaltyDTO.
 */
export function toPlayerLoyaltyDTO(row: PlayerLoyaltyRow): PlayerLoyaltyDTO {
  return {
    playerId: row.player_id,
    casinoId: row.casino_id,
    currentBalance: row.current_balance,
    tier: row.tier,
    preferences: row.preferences,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps nullable player_loyalty row to PlayerLoyaltyDTO | null.
 */
export function toPlayerLoyaltyDTOOrNull(
  row: PlayerLoyaltyRow | null,
): PlayerLoyaltyDTO | null {
  return row ? toPlayerLoyaltyDTO(row) : null;
}
