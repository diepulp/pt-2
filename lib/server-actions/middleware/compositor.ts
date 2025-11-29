import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runWithCorrelation } from "@/lib/correlation";
import type { ServiceResult } from "@/lib/http/service-response";
import type { Database } from "@/types/database.types";

import { withAudit } from "./audit";
import { withAuth } from "./auth";
import { withIdempotency } from "./idempotency";
import { withRLS } from "./rls";
import { withTracing } from "./tracing";
import type {
  Middleware,
  MiddlewareContext,
  ServerActionOptions,
} from "./types";

/**
 * Compose middleware functions into a single chain
 *
 * Uses Koa-style composition where each middleware calls next() to proceed.
 */
function compose<T>(middlewares: Middleware<T>[]): Middleware<T> {
  return (ctx, next) => {
    let index = -1;

    function dispatch(i: number): Promise<ServiceResult<T>> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;

      const fn = i < middlewares.length ? middlewares[i] : next;

      if (!fn) {
        return Promise.reject(new Error("No handler provided"));
      }

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

/**
 * withServerAction - Main entry point for server actions
 *
 * Composes middleware chain in order:
 * withAuth → withRLS → withIdempotency → withAudit → withTracing → handler
 *
 * @param supabase - Supabase client instance
 * @param handler - The actual handler function receiving MiddlewareContext
 * @param options - Configuration options
 * @returns Promise<ServiceResult<T>>
 *
 * @example
 * ```ts
 * const result = await withServerAction(
 *   supabase,
 *   async (ctx) => {
 *     const service = createLoyaltyService(ctx.supabase);
 *     return service.appendLedger(input);
 *   },
 *   {
 *     domain: 'loyalty',
 *     action: 'ledger.append',
 *     requireIdempotency: true,
 *     idempotencyKey: request.headers.get('x-idempotency-key'),
 *   }
 * );
 * ```
 */
export async function withServerAction<T>(
  supabase: SupabaseClient<Database>,
  handler: (ctx: MiddlewareContext) => Promise<ServiceResult<T>>,
  options: ServerActionOptions = {},
): Promise<ServiceResult<T>> {
  const correlationId = options.correlationId ?? randomUUID();
  const startedAt = Date.now();

  const ctx: MiddlewareContext = {
    supabase,
    correlationId,
    startedAt,
    idempotencyKey: options.idempotencyKey,
    endpoint: options.endpoint,
    domain: options.domain,
    action: options.action,
  };

  // Build middleware chain based on options
  // Order: tracing (outermost) → auth → rls → idempotency → audit → handler
  // Tracing wraps everything to catch all errors and add metadata
  const middlewares: Middleware<T>[] = [];

  // Tracing must be first (outermost) to catch all errors
  middlewares.push(withTracing<T>());

  if (!options.skipAuth) {
    middlewares.push(withAuth<T>());
    middlewares.push(withRLS<T>());
  }

  // Add idempotency check (only enforced if requireIdempotency is true)
  middlewares.push(withIdempotency<T>(options.requireIdempotency ?? false));

  middlewares.push(withAudit<T>());

  const chain = compose(middlewares);

  return runWithCorrelation(correlationId, () =>
    chain(ctx, () => handler(ctx)),
  );
}

/**
 * Factory to create a pre-configured withServerAction wrapper
 *
 * Useful for domain-specific actions with consistent config.
 *
 * @example
 * ```ts
 * const withLoyaltyAction = createServerActionWrapper({
 *   domain: 'loyalty',
 *   requireIdempotency: true,
 * });
 *
 * // Later
 * const result = await withLoyaltyAction(supabase, handler, {
 *   action: 'ledger.append',
 * });
 * ```
 */
export function createServerActionWrapper(defaultConfig: ServerActionOptions) {
  return async function <T>(
    supabase: SupabaseClient<Database>,
    handler: (ctx: MiddlewareContext) => Promise<ServiceResult<T>>,
    overrides?: ServerActionOptions,
  ): Promise<ServiceResult<T>> {
    return withServerAction(supabase, handler, {
      ...defaultConfig,
      ...overrides,
    });
  };
}
