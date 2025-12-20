import { randomUUID } from "crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { setCorrelationId } from "@/lib/correlation";
import { DomainError } from "@/lib/errors/domain-errors";

export type ResultCode =
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

export interface ServiceResult<T> {
  ok: boolean;
  code: ResultCode | string; // Allow DomainErrorCode (superset of ResultCode)
  data?: T;
  error?: string;
  details?: unknown;
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

export const IDEMPOTENCY_HEADER = "idempotency-key";

export function toHttpStatus(code: ResultCode): number {
  return RESULT_CODE_HTTP_STATUS[code] ?? 500;
}

export interface RequestContext {
  request: NextRequest;
  requestId: string;
  startedAt: number;
}

export function createRequestContext(request: NextRequest): RequestContext {
  const existing = request.headers.get("x-request-id");
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
    this.name = "RouteError";
    this.code = code;
    this.details = options?.details;
  }
}

function baseResult<T>(
  ctx: RequestContext,
  partial: Omit<ServiceHttpResult<T>, "durationMs" | "timestamp" | "requestId">,
): ServiceHttpResult<T> {
  return {
    ...partial,
    requestId: ctx.requestId,
    durationMs: Date.now() - ctx.startedAt,
    timestamp: new Date().toISOString(),
  };
}

export function successResponse<T>(
  ctx: RequestContext,
  data: T,
  code: ResultCode = "OK",
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
  fallbackMessage = "Unexpected error",
) {
  // If error is already a ServiceResult (from middleware), convert to response
  if (
    typeof error === "object" &&
    error !== null &&
    "ok" in error &&
    "code" in error &&
    "error" in error
  ) {
    const serviceResult = error as ServiceHttpResult<never>;
    // Determine HTTP status from code if not present
    const status =
      "status" in serviceResult && typeof serviceResult.status === "number"
        ? serviceResult.status
        : toHttpStatus((serviceResult.code as ResultCode) ?? "INTERNAL_ERROR");

    return NextResponse.json(serviceResult, { status });
  }

  if (error instanceof DomainError) {
    const result = baseResult<never>(ctx, {
      ok: false,
      code: error.code,
      status: error.httpStatus,
      error: error.message,
      details: error.details,
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
      details: error.details,
    });
    return NextResponse.json(result, { status });
  }

  if (error instanceof ZodError) {
    const result = baseResult<never>(ctx, {
      ok: false,
      code: "VALIDATION_ERROR",
      status: toHttpStatus("VALIDATION_ERROR"),
      error: "Validation Failed",
      details: error.flatten(),
    });
    return NextResponse.json(result, { status: result.status });
  }

  const result = baseResult<never>(ctx, {
    ok: false,
    code: "INTERNAL_ERROR",
    status: toHttpStatus("INTERNAL_ERROR"),
    error: error instanceof Error ? error.message : fallbackMessage,
  });
  return NextResponse.json(result, { status: result.status });
}

export async function readJsonBody<T>(request: NextRequest): Promise<T> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new RouteError(
      "VALIDATION_ERROR",
      "Content-Type must be application/json",
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
      "VALIDATION_ERROR",
      "Missing Idempotency-Key header for mutating request",
    );
  }

  return key;
}
