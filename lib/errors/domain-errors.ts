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
  | 'OK'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNIQUE_VIOLATION'
  | 'FOREIGN_KEY_VIOLATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RLS_WRITE_DENIED';

// ============================================================================
// VISIT DOMAIN ERRORS
// ============================================================================

export type VisitErrorCode =
  | 'VISIT_NOT_FOUND'
  | 'VISIT_NOT_OPEN'
  | 'VISIT_ALREADY_CLOSED'
  | 'VISIT_PLAYER_MISMATCH'
  | 'VISIT_CASINO_MISMATCH'
  | 'VISIT_CONCURRENT_MODIFICATION'
  | 'VISIT_INVALID_KIND_PLAYER'
  | 'VISIT_INVALID_CONVERSION'
  | 'SOURCE_VISIT_NOT_CLOSED'
  | 'PLAYER_MISMATCH'
  | 'VISIT_ALREADY_OPEN'
  | 'TABLE_NOT_AVAILABLE'
  | 'SEAT_OCCUPIED';

export const VISIT_ERROR_MESSAGES: Record<VisitErrorCode, string> = {
  VISIT_NOT_FOUND: 'Visit session not found',
  VISIT_NOT_OPEN: 'Visit session is not currently open',
  VISIT_ALREADY_CLOSED: 'Visit session has already been closed',
  VISIT_PLAYER_MISMATCH: 'Visit does not belong to the specified player',
  VISIT_CASINO_MISMATCH: 'Visit does not belong to the specified casino',
  VISIT_CONCURRENT_MODIFICATION: 'Visit was modified by another process',
  VISIT_INVALID_KIND_PLAYER:
    'Ghost visits require NULL player_id; identified visits require player_id',
  VISIT_INVALID_CONVERSION:
    'Only reward_identified visits can be converted to gaming visits',
  // PRD-017: Visit Continuation errors
  SOURCE_VISIT_NOT_CLOSED: 'Source visit must be closed before continuing',
  PLAYER_MISMATCH: 'Player ID does not match the source visit',
  VISIT_ALREADY_OPEN: 'Player already has an active visit',
  TABLE_NOT_AVAILABLE: 'Destination table is not available',
  SEAT_OCCUPIED: 'Destination seat is already occupied',
};

// ============================================================================
// LOYALTY DOMAIN ERRORS
// ============================================================================

export type LoyaltyErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'REWARD_ALREADY_ISSUED'
  | 'LOYALTY_ACCOUNT_NOT_FOUND'
  | 'LOYALTY_TIER_INVALID'
  | 'LOYALTY_REDEMPTION_FAILED'
  | 'LOYALTY_POINTS_NEGATIVE'
  | 'LOYALTY_POLICY_VIOLATION'
  | 'LOYALTY_GHOST_VISIT_EXCLUDED'
  // Promo Instrument Errors (PRD-LOYALTY-PROMO)
  | 'PROMO_PROGRAM_NOT_FOUND'
  | 'PROMO_PROGRAM_INACTIVE'
  | 'PROMO_PROGRAM_NOT_STARTED'
  | 'PROMO_PROGRAM_ENDED'
  | 'COUPON_NOT_FOUND'
  | 'INVALID_COUPON_STATUS'
  | 'ANONYMOUS_ISSUANCE_DISABLED'
  | 'DUPLICATE_VALIDATION_NUMBER'
  | 'DUPLICATE_ENTRY'
  // Reward Catalog Errors (ADR-033)
  | 'REWARD_NOT_FOUND';

