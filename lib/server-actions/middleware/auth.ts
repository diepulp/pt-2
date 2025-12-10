import { DomainError } from "@/lib/errors/domain-errors";
import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from "@/lib/supabase/dev-context";
import { getAuthContext } from "@/lib/supabase/rls-context";

import type { Middleware, MiddlewareContext } from "./types";

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
 * DEV MODE: When NODE_ENV=development and DEV_AUTH_BYPASS is not 'false',
 * injects mock RLS context to allow API testing without authentication.
 *
 * @throws DomainError UNAUTHORIZED - No authenticated user
 * @throws DomainError FORBIDDEN - User not active staff or no casino
 */
export function withAuth<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    // DEV MODE: Use mock context for local development
    if (isDevAuthBypassEnabled()) {
      console.warn(
        "[DEV AUTH] Using mock RLS context:",
        DEV_RLS_CONTEXT.staffRole,
        "@",
        DEV_RLS_CONTEXT.casinoId.slice(0, 8),
      );
      ctx.rlsContext = DEV_RLS_CONTEXT;
      return next();
    }

    // PRODUCTION: Validate real authentication
    try {
      const rlsContext = await getAuthContext(ctx.supabase);
      ctx.rlsContext = rlsContext;
      return next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed";

      if (message.includes("UNAUTHORIZED")) {
        throw new DomainError("UNAUTHORIZED", "Authentication required");
      }

      if (message.includes("FORBIDDEN")) {
        throw new DomainError("FORBIDDEN", message);
      }

      throw new DomainError("INTERNAL_ERROR", message, { details: error });
    }
  };
}
