/**
 * LoyaltyService Promo Instrument DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for promo coupon and program operations.
 * All DTOs use camelCase and explicit interfaces.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS2
 */

// === Enum Types ===

/**
 * Promo program types (extensible for future promo types).
 */
export type PromoType = 'match_play';

/**
 * Promo coupon lifecycle states.
 */
export type PromoCouponStatus =
  | 'issued' // Active, can be used
  | 'voided' // Cancelled before use
  | 'replaced' // Exchanged for new coupon
  | 'expired' // Past expiration date
  | 'cleared'; // Successfully redeemed (post-v0)

// === Promo Program DTOs ===

/**
 * Promo program read DTO.
 * Represents a promotional instrument template (e.g., "$25 Match Play" program).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface PromoProgramDTO {
  /** Program ID */
  id: string;

  /** Casino ID (multi-tenant isolation) */
  casinoId: string;

  /** Program name (e.g., "Weekend Match Play $25") */
  name: string;

  /** Promo type */
  promoType: PromoType;

  /** Face value of each coupon (e.g., 25.00) */
  faceValueAmount: number;

  /** Required matching wager from player (e.g., 25.00) */
  requiredMatchWagerAmount: number;

  /** Program status (active, inactive, archived) */
  status: string;

  /** Program start date (null = always valid) */
  startAt: string | null;

  /** Program end date (null = no expiration) */
  endAt: string | null;

  /** Staff who created the program */
  createdByStaffId: string | null;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

/**
 * Input for creating a promo program.
 */
export interface CreatePromoProgramInput {
  /** Casino UUID — injected from authoritative RLS context, never from user input */
  casinoId: string;

  /** Program name */
  name: string;

  /** Promo type (default: match_play) */
  promoType?: PromoType;

  /** Face value of each coupon */
  faceValueAmount: number;

  /** Required matching wager from player */
  requiredMatchWagerAmount: number;

  /** Program start date (optional) */
  startAt?: string;

  /** Program end date (optional) */
  endAt?: string;
}

/**
 * Input for updating a promo program.
 */
export interface UpdatePromoProgramInput {
  /** Program ID to update */
  id: string;

  /** Updated name (optional) */
  name?: string;

  /** Updated status (optional) */
  status?: 'active' | 'inactive' | 'archived';

  /** Updated start date (optional) */
  startAt?: string | null;

  /** Updated end date (optional) */
  endAt?: string | null;
}

// === Promo Coupon DTOs ===

/**
 * Promo coupon read DTO.
 * Represents an individual promotional coupon instance.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface PromoCouponDTO {
  /** Coupon ID */
  id: string;

  /** Casino ID (multi-tenant isolation) */
  casinoId: string;

  /** Associated promo program */
  promoProgramId: string;

  /** Unique validation number (printed on physical coupon) */
  validationNumber: string;

  /** Coupon lifecycle status */
  status: PromoCouponStatus;

  /** Face value of this coupon */
  faceValueAmount: number;

  /** Required matching wager amount */
  requiredMatchWagerAmount: number;

  /** Issuance timestamp (ISO 8601) */
  issuedAt: string;

  /** Expiration timestamp (ISO 8601, null = no expiration) */
  expiresAt: string | null;

  /** Void timestamp (if voided) */
  voidedAt: string | null;

  /** Replacement timestamp (if replaced) */
  replacedAt: string | null;

  /** Clearance timestamp (if cleared, post-v0) */
  clearedAt: string | null;

  /** Associated player (optional - supports anonymous issuance) */
  playerId: string | null;

  /** Associated visit (optional) */
  visitId: string | null;

  /** Staff who issued the coupon */
  issuedByStaffId: string;

  /** Staff who voided the coupon (if voided) */
  voidedByStaffId: string | null;

  /** Staff who replaced the coupon (if replaced) */
  replacedByStaffId: string | null;

  /** Replacement coupon ID (if this coupon was replaced) */
  replacementCouponId: string | null;
}

// === Issue Coupon DTOs ===

/**
 * Input for issuing a promotional coupon.
 */
export interface IssueCouponInput {
  /** Promo program ID to issue from */
  promoProgramId: string;

  /** Validation number (printed on physical coupon) */
  validationNumber: string;

  /** Idempotency key (prevents duplicate issuance on retry) */
  idempotencyKey: string;

  /** Player to issue to (optional - supports anonymous issuance) */
  playerId?: string;

  /** Visit to associate with (optional) */
  visitId?: string;

  /** Expiration date override (optional, uses program default if not set) */
  expiresAt?: string;

  /** Correlation ID for audit trail (optional) */
  correlationId?: string;
}

/**
 * Output from coupon issuance operation.
 */
export interface IssueCouponOutput {
  /** Issued coupon details */
  coupon: {
    /** Coupon ID */
    id: string;

    /** Validation number */
    validationNumber: string;

    /** Current status (should be 'issued') */
    status: PromoCouponStatus;

    /** Face value */
    faceValueAmount: number;

    /** Required match wager */
    requiredMatchWagerAmount: number;

    /** Issuance timestamp */
    issuedAt: string;

    /** Expiration timestamp */
    expiresAt: string | null;

    /** Associated player */
    playerId: string | null;

    /** Associated visit */
    visitId: string | null;
  };

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Void Coupon DTOs ===

/**
 * Input for voiding a promotional coupon.
 */
export interface VoidCouponInput {
  /** Coupon ID to void */
  couponId: string;

