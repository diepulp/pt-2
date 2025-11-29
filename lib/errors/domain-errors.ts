/**
 * Domain Error Catalog
 *
 * Purpose: Define domain-specific error codes that map business logic failures
 * to user-friendly codes. Prevents Postgres error codes from leaking to UI.
 *
 * Pattern: Each service domain defines its specific error codes.
 * Generic infrastructure codes remain in ResultCode type.
 */

// ============================================================================
// INFRASTRUCTURE ERROR CODES (Generic, cross-domain)
// ============================================================================

export type InfrastructureErrorCode =
  | "OK"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNIQUE_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "IDEMPOTENCY_CONFLICT";

// ============================================================================
// VISIT DOMAIN ERRORS
// ============================================================================

export type VisitErrorCode =
  | "VISIT_NOT_FOUND"
  | "VISIT_NOT_OPEN"
  | "VISIT_ALREADY_CLOSED"
  | "VISIT_PLAYER_MISMATCH"
  | "VISIT_CASINO_MISMATCH"
  | "VISIT_CONCURRENT_MODIFICATION";

export const VISIT_ERROR_MESSAGES: Record<VisitErrorCode, string> = {
  VISIT_NOT_FOUND: "Visit session not found",
  VISIT_NOT_OPEN: "Visit session is not currently open",
  VISIT_ALREADY_CLOSED: "Visit session has already been closed",
  VISIT_PLAYER_MISMATCH: "Visit does not belong to the specified player",
  VISIT_CASINO_MISMATCH: "Visit does not belong to the specified casino",
  VISIT_CONCURRENT_MODIFICATION: "Visit was modified by another process",
};

// ============================================================================
// LOYALTY DOMAIN ERRORS
// ============================================================================

export type LoyaltyErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "REWARD_ALREADY_ISSUED"
  | "LOYALTY_ACCOUNT_NOT_FOUND"
  | "LOYALTY_TIER_INVALID"
  | "LOYALTY_REDEMPTION_FAILED"
  | "LOYALTY_POINTS_NEGATIVE"
  | "LOYALTY_POLICY_VIOLATION";

export const LOYALTY_ERROR_MESSAGES: Record<LoyaltyErrorCode, string> = {
  INSUFFICIENT_BALANCE: "Insufficient loyalty points balance",
  REWARD_ALREADY_ISSUED: "Reward has already been issued for this transaction",
  LOYALTY_ACCOUNT_NOT_FOUND: "Loyalty account not found for player",
  LOYALTY_TIER_INVALID: "Invalid loyalty tier",
  LOYALTY_REDEMPTION_FAILED: "Loyalty points redemption failed",
  LOYALTY_POINTS_NEGATIVE: "Loyalty points cannot be negative",
  LOYALTY_POLICY_VIOLATION: "Operation violates loyalty policy rules",
};

// ============================================================================
// RATING SLIP DOMAIN ERRORS
// ============================================================================

export type RatingSlipErrorCode =
  | "RATING_SLIP_NOT_FOUND"
  | "RATING_SLIP_NOT_OPEN"
  | "RATING_SLIP_NOT_PAUSED"
  | "RATING_SLIP_ALREADY_CLOSED"
  | "RATING_SLIP_INVALID_STATE"
  | "RATING_SLIP_MISSING_REQUIRED_DATA"
  | "RATING_SLIP_CONCURRENT_UPDATE";

export const RATING_SLIP_ERROR_MESSAGES: Record<RatingSlipErrorCode, string> = {
  RATING_SLIP_NOT_FOUND: "Rating slip not found",
  RATING_SLIP_NOT_OPEN: "Rating slip is not in open state",
  RATING_SLIP_NOT_PAUSED: "Rating slip is not in paused state",
  RATING_SLIP_ALREADY_CLOSED: "Rating slip has already been closed",
  RATING_SLIP_INVALID_STATE:
    "Rating slip is in an invalid state for this operation",
  RATING_SLIP_MISSING_REQUIRED_DATA:
    "Rating slip is missing required telemetry data",
  RATING_SLIP_CONCURRENT_UPDATE: "Rating slip was modified by another process",
};

// ============================================================================
// FINANCE DOMAIN ERRORS
// ============================================================================

export type FinanceErrorCode =
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_ALREADY_PROCESSED"
  | "TRANSACTION_AMOUNT_INVALID"
  | "TRANSACTION_INSUFFICIENT_FUNDS"
  | "TRANSACTION_CANCELLED"
  | "TRANSACTION_VOIDED"
  | "GAMING_DAY_MISMATCH";