export const LOYALTY_ERROR_MESSAGES: Record<LoyaltyErrorCode, string> = {
  INSUFFICIENT_BALANCE: 'Insufficient loyalty points balance',
  REWARD_ALREADY_ISSUED: 'Reward has already been issued for this transaction',
  LOYALTY_ACCOUNT_NOT_FOUND: 'Loyalty account not found for player',
  LOYALTY_TIER_INVALID: 'Invalid loyalty tier',
  LOYALTY_REDEMPTION_FAILED: 'Loyalty points redemption failed',
  LOYALTY_POINTS_NEGATIVE: 'Loyalty points cannot be negative',
  LOYALTY_POLICY_VIOLATION: 'Operation violates loyalty policy rules',
  LOYALTY_GHOST_VISIT_EXCLUDED:
    'Ghost gaming visits are excluded from automated loyalty accrual (ADR-014)',
  // Promo Instrument Errors (PRD-LOYALTY-PROMO)
  PROMO_PROGRAM_NOT_FOUND:
    'Promo program not found or belongs to different casino',
  PROMO_PROGRAM_INACTIVE: 'Promo program is not active',
  PROMO_PROGRAM_NOT_STARTED: 'Promo program has not started yet',
  PROMO_PROGRAM_ENDED: 'Promo program has ended',
  COUPON_NOT_FOUND: 'Promo coupon not found or belongs to different casino',
  INVALID_COUPON_STATUS: 'Coupon cannot be modified in its current status',
  ANONYMOUS_ISSUANCE_DISABLED: 'Casino requires player for promo issuance',
  DUPLICATE_VALIDATION_NUMBER:
    'A coupon with this validation number already exists',
  DUPLICATE_ENTRY: 'Duplicate entry detected',
  // Reward Catalog Errors (ADR-033)
  REWARD_NOT_FOUND: 'Reward catalog entry not found',
};

// ============================================================================
// RATING SLIP DOMAIN ERRORS
// ============================================================================

export type RatingSlipErrorCode =
  | 'RATING_SLIP_NOT_FOUND'
  | 'RATING_SLIP_NOT_OPEN'
  | 'RATING_SLIP_NOT_PAUSED'
  | 'RATING_SLIP_ALREADY_CLOSED'
  | 'RATING_SLIP_INVALID_STATE'
  | 'RATING_SLIP_MISSING_REQUIRED_DATA'
  | 'RATING_SLIP_CONCURRENT_UPDATE'
  | 'RATING_SLIP_DUPLICATE';

export const RATING_SLIP_ERROR_MESSAGES: Record<RatingSlipErrorCode, string> = {
  RATING_SLIP_NOT_FOUND: 'Rating slip not found',
  RATING_SLIP_NOT_OPEN: 'Rating slip is not in open state',
  RATING_SLIP_NOT_PAUSED: 'Rating slip is not in paused state',
  RATING_SLIP_ALREADY_CLOSED: 'Rating slip has already been closed',
  RATING_SLIP_INVALID_STATE:
    'Rating slip is in an invalid state for this operation',
  RATING_SLIP_MISSING_REQUIRED_DATA:
    'Rating slip is missing required telemetry data',
  RATING_SLIP_CONCURRENT_UPDATE: 'Rating slip was modified by another process',
  RATING_SLIP_DUPLICATE:
    'An open rating slip already exists for this player at this table',
};

// ============================================================================
// FINANCE DOMAIN ERRORS
// ============================================================================

export type FinanceErrorCode =
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_ALREADY_PROCESSED'
  | 'TRANSACTION_AMOUNT_INVALID'
  | 'TRANSACTION_INSUFFICIENT_FUNDS'
  | 'TRANSACTION_CANCELLED'
  | 'TRANSACTION_VOIDED'
  | 'GAMING_DAY_MISMATCH'
  | 'STALE_GAMING_DAY_CONTEXT';

export const FINANCE_ERROR_MESSAGES: Record<FinanceErrorCode, string> = {
  TRANSACTION_NOT_FOUND: 'Financial transaction not found',
  TRANSACTION_ALREADY_PROCESSED: 'Transaction has already been processed',
  TRANSACTION_AMOUNT_INVALID: 'Transaction amount is invalid',
  TRANSACTION_INSUFFICIENT_FUNDS: 'Insufficient funds for transaction',
  TRANSACTION_CANCELLED: 'Transaction has been cancelled',
  TRANSACTION_VOIDED: 'Transaction has been voided',
  GAMING_DAY_MISMATCH: 'Transaction gaming day does not match expected value',
  STALE_GAMING_DAY_CONTEXT:
    'Session context is stale. Please refresh and try again.',
};

// ============================================================================
// MTL DOMAIN ERRORS
// ============================================================================

export type MTLErrorCode =
  | 'MTL_ENTRY_NOT_FOUND'
  | 'MTL_THRESHOLD_EXCEEDED'
  | 'MTL_WATCHLIST_HIT'
  | 'MTL_CTR_REQUIRED'
  | 'MTL_IMMUTABLE_ENTRY'
  | 'MTL_MISSING_COMPLIANCE_DATA';

