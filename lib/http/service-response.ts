import { randomUUID } from 'crypto';

import type { NextRequest } from 'next/server';

import { IDEMPOTENCY_HEADER } from './headers';

export { IDEMPOTENCY_HEADER };
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { setCorrelationId } from '@/lib/correlation';
import { DomainError } from '@/lib/errors/domain-errors';

export type ResultCode =
  | 'OK'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNIQUE_VIOLATION'
  | 'FOREIGN_KEY_VIOLATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'IDEMPOTENCY_CONFLICT';

export interface ServiceResult<T> {
  ok: boolean;
  code: ResultCode | string; // Allow DomainErrorCode (superset of ResultCode)
  data?: T;
  error?: string;
  details?: unknown;
  retryable?: boolean;
  httpStatus?: number; // HTTP status from domain errors (used by route handlers)
  requestId: string;
  durationMs: number;
  timestamp: string;
}

export interface ServiceHttpResult<T> extends ServiceResult<T> {
  status: number;
}

const RESULT_CODE_HTTP_STATUS: Record<ResultCode, number> = {
  OK: 200,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNIQUE_VIOLATION: 409,
  FOREIGN_KEY_VIOLATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
  RATE_LIMIT_EXCEEDED: 429,
  IDEMPOTENCY_CONFLICT: 409,
};

export function toHttpStatus(code: ResultCode): number {
  return RESULT_CODE_HTTP_STATUS[code] ?? 500;
}

export interface RequestContext {
  request: NextRequest;
  requestId: string;
  startedAt: number;
}

export function createRequestContext(request: NextRequest): RequestContext {
  const existing = request.headers.get('x-request-id');
  const requestId = existing ?? randomUUID();
  setCorrelationId(requestId);

  return {
    request,
    requestId,
    startedAt: Date.now(),
  };
}

export class RouteError extends Error {
  public readonly code: ResultCode;
  public readonly details?: unknown;

  constructor(
    code: ResultCode,
    message: string,
    options?: { details?: unknown },
  ) {
    super(message);
    this.name = 'RouteError';
    this.code = code;
    this.details = options?.details;
  }
}

/**
 * Strip non-serializable values from error details to prevent
 * "cyclic object value" when NextResponse.json() calls JSON.stringify().
 * Raw Error objects (e.g. PostgrestError, FetchError) often contain
 * circular references through internal client/request/response refs.
 *
 * This is the LAST line of defense — upstream code should use
 * safeErrorDetails() from @/lib/errors/safe-error-details at error creation.
 */
export function safeDetails(details: unknown): unknown {
  if (details == null) return undefined;

  // Error objects are the primary source of circular refs
  if (details instanceof Error) {
    const safe: Record<string, unknown> = {
      message: details.message,
      name: details.name,
    };
    if ('code' in details) safe.code = (details as { code: unknown }).code;
    return safe;
  }

  // Attempt serialization; deep-clone via parse to sever any shared refs.
  // Fall back to safeErrorDetails() on circular ref.
  try {
    return JSON.parse(JSON.stringify(details)) as unknown;
  } catch {
    // Circular reference detected — extract safe primitives
    if (typeof details === 'object' && details !== null) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
        if (
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean' ||
          v === null
        ) {
          safe[k] = v;
        }
      }
      return Object.keys(safe).length > 0
        ? safe
        : 'Non-serializable error details';
    }
    return String(details);
  }
}

function baseResult<T>(
  ctx: RequestContext,
  partial: Omit<ServiceHttpResult<T>, 'durationMs' | 'timestamp' | 'requestId'>,
): ServiceHttpResult<T> {
  return {
    ...partial,
    // Sanitize details at the serialization boundary
    details: safeDetails(partial.details),
    requestId: ctx.requestId,
    durationMs: Date.now() - ctx.startedAt,
    timestamp: new Date().toISOString(),
  };
}

export function successResponse<T>(
  ctx: RequestContext,
  data: T,
  code: ResultCode = 'OK',
  status = toHttpStatus(code),
) {
  const result = baseResult<T>(ctx, {
    ok: true,
    code,
    status,
    data,
  });

  return NextResponse.json(result, { status: result.status });
}

export function errorResponse(
  ctx: RequestContext,
  error: unknown,
  fallbackMessage = 'Unexpected error',
) {
  // If error is already a ServiceResult (from middleware), convert to response
  if (
    typeof error === 'object' &&
    error !== null &&
    'ok' in error &&
    'code' in error &&
    'error' in error
  ) {
    const serviceResult = error as ServiceHttpResult<never>;
    // Determine HTTP status: prefer explicit status/httpStatus from middleware,
    // fall back to code-based lookup for standard ResultCodes
    const status =
      'status' in serviceResult && typeof serviceResult.status === 'number'
        ? serviceResult.status
        : 'httpStatus' in serviceResult &&
            typeof serviceResult.httpStatus === 'number'
          ? serviceResult.httpStatus
          : toHttpStatus(
              (serviceResult.code as ResultCode) ?? 'INTERNAL_ERROR',
            );

    // Sanitize details before serialization to prevent cyclic object errors
    const sanitized = {
      ...serviceResult,
      details: safeDetails(serviceResult.details),
    };
    return NextResponse.json(sanitized, { status });
  }

  if (error instanceof DomainError) {
    const result = baseResult<never>(ctx, {
      ok: false,
      code: error.code,
      status: error.httpStatus,
      error: error.message,
      // eslint-disable-next-line error-safety/no-unsafe-error-details -- baseResult() applies safeDetails() downstream
      details: error.details,
      retryable: error.retryable,
    });
    return NextResponse.json(result, { status: result.status });
  }

  if (error instanceof RouteError) {
    const status = toHttpStatus(error.code);
    const result = baseResult<never>(ctx, {
      ok: false,
      code: error.code,
      status,
      error: error.message,
      // eslint-disable-next-line error-safety/no-unsafe-error-details -- baseResult() applies safeDetails() downstream
      details: error.details,
    });
    return NextResponse.json(result, { status });
  }

  if (error instanceof ZodError) {
    const result = baseResult<never>(ctx, {
      ok: false,
      code: 'VALIDATION_ERROR',
      status: toHttpStatus('VALIDATION_ERROR'),
      error: 'Validation Failed',
      details: error.flatten(),
    });
    return NextResponse.json(result, { status: result.status });
  }

  const result = baseResult<never>(ctx, {
    ok: false,
    code: 'INTERNAL_ERROR',
    status: toHttpStatus('INTERNAL_ERROR'),
    error: error instanceof Error ? error.message : fallbackMessage,
  });
  return NextResponse.json(result, { status: result.status });
}

export async function readJsonBody<T>(request: NextRequest): Promise<T> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new RouteError(
      'VALIDATION_ERROR',
      'Content-Type must be application/json',
    );
  }

  return (await request.json()) as T;
}

export function parseQuery<T>(
  request: NextRequest,
  schema: { parse: (input: unknown) => T },
): T {
  const { searchParams } = new URL(request.url);
  const queryObject: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    queryObject[key] = value;
  });

  return schema.parse(queryObject);
}

export function parseParams<T>(
  params: Record<string, string | string[]>,
  schema: { parse: (input: unknown) => T },
): T {
  return schema.parse(params);
}

export function requireIdempotencyKey(request: NextRequest): string {
  const key =
    request.headers.get(IDEMPOTENCY_HEADER) ??
    request.headers.get(IDEMPOTENCY_HEADER.toUpperCase());

  if (!key) {
    throw new RouteError(
      'VALIDATION_ERROR',
      'Missing Idempotency-Key header for mutating request',
    );
  }

  return key;
}