export const FINANCE_ERROR_MESSAGES: Record<FinanceErrorCode, string> = {
  TRANSACTION_NOT_FOUND: "Financial transaction not found",
  TRANSACTION_ALREADY_PROCESSED: "Transaction has already been processed",
  TRANSACTION_AMOUNT_INVALID: "Transaction amount is invalid",
  TRANSACTION_INSUFFICIENT_FUNDS: "Insufficient funds for transaction",
  TRANSACTION_CANCELLED: "Transaction has been cancelled",
  TRANSACTION_VOIDED: "Transaction has been voided",
  GAMING_DAY_MISMATCH: "Transaction gaming day does not match expected value",
};

// ============================================================================
// MTL DOMAIN ERRORS
// ============================================================================

export type MTLErrorCode =
  | "MTL_ENTRY_NOT_FOUND"
  | "MTL_THRESHOLD_EXCEEDED"
  | "MTL_WATCHLIST_HIT"
  | "MTL_CTR_REQUIRED"
  | "MTL_IMMUTABLE_ENTRY"
  | "MTL_MISSING_COMPLIANCE_DATA";

export const MTL_ERROR_MESSAGES: Record<MTLErrorCode, string> = {
  MTL_ENTRY_NOT_FOUND: "MTL entry not found",
  MTL_THRESHOLD_EXCEEDED: "Transaction exceeds compliance threshold",
  MTL_WATCHLIST_HIT: "Transaction triggers watchlist alert",
  MTL_CTR_REQUIRED: "Transaction requires CTR filing",
  MTL_IMMUTABLE_ENTRY: "MTL entry cannot be modified after creation",
  MTL_MISSING_COMPLIANCE_DATA: "Missing required compliance data",
};

// ============================================================================
// TABLE CONTEXT DOMAIN ERRORS
// ============================================================================

export type TableContextErrorCode =
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_ACTIVE"
  | "TABLE_ALREADY_ACTIVE"
  | "TABLE_OCCUPIED"
  | "TABLE_DEALER_CONFLICT"
  | "TABLE_SETTINGS_INVALID"
  | "TABLE_FILL_REJECTED"
  | "TABLE_CREDIT_REJECTED";

export const TABLE_CONTEXT_ERROR_MESSAGES: Record<
  TableContextErrorCode,
  string
> = {
  TABLE_NOT_FOUND: "Gaming table not found",
  TABLE_NOT_ACTIVE: "Gaming table is not active",
  TABLE_ALREADY_ACTIVE: "Gaming table is already active",
  TABLE_OCCUPIED: "Gaming table is currently occupied",
  TABLE_DEALER_CONFLICT: "Dealer assignment conflict",
  TABLE_SETTINGS_INVALID: "Table settings are invalid",
  TABLE_FILL_REJECTED: "Table fill request rejected",
  TABLE_CREDIT_REJECTED: "Table credit request rejected",
};

// ============================================================================
// PLAYER DOMAIN ERRORS
// ============================================================================

export type PlayerErrorCode =
  | "PLAYER_NOT_FOUND"
  | "PLAYER_ALREADY_EXISTS"
  | "PLAYER_NOT_ENROLLED"
  | "PLAYER_ENROLLMENT_DUPLICATE"
  | "PLAYER_SUSPENDED"
  | "PLAYER_SELF_EXCLUDED";

export const PLAYER_ERROR_MESSAGES: Record<PlayerErrorCode, string> = {
  PLAYER_NOT_FOUND: "Player not found",
  PLAYER_ALREADY_EXISTS: "Player already exists",
  PLAYER_NOT_ENROLLED: "Player is not enrolled at this casino",
  PLAYER_ENROLLMENT_DUPLICATE: "Player is already enrolled at this casino",
  PLAYER_SUSPENDED: "Player account is suspended",
  PLAYER_SELF_EXCLUDED: "Player is self-excluded",
};

// ============================================================================
// CASINO DOMAIN ERRORS
// ============================================================================

export type CasinoErrorCode =
  | "CASINO_NOT_FOUND"
  | "CASINO_SETTINGS_NOT_FOUND"
  | "CASINO_INACTIVE"
  | "STAFF_NOT_FOUND"
  | "STAFF_UNAUTHORIZED"
  | "STAFF_CASINO_MISMATCH";

export const CASINO_ERROR_MESSAGES: Record<CasinoErrorCode, string> = {
  CASINO_NOT_FOUND: "Casino not found",
  CASINO_SETTINGS_NOT_FOUND: "Casino settings not found",
  CASINO_INACTIVE: "Casino is not active",
  STAFF_NOT_FOUND: "Staff member not found",
  STAFF_UNAUTHORIZED: "Staff member is not authorized for this operation",
  STAFF_CASINO_MISMATCH: "Staff member does not belong to this casino",
};

// ============================================================================
// FLOOR LAYOUT DOMAIN ERRORS
// ============================================================================

