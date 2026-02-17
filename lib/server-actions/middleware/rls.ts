import { DomainError } from '@/lib/errors/domain-errors';
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';
import { injectRLSContext } from '@/lib/supabase/rls-context';

import type { Middleware, MiddlewareContext } from './types';

/**
 * RLS Context Injection Middleware
 *
 * AUTH-HARDENING v0.1 WS2: The RPC is the single source of truth.
 * Calls set_rls_context_from_staff() which both sets Postgres session vars
 * AND returns the derived context. ctx.rlsContext is overwritten with the
 * RPC response — any prior value from withAuth is replaced.
 *
 * Executes SET LOCAL statements to inject context into Postgres session:
 * - SET LOCAL app.actor_id = 'uuid'
 * - SET LOCAL app.casino_id = 'uuid'
 * - SET LOCAL app.staff_role = 'role'
 * - SET LOCAL application_name = 'correlation-id'
 *
 * RLS policies can then use: current_setting('app.casino_id')::uuid
 *
 * @throws DomainError INTERNAL_ERROR - If RPC injection fails
 */
export function withRLS<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    // INV-030-8: Dev bypass — context already set by withAuth() from DEV_RLS_CONTEXT.
    // Service-role client has no auth.uid(), so the RPC would always fail.
    // Invariant: only dev bypass sets ctx.rlsContext before withRLS() in the current
    // middleware chain. If future refactors change this, revisit this guard.
    if (ctx.rlsContext && isDevAuthBypassEnabled()) {
      return next();
    }

    try {
      const rpcContext = await injectRLSContext(
        ctx.supabase,
        ctx.correlationId,
      );
      // Overwrite ctx.rlsContext with RPC-derived context (single source of truth)
      ctx.rlsContext = rpcContext;
      return next();
    } catch (error) {
      throw new DomainError('INTERNAL_ERROR', 'Failed to inject RLS context', {
        details: error,
      });
    }
  };
}
