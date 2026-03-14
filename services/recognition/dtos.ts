/**
 * RecognitionService DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for composite RPC results.
 * Cross-cutting recognition surface spanning Player, Casino, Loyalty, Visit contexts.
 *
 * @see PRD-051 Cross-Property Player Recognition and Loyalty Entitlement
 * @see ADR-044 D4 (lookup), D3 (activate), D6 (redeem), D7 (hybrid surface)
 * @see EXEC-051 WS2
 */

// === Loyalty Entitlement Surface (ADR-044 D7) ===

export interface LoyaltyEntitlementDTO {
  /** Portfolio awareness total across all company properties (NOT redeemable) */
  portfolioTotal: number;
  /** Balance at the caller's casino */
  localBalance: number;
  /** Tier at the caller's casino */
  localTier: string | null;
  /** Amount actionable at the current property (equals localBalance under D6 local-row-only) */
  redeemableHere: number;
  /** Per-property breakdown for support context */
  properties: PropertyLoyaltyDTO[];
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: nested DTO
export interface PropertyLoyaltyDTO {
  casinoId: string;
  casinoName: string;
  balance: number;
  tier: string | null;
}

// === Enrolled Casino Badge ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: nested DTO
export interface EnrolledCasinoDTO {
  casinoId: string;
  casinoName: string;
  status: string;
  enrolledAt: string;
}

// === Recognition Result (rpc_lookup_player_company output) ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per EXEC-051
export interface RecognitionResultDTO {
  playerId: string;
  fullName: string;
  birthDate: string | null;
  enrolledCasinos: EnrolledCasinoDTO[];
  loyaltyEntitlement: LoyaltyEntitlementDTO;
  activeLocally: boolean;
  lastCompanyVisit: string | null;
  /** Slice 1 stub: always null until player-exclusion merge */
  hasSisterExclusions: boolean | null;
  /** Slice 1 stub: always null until player-exclusion merge */
  maxExclusionSeverity: string | null;
}

// === Activation Result (rpc_activate_player_locally output) ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per EXEC-051
export interface ActivationResultDTO {
  activated: boolean;
  alreadyEnrolled: boolean;
}

// === Redemption Result (rpc_redeem_loyalty_locally output) ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First per EXEC-051
export interface RedemptionResultDTO {
  redeemed: boolean;
  amount: number;
  localBalance: number;
  portfolioTotal: number;
  redeemableHere: number;
  ledgerId: string;
}