export const MTL_ERROR_MESSAGES: Record<MTLErrorCode, string> = {
  MTL_ENTRY_NOT_FOUND: 'MTL entry not found',
  MTL_THRESHOLD_EXCEEDED: 'Transaction exceeds compliance threshold',
  MTL_WATCHLIST_HIT: 'Transaction triggers watchlist alert',
  MTL_CTR_REQUIRED: 'Transaction requires CTR filing',
  MTL_IMMUTABLE_ENTRY: 'MTL entry cannot be modified after creation',
  MTL_MISSING_COMPLIANCE_DATA: 'Missing required compliance data',
};

// ============================================================================
// TABLE CONTEXT DOMAIN ERRORS
// ============================================================================

export type TableContextErrorCode =
  | 'TABLE_NOT_FOUND'
  | 'TABLE_NOT_ACTIVE'
  | 'TABLE_NOT_INACTIVE'
  | 'TABLE_ALREADY_ACTIVE'
  | 'TABLE_ALREADY_CLOSED'
  | 'TABLE_HAS_OPEN_SLIPS'
  | 'TABLE_OCCUPIED'
  | 'TABLE_DEALER_CONFLICT'
  | 'TABLE_SETTINGS_INVALID'
  | 'TABLE_FILL_REJECTED'
  | 'TABLE_CREDIT_REJECTED'
  | 'FILL_DUPLICATE_REQUEST'
  | 'CREDIT_DUPLICATE_REQUEST'
  | 'DEALER_ROTATION_NOT_FOUND'
  // Table Session Errors (PRD-TABLE-SESSION-LIFECYCLE-MVP)
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ALREADY_EXISTS'
  | 'INVALID_STATE_TRANSITION'
  | 'MISSING_CLOSING_ARTIFACT'
  // Close Guardrail Errors (PRD-038A)
  | 'UNRESOLVED_LIABILITIES'
  | 'CLOSE_NOTE_REQUIRED'
  // Rundown Report Errors (PRD-038)
  | 'TABLE_RUNDOWN_ALREADY_FINALIZED'
  | 'TABLE_RUNDOWN_NOT_FOUND'
  | 'TABLE_RUNDOWN_SESSION_NOT_CLOSED'
  | 'TABLE_RUNDOWN_SESSION_NOT_FOUND'
  | 'TABLE_SESSION_INVARIANT_VIOLATION'
  // Shift Checkpoint Errors (PRD-038)
  | 'TABLE_CHECKPOINT_METRICS_UNAVAILABLE'
  | 'TABLE_CHECKPOINT_GAMING_DAY_UNRESOLVABLE';

export const TABLE_CONTEXT_ERROR_MESSAGES: Record<
  TableContextErrorCode,
  string
> = {
  TABLE_NOT_FOUND: 'Gaming table not found',
  TABLE_NOT_ACTIVE: 'Gaming table is not active',
  TABLE_NOT_INACTIVE: 'Cannot activate table that is not inactive',
  TABLE_ALREADY_ACTIVE: 'Gaming table is already active',
  TABLE_ALREADY_CLOSED: 'Gaming table is already closed (terminal state)',
  TABLE_HAS_OPEN_SLIPS: 'Cannot deactivate table with open rating slips',
  TABLE_OCCUPIED: 'Gaming table is currently occupied',
  TABLE_DEALER_CONFLICT: 'Dealer assignment conflict',
  TABLE_SETTINGS_INVALID: 'Table settings are invalid',
  TABLE_FILL_REJECTED: 'Table fill request rejected',
  TABLE_CREDIT_REJECTED: 'Table credit request rejected',
  FILL_DUPLICATE_REQUEST: 'Fill request with this ID already processed',
  CREDIT_DUPLICATE_REQUEST: 'Credit request with this ID already processed',
  DEALER_ROTATION_NOT_FOUND: 'No active dealer rotation found for this table',
  // Table Session Errors (PRD-TABLE-SESSION-LIFECYCLE-MVP)
  SESSION_NOT_FOUND: 'Table session not found',
  SESSION_ALREADY_EXISTS: 'An active session already exists for this table',
  INVALID_STATE_TRANSITION: 'Cannot perform operation in current session state',
  MISSING_CLOSING_ARTIFACT:
    'At least one closing artifact (drop_event_id or closing_inventory_snapshot_id) is required',
  // Close Guardrail Errors (PRD-038A)
  UNRESOLVED_LIABILITIES:
    'Session has unresolved items. Use force-close for privileged override.',
  CLOSE_NOTE_REQUIRED: 'close_reason="other" requires a non-empty close_note',
  // Rundown Report Errors (PRD-038)
  TABLE_RUNDOWN_ALREADY_FINALIZED:
    'Rundown report is finalized and cannot be modified',
  TABLE_RUNDOWN_NOT_FOUND: 'Rundown report not found',
  TABLE_RUNDOWN_SESSION_NOT_CLOSED:
    'Cannot finalize rundown: table session is not closed',
  TABLE_RUNDOWN_SESSION_NOT_FOUND: 'No active session found for this table',
  TABLE_SESSION_INVARIANT_VIOLATION:
    'Unique active session index violated — data integrity error',
  // Shift Checkpoint Errors (PRD-038)
  TABLE_CHECKPOINT_METRICS_UNAVAILABLE:
    'Could not compute shift metrics for checkpoint',
  TABLE_CHECKPOINT_GAMING_DAY_UNRESOLVABLE:
    'Could not derive gaming day for checkpoint',
};

