import { DomainError } from "@/lib/errors/domain-errors";
import { injectRLSContext } from "@/lib/supabase/rls-context";

import type { Middleware, MiddlewareContext } from "./types";

/**
 * RLS Context Injection Middleware
 *
 * Executes SET LOCAL statements to inject context into Postgres session:
 * - SET LOCAL app.actor_id = 'uuid'
 * - SET LOCAL app.casino_id = 'uuid'
 * - SET LOCAL app.staff_role = 'role'
 * - SET LOCAL application_name = 'correlation-id'
 *
 * RLS policies can then use: current_setting('app.casino_id')::uuid
 *
 * REQUIRES: withAuth must run first to populate ctx.rlsContext
 *
 * @throws DomainError INTERNAL_ERROR - If RLS context missing or injection fails
 */
export function withRLS<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    if (!ctx.rlsContext) {
      throw new DomainError(
        "INTERNAL_ERROR",
        "RLS context not available - withAuth must run first",
      );
    }

    try {
      await injectRLSContext(ctx.supabase, ctx.rlsContext, ctx.correlationId);
      return next();
    } catch (error) {
      throw new DomainError("INTERNAL_ERROR", "Failed to inject RLS context", {
        details: error,
      });
    }
  };
}