  /** Idempotency key */
  idempotencyKey: string;

  /** Correlation ID for audit trail (optional) */
  correlationId?: string;
}

/**
 * Output from coupon void operation.
 */
export interface VoidCouponOutput {
  /** Voided coupon details */
  coupon: {
    /** Coupon ID */
    id: string;

    /** Validation number */
    validationNumber: string;

    /** Current status (should be 'voided') */
    status: PromoCouponStatus;

    /** Void timestamp */
    voidedAt: string;

    /** Staff who voided */
    voidedByStaffId: string;
  };

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Replace Coupon DTOs ===

/**
 * Input for replacing a promotional coupon.
 */
export interface ReplaceCouponInput {
  /** Coupon ID to replace */
  couponId: string;

  /** New validation number for replacement coupon */
  newValidationNumber: string;

  /** Idempotency key */
  idempotencyKey: string;

  /** New expiration date (optional, uses original if not set) */
  newExpiresAt?: string;

  /** Correlation ID for audit trail (optional) */
  correlationId?: string;
}

/**
 * Output from coupon replacement operation.
 */
export interface ReplaceCouponOutput {
  /** Old (replaced) coupon details */
  oldCoupon: {
    /** Coupon ID */
    id: string;

    /** Validation number */
    validationNumber: string;

    /** Current status (should be 'replaced') */
    status: PromoCouponStatus;

    /** Replacement timestamp */
    replacedAt: string;
  };

  /** New coupon details */
  newCoupon: {
    /** Coupon ID */
    id: string;

    /** Validation number */
    validationNumber: string;

    /** Current status (should be 'issued') */
    status: PromoCouponStatus;

    /** Face value */
    faceValueAmount: number;

    /** Issuance timestamp */
    issuedAt: string;

    /** Expiration timestamp */
    expiresAt: string | null;
  };

  /** True if this was a duplicate request (idempotent response) */
  isExisting: boolean;
}

// === Inventory Query DTOs ===

/**
 * Input for querying coupon inventory.
 */
export interface CouponInventoryQuery {
  /** Filter by program (optional) */
  promoProgramId?: string;

  /** Filter by status (optional) */
  status?: PromoCouponStatus;
}

/**
 * Single row from inventory query result.
 */
export interface CouponInventoryRow {
  /** Coupon status */
  status: PromoCouponStatus;

  /** Number of coupons with this status */
  couponCount: number;

  /** Total face value of coupons with this status */
  totalFaceValue: number;

  /** Total match wager of coupons with this status */
  totalMatchWager: number;
}

/**
 * Output from inventory query.
 */
export interface CouponInventoryOutput {
  /** Inventory breakdown by status */
  inventory: CouponInventoryRow[];
}

// === List Query DTOs ===

/**
 * Query parameters for listing promo programs.
 */
export interface PromoProgramListQuery {
  /** Filter by status (optional) */
  status?: string;

  /** Include only active programs (within date range) */
  activeOnly?: boolean;

  /** Limit results (default 50, max 100) */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Query parameters for listing promo coupons.
 */
export interface PromoCouponListQuery {
  /** Filter by program (optional) */
  promoProgramId?: string;

  /** Filter by status (optional) */
  status?: PromoCouponStatus;

  /** Filter by player (optional) */
  playerId?: string;

  /** Filter by visit (optional) */
  visitId?: string;

  /** Filter coupons expiring before this date (optional) */
  expiringBefore?: string;

  /** Limit results (default 50, max 100) */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

// === Promo Exposure Rollup DTOs ===

/**
 * Query options for promo exposure rollup.
 */
export interface PromoExposureRollupQuery {
  /** Filter by gaming day (ISO date: YYYY-MM-DD) */
  gamingDay?: string;

  /** Filter by shift ID (optional, future use) */
  shiftId?: string;

  /** Filter coupons issued after this time (ISO 8601) */
  fromTs?: string;

  /** Filter coupons issued before this time (ISO 8601) */
  toTs?: string;
}

/**
 * Promo exposure rollup metrics for shift dashboards.
 * Surfaces promo summaries SEPARATELY from cash KPIs (DoD requirement).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXECUTION-SPEC
export interface PromoExposureRollupDTO {
  /** Casino ID */
  casinoId: string;

  /** Gaming day (if filtered) */
  gamingDay: string | null;

  /** Start of time window (ISO 8601) */
  fromTs: string;

  /** End of time window (ISO 8601) */
  toTs: string;

  /** Number of coupons issued within time window */
  issuedCount: number;

  /** Total face value of issued coupons within time window */
  totalIssuedFaceValue: number;

  /** Total patron at-risk (required match wager) within time window */
  totalIssuedPatronRisk: number;

  /** Number of currently outstanding (issued, not voided/replaced/cleared) coupons */
  outstandingCount: number;

  /** Total face value of outstanding coupons */
  outstandingFaceValue: number;

  /** Number of coupons voided within time window */
  voidedCount: number;

  /** Number of coupons replaced within time window */
  replacedCount: number;

  /** Number of issued coupons expiring within 24 hours */
  expiringSoonCount: number;
}
