import { DomainError } from '@/lib/errors/domain-errors';
import {
  assertDevAuthBypassAllowed,
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from '@/lib/supabase/dev-context';
import { getAuthContext } from '@/lib/supabase/rls-context';
import { createServiceClient } from '@/lib/supabase/service';

import type { Middleware, MiddlewareContext } from './types';

/**
 * Authentication Middleware
 *
 * Validates:
 * 1. User is authenticated (auth.uid() exists)
 * 2. User is linked to active staff record
 * 3. Staff has valid casino assignment
 *
 * Populates ctx.rlsContext for downstream middleware.
 *
 * DEV MODE: When NODE_ENV=development AND ENABLE_DEV_AUTH=true (AUTH-HARDENING v0.1),
 * injects mock RLS context AND swaps to service role client to bypass RLS.
 * This is necessary because RLS policies require auth.uid() which is NULL
 * without a browser session.
 *
 * @throws DomainError UNAUTHORIZED - No authenticated user
 * @throws DomainError FORBIDDEN - User not active staff or no casino
 */
export function withAuth<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    // DEV MODE: Use mock context and service client for local development
    // AUTH-HARDENING v0.1 WS4: Requires ENABLE_DEV_AUTH=true + NODE_ENV=development
    if (isDevAuthBypassEnabled()) {
      assertDevAuthBypassAllowed();
      console.warn(
        '[AUTH BYPASS] DEV_AUTH active — using mock context (role=%s, casino=%s, endpoint=%s, correlationId=%s)',
        DEV_RLS_CONTEXT.staffRole,
        DEV_RLS_CONTEXT.casinoId.slice(0, 8),
        ctx.endpoint ?? 'unknown',
        ctx.correlationId,
      );
      ctx.rlsContext = DEV_RLS_CONTEXT;
      // Swap to service role client to bypass RLS auth.uid() check
      ctx.supabase = createServiceClient();
      return next();
    }

    // PRODUCTION: Validate real authentication
    try {
      const rlsContext = await getAuthContext(ctx.supabase);
      ctx.rlsContext = rlsContext;
      return next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';

      if (message.includes('UNAUTHORIZED')) {
        throw new DomainError('UNAUTHORIZED', 'Authentication required');
      }

      if (message.includes('FORBIDDEN')) {
        throw new DomainError('FORBIDDEN', message);
      }

      throw new DomainError('INTERNAL_ERROR', message, { details: error });
    }
  };
}