export type FloorLayoutErrorCode =
  | "LAYOUT_NOT_FOUND"
  | "LAYOUT_VERSION_NOT_FOUND"
  | "LAYOUT_NOT_APPROVED"
  | "LAYOUT_ALREADY_ACTIVE"
  | "LAYOUT_IMMUTABLE"
  | "LAYOUT_VALIDATION_FAILED";

export const FLOOR_LAYOUT_ERROR_MESSAGES: Record<FloorLayoutErrorCode, string> =
  {
    LAYOUT_NOT_FOUND: "Floor layout not found",
    LAYOUT_VERSION_NOT_FOUND: "Floor layout version not found",
    LAYOUT_NOT_APPROVED: "Floor layout has not been approved",
    LAYOUT_ALREADY_ACTIVE: "A layout is already active for this casino",
    LAYOUT_IMMUTABLE: "Layout version cannot be modified",
    LAYOUT_VALIDATION_FAILED: "Floor layout validation failed",
  };

// ============================================================================
// COMBINED DOMAIN ERROR TYPE
// ============================================================================

export type DomainErrorCode =
  | InfrastructureErrorCode
  | VisitErrorCode
  | LoyaltyErrorCode
  | RatingSlipErrorCode
  | FinanceErrorCode
  | MTLErrorCode
  | TableContextErrorCode
  | PlayerErrorCode
  | CasinoErrorCode
  | FloorLayoutErrorCode;

// ============================================================================
// DOMAIN ERROR CLASS
// ============================================================================

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(
    code: DomainErrorCode,
    message?: string,
    options?: {
      httpStatus?: number;
      retryable?: boolean;
      details?: unknown;
    },
  ) {
    super(message ?? DomainError.getDefaultMessage(code));
    this.name = "DomainError";
    this.code = code;
    this.httpStatus =
      options?.httpStatus ?? DomainError.getDefaultHttpStatus(code);
    this.retryable = options?.retryable ?? DomainError.isRetryable(code);
    this.details = options?.details;
  }

  private static getDefaultMessage(code: DomainErrorCode): string {
    const messageMaps = [
      VISIT_ERROR_MESSAGES,
      LOYALTY_ERROR_MESSAGES,
      RATING_SLIP_ERROR_MESSAGES,
      FINANCE_ERROR_MESSAGES,
      MTL_ERROR_MESSAGES,
      TABLE_CONTEXT_ERROR_MESSAGES,
      PLAYER_ERROR_MESSAGES,
      CASINO_ERROR_MESSAGES,
      FLOOR_LAYOUT_ERROR_MESSAGES,
    ];

    for (const map of messageMaps) {
      if (code in map) {
        return map[code as keyof typeof map];
      }
    }

    return "An error occurred";
  }

  private static getDefaultHttpStatus(code: DomainErrorCode): number {
    // 400 - Client errors (validation, business logic violations)
    if (
      code === "VALIDATION_ERROR" ||
      code.includes("INVALID") ||
      code.includes("MISSING") ||
      code.includes("MISMATCH")
    ) {
      return 400;
    }

    // 401 - Unauthorized
    if (code === "UNAUTHORIZED") {
      return 401;
    }

    // 403 - Forbidden
    if (code === "FORBIDDEN" || code.includes("UNAUTHORIZED")) {
      return 403;
    }

    // 404 - Not found
    if (code === "NOT_FOUND" || code.includes("NOT_FOUND")) {
      return 404;
    }

    // 409 - Conflict
    if (
      code === "UNIQUE_VIOLATION" ||
      code.includes("ALREADY") ||
      code.includes("DUPLICATE") ||
      code.includes("CONCURRENT")
    ) {
      return 409;
    }

    // 422 - Unprocessable entity (business logic violations)
    if (
      code.includes("INSUFFICIENT") ||
      code.includes("EXCEEDED") ||
      code.includes("VIOLATION") ||
      code.includes("REJECTED")
    ) {
      return 422;
    }

    // 429 - Rate limit
    if (code === "RATE_LIMIT_EXCEEDED") {
      return 429;
    }

    // 500 - Server error
    return 500;
  }

  private static isRetryable(code: DomainErrorCode): boolean {
    // Retryable: transient failures (network, timeout, concurrent modification)
    const retryableCodes: DomainErrorCode[] = [
      "INTERNAL_ERROR",
      "VISIT_CONCURRENT_MODIFICATION",
      "RATING_SLIP_CONCURRENT_UPDATE",
    ];

    return retryableCodes.includes(code);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function toDomainError(error: unknown): DomainError {
  if (isDomainError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new DomainError("INTERNAL_ERROR", error.message, {
      details: error,
    });
  }

  return new DomainError("INTERNAL_ERROR", "An unexpected error occurred", {
    details: error,
  });
}
