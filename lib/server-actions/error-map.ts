import type { DomainErrorCode } from '@/lib/errors/domain-errors';
import { DomainError, isDomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { ResultCode } from '@/lib/http/service-response';

/**
 * Postgres Error Code Mapping
 *
 * CRITICAL: This mapping prevents Postgres error codes from leaking to UI.
 * All database errors are mapped to domain-specific error codes.
 */
const PG_ERROR_CODE_MAP: Record<string, DomainErrorCode> = {
  '23502': 'VALIDATION_ERROR',
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23505': 'UNIQUE_VIOLATION',
  '23514': 'VALIDATION_ERROR',
  '40001': 'VISIT_CONCURRENT_MODIFICATION', // Serialization failure
  '40P01': 'VISIT_CONCURRENT_MODIFICATION', // Deadlock detected
};

const RESULT_CODES: ResultCode[] = [
  'OK',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNIQUE_VIOLATION',
  'FOREIGN_KEY_VIOLATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
];

export interface MappedError {
  code: DomainErrorCode;
  message: string;
  httpStatus: number;
  retryable: boolean;
  details?: unknown;
}

function isResultCode(value: unknown): value is ResultCode {
  return (
    typeof value === 'string' && RESULT_CODES.includes(value as ResultCode)
  );
}

function normalizeMessage(
  message?: unknown,
  fallback = 'Internal error occurred',
): string {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
}

/**
 * Map database/application errors to domain errors
 *
 * Pattern:
 * 1. Check if already a DomainError (preserve it — details already sanitized at source)
 * 2. Map Postgres errors to domain errors
 * 3. Map PostgREST errors to domain errors
 * 4. Fall back to INTERNAL_ERROR
 *
 * INV-ERR-DETAILS: All paths sanitize `details` via safeErrorDetails() to prevent
 * cyclic object serialization errors in NextResponse.json().
 */
export function mapDatabaseError(error: unknown): MappedError {
  // Already a domain error - preserve it
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
      details: error.details,
    };
  }

  // Check for error object
  if (error && typeof error === 'object') {
    const code = Reflect.get(error, 'code');
    const message = Reflect.get(error, 'message');
    const rawDetails = Reflect.get(error, 'details');
    // Sanitize extracted details — PostgREST details are strings (safe),
    // but other error shapes may carry circular refs.
    const details =
      typeof rawDetails === 'string' || typeof rawDetails === 'number'
        ? rawDetails
        : safeErrorDetails(rawDetails);

    // Postgres error codes
    if (typeof code === 'string' && PG_ERROR_CODE_MAP[code]) {
      const domainCode = PG_ERROR_CODE_MAP[code];
      return {
        code: domainCode,
        message: normalizeMessage(message, 'Database constraint violated'),
        httpStatus: new DomainError(domainCode).httpStatus,
        retryable: new DomainError(domainCode).retryable,
        details,
      };
    }

    // PostgREST errors
    if (code === 'PGRST116') {
      return {
        code: 'NOT_FOUND',
        message: 'Record not found',
        httpStatus: 404,
        retryable: false,
        details,
      };
    }

    // Check if it's a result code (legacy support)
    if (isResultCode(code)) {
      const domainError = new DomainError(code, normalizeMessage(message), {
        details,
      });
      return {
        code: domainError.code,
        message: domainError.message,
        httpStatus: domainError.httpStatus,
        retryable: domainError.retryable,
        details: domainError.details,
      };
    }
  }

  // Generic Error — safeErrorDetails strips circular refs
  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      httpStatus: 500,
      retryable: false,
      details: safeErrorDetails(error),
    };
  }

  // Unknown error type
  return {
    code: 'INTERNAL_ERROR',
    message: 'Internal error occurred',
    httpStatus: 500,
    retryable: false,
    details: safeErrorDetails(error),
  };
}