// ============================================================================
// PLAYER DOMAIN ERRORS
// ============================================================================

export type PlayerErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_ALREADY_EXISTS'
  | 'PLAYER_NOT_ENROLLED'
  | 'PLAYER_ENROLLMENT_DUPLICATE'
  | 'PLAYER_SUSPENDED'
  | 'PLAYER_SELF_EXCLUDED';

export const PLAYER_ERROR_MESSAGES: Record<PlayerErrorCode, string> = {
  PLAYER_NOT_FOUND: 'Player not found',
  PLAYER_ALREADY_EXISTS: 'Player already exists',
  PLAYER_NOT_ENROLLED: 'Player is not enrolled at this casino',
  PLAYER_ENROLLMENT_DUPLICATE: 'Player is already enrolled at this casino',
  PLAYER_SUSPENDED: 'Player account is suspended',
  PLAYER_SELF_EXCLUDED: 'Player is self-excluded',
};

// ============================================================================
// CASINO DOMAIN ERRORS
// ============================================================================

export type CasinoErrorCode =
  | 'CASINO_NOT_FOUND'
  | 'CASINO_SETTINGS_NOT_FOUND'
  | 'CASINO_INACTIVE'
  | 'STAFF_NOT_FOUND'
  | 'STAFF_UNAUTHORIZED'
  | 'STAFF_CASINO_MISMATCH'
  | 'STAFF_ROLE_CONSTRAINT_VIOLATION'
  | 'STAFF_ALREADY_EXISTS'
  // Onboarding (PRD-025)
  | 'STAFF_ALREADY_BOUND'
  | 'INVITE_ALREADY_EXISTS'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED';

export const CASINO_ERROR_MESSAGES: Record<CasinoErrorCode, string> = {
  CASINO_NOT_FOUND: 'Casino not found',
  CASINO_SETTINGS_NOT_FOUND: 'Casino settings not found',
  CASINO_INACTIVE: 'Casino is not active',
  STAFF_NOT_FOUND: 'Staff member not found',
  STAFF_UNAUTHORIZED: 'Staff member is not authorized for this operation',
  STAFF_CASINO_MISMATCH: 'Staff member does not belong to this casino',
  STAFF_ROLE_CONSTRAINT_VIOLATION:
    'Staff role constraint violation: dealer cannot have user_id; pit_boss/admin must have user_id',
  STAFF_ALREADY_EXISTS: 'Staff member already exists',
  // Onboarding (PRD-025)
  STAFF_ALREADY_BOUND: 'You already have an active casino.',
  INVITE_ALREADY_EXISTS: 'An active invite already exists for this email.',
  INVITE_NOT_FOUND: 'This invite link is invalid.',
  INVITE_EXPIRED: 'This invite has expired.',
};

// ============================================================================
// FLOOR LAYOUT DOMAIN ERRORS
// ============================================================================

export type FloorLayoutErrorCode =
  | 'LAYOUT_NOT_FOUND'
  | 'LAYOUT_VERSION_NOT_FOUND'
  | 'LAYOUT_NOT_APPROVED'
  | 'LAYOUT_ALREADY_ACTIVE'
  | 'LAYOUT_IMMUTABLE'
  | 'LAYOUT_VALIDATION_FAILED';

