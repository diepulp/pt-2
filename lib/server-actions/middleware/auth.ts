import { DomainError } from "@/lib/errors/domain-errors";
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
 * @throws DomainError UNAUTHORIZED - No authenticated user
 * @throws DomainError FORBIDDEN - User not active staff or no casino
 */
export function withAuth<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
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
