import type { ServiceResult } from '@/lib/http/service-response';
import type { Database, Json } from '@/types/database.types';

import type { Middleware, MiddlewareContext } from './types';

/**
 * Convert unknown value to JSON-safe type
 */
function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as Json;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item)) as Json;
  }

  if (typeof value === 'object') {
    const result: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toJson(val);
    }
    return result;
  }

  return String(value);
}

/**
 * Audit Logging Middleware
 *
 * Records audit_log entries for all operations.
 *
 * Captures:
 * - correlation_id (from context)
 * - actor_id (from RLS context)
 * - casino_id (from RLS context)
 * - domain, action (from config)
 * - result details (ok, code, error)
 * - duration (ms)
 *
 * NOTE: Only writes in production environment.
 * Fire-and-forget pattern - audit failures don't fail the request.
 */
export function withAudit<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    const result = await next();

    // Only audit in production
    if (process.env.NODE_ENV !== 'production') {
      return result;
    }

    try {
      await writeAuditEntry(ctx, result);
    } catch (error) {
      // Log but don't fail the request
      console.error('[audit] Failed to write audit log:', error);
    }

    return result;
  };
}

/**
 * Write audit log entry via append_audit_log RPC
 *
 * Uses SECURITY DEFINER RPC that derives casino_id/actor_id from
 * session vars set by set_rls_context_from_staff(). Direct INSERT
 * on audit_log is revoked from authenticated (SEC-007 P0 hardening).
 */
async function writeAuditEntry<T>(
  ctx: MiddlewareContext,
  result: ServiceResult<T>,
): Promise<void> {
  const details: Json = toJson({
    correlationId: ctx.correlationId,
    idempotencyKey: ctx.idempotencyKey ?? null,
    durationMs: Date.now() - ctx.startedAt,
    ok: result.ok,
    code: result.code,
    error: result.error ?? null,
  });

  const { error } = await ctx.supabase.rpc('append_audit_log', {
    p_domain: ctx.domain ?? ctx.endpoint ?? 'unknown',
    p_action: ctx.action ?? 'unknown',
    p_details: details,
  });
  if (error) {
    throw error;
  }
}
