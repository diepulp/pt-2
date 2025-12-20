import { randomUUID } from "crypto";

import { runWithCorrelation } from "@/lib/correlation";
import type { DomainErrorCode } from "@/lib/errors/domain-errors";
import { getRateLimiter } from "@/lib/errors/rate-limiter";
import type { ResultCode, ServiceResult } from "@/lib/http/service-response";
import {
  getAuthContext,
  injectRLSContext,
  type RLSContext,
} from "@/lib/supabase/rls-context";

import { writeAuditLog } from "./audit";
import { mapDatabaseError } from "./error-map";
import type { ServerActionContext, ServerActionHandler } from "./types";

const RESULT_CODES: ResultCode[] = [
  "OK",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNIQUE_VIOLATION",
  "FOREIGN_KEY_VIOLATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
];

type MaybeServiceResult<T> = ServiceResult<T> | T;

function isServiceResult<T>(value: unknown): value is ServiceResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "code" in value
  );
}

function resolveResultCode(code: unknown): ResultCode {
  if (typeof code === "string" && RESULT_CODES.includes(code as ResultCode)) {
    return code as ResultCode;
  }
  return "INTERNAL_ERROR";
}

function finalizeResult<T>(
  value: MaybeServiceResult<T>,
  requestId: string,
  startedAt: number,
): ServiceResult<T> {
  if (isServiceResult<T>(value)) {
    return {
      data: value.data,
      error: value.error,
      details: value.details,
      ok: value.ok ?? true,
      code: resolveResultCode(value.code),
      requestId,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    data: value as T,
    ok: true,
    code: "OK",
    requestId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

export async function withServerAction<T>(
  handler: ServerActionHandler<T>,
  context: ServerActionContext & {
    endpoint?: string;
    actorId?: string;
    casinoId?: string;
  },
): Promise<ServiceResult<T>> {
  const requestId = context.requestId ?? randomUUID();
  const startedAt = Date.now();

  const execute = async () => {
    let rlsContext: RLSContext | null = null;

    try {
      // 1. Get authenticated context (validates auth.uid() → staff)
      rlsContext = await getAuthContext(context.supabase);

      // 2. Inject RLS context via SET LOCAL
      await injectRLSContext(context.supabase, rlsContext, requestId);

      // 3. Rate limiting check (if endpoint specified)
      if (context.endpoint) {
        const rateLimiter = getRateLimiter();
        await rateLimiter.checkLimit(context.endpoint, {
          actorId: rlsContext.actorId,
          casinoId: rlsContext.casinoId,
        });
      }

      // 4. Execute handler with RLS context active
      const result = await handler();
      const envelope = finalizeResult(
        result as MaybeServiceResult<T>,
        requestId,
        startedAt,
      );

      // 5. Audit log
      if (process.env.NODE_ENV === "production") {
        await writeAuditLog(
          context.supabase,
          {
            ...context,
            userId: rlsContext.actorId,
            casinoId: rlsContext.casinoId,
          },
          envelope,
        );
      }

      return envelope;
    } catch (error) {
      const mapped = mapDatabaseError(error);
      const failure: ServiceResult<T> = {
        data: undefined,
        ok: false,
        code: mapped.code as DomainErrorCode,
        error: mapped.message,
        details: mapped.details,
        retryable: mapped.retryable,
        requestId,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };

      if (process.env.NODE_ENV === "production") {
        await writeAuditLog(
          context.supabase,
          {
            ...context,
            userId: rlsContext?.actorId,
            casinoId: rlsContext?.casinoId,
          },
          failure,
        );
      }

      return failure;
    }
  };

  return runWithCorrelation(requestId, execute);
}