export const FLOOR_LAYOUT_ERROR_MESSAGES: Record<FloorLayoutErrorCode, string> =
  {
    LAYOUT_NOT_FOUND: 'Floor layout not found',
    LAYOUT_VERSION_NOT_FOUND: 'Floor layout version not found',
    LAYOUT_NOT_APPROVED: 'Floor layout has not been approved',
    LAYOUT_ALREADY_ACTIVE: 'A layout is already active for this casino',
    LAYOUT_IMMUTABLE: 'Layout version cannot be modified',
    LAYOUT_VALIDATION_FAILED: 'Floor layout validation failed',
  };

// ============================================================================
// IMPORT DOMAIN ERRORS (PRD-037)
// ============================================================================

export type ImportErrorCode =
  | 'IMPORT_BATCH_NOT_FOUND'
  | 'IMPORT_BATCH_NOT_STAGING'
  | 'IMPORT_BATCH_ALREADY_EXECUTING'
  | 'IMPORT_ROW_NO_IDENTIFIER'
  | 'IMPORT_ROW_VALIDATION_FAILED'
  | 'IMPORT_IDEMPOTENCY_CONFLICT'
  | 'IMPORT_SIZE_LIMIT_EXCEEDED';

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  IMPORT_BATCH_NOT_FOUND: 'Import batch not found or not visible',
  IMPORT_BATCH_NOT_STAGING: 'Import batch is not in staging status',
  IMPORT_BATCH_ALREADY_EXECUTING: 'Import batch is currently executing',
  IMPORT_ROW_NO_IDENTIFIER: 'Row is missing both email and phone identifiers',
  IMPORT_ROW_VALIDATION_FAILED: 'Row failed schema validation',
  IMPORT_IDEMPOTENCY_CONFLICT:
    'Idempotency key already used for a different batch',
  IMPORT_SIZE_LIMIT_EXCEEDED: 'File or row count exceeds import limits',
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
  | FloorLayoutErrorCode
  | ImportErrorCode;

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
    this.name = 'DomainError';
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
      IMPORT_ERROR_MESSAGES,
    ];

    for (const map of messageMaps) {
      if (code in map) {
        return map[code as keyof typeof map];
      }
    }

    return 'An error occurred';
  }

  private static getDefaultHttpStatus(code: DomainErrorCode): number {
    // 400 - Client errors (validation, business logic violations)
    if (
      code === 'VALIDATION_ERROR' ||
      code.includes('INVALID') ||
      code.includes('MISSING') ||
      code.includes('MISMATCH')
    ) {
      return 400;
    }

    // 401 - Unauthorized
    if (code === 'UNAUTHORIZED') {
      return 401;
    }

    // 403 - Forbidden
    if (code === 'FORBIDDEN' || code.includes('UNAUTHORIZED')) {
      return 403;
    }

    // 404 - Not found
    if (code === 'NOT_FOUND' || code.includes('NOT_FOUND')) {
      return 404;
    }

    // 409 - Conflict
    if (
      code === 'UNIQUE_VIOLATION' ||
      code === 'IDEMPOTENCY_CONFLICT' ||
      code.includes('ALREADY') ||
      code.includes('DUPLICATE') ||
      code.includes('CONCURRENT') ||
      code.includes('NOT_STAGING') ||
      code.includes('IDEMPOTENCY_CONFLICT')
    ) {
      return 409;
    }

    // 413 - Payload too large
    if (code.includes('SIZE_LIMIT')) {
      return 413;
    }

    // 422 - Unprocessable entity (business logic violations)
    if (
      code.includes('INSUFFICIENT') ||
      code.includes('EXCEEDED') ||
      code.includes('VIOLATION') ||
      code.includes('REJECTED') ||
      code.includes('NO_IDENTIFIER') ||
      code.includes('VALIDATION_FAILED')
    ) {
      return 422;
    }

    // 429 - Rate limit
    if (code === 'RATE_LIMIT_EXCEEDED') {
      return 429;
    }

    // 500 - Server error
    return 500;
  }

  private static isRetryable(code: DomainErrorCode): boolean {
    // Retryable: transient failures (network, timeout, concurrent modification)
    const retryableCodes: DomainErrorCode[] = [
      'INTERNAL_ERROR',
      'VISIT_CONCURRENT_MODIFICATION',
      'RATING_SLIP_CONCURRENT_UPDATE',
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
    return new DomainError('INTERNAL_ERROR', error.message, {
      details: error,
    });
  }

  return new DomainError('INTERNAL_ERROR', 'An unexpected error occurred', {
    details: error,
  });
}
