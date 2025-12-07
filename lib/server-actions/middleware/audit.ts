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
 * Write audit log entry to database
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

  const payload = {
    casino_id: ctx.rlsContext?.casinoId ?? null,
    domain: ctx.domain ?? ctx.endpoint ?? 'unknown',
    actor_id: ctx.rlsContext?.actorId ?? null,
    action: ctx.action ?? 'unknown',
    details,
  } satisfies Database['public']['Tables']['audit_log']['Insert'];

  const { error } = await ctx.supabase.from('audit_log').insert(payload);
  if (error) {
    throw error;
  }
}
