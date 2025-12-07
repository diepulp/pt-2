import { DomainError } from '@/lib/errors/domain-errors';

import type { Middleware, MiddlewareContext } from './types';

/**
 * Idempotency Key Enforcement Middleware
 *
 * Validates presence of x-idempotency-key header for mutations.
 *
 * Pattern:
 * 1. Route Handler extracts header and passes via ctx.idempotencyKey
 * 2. This middleware validates presence when required
 * 3. Service stores key in domain table (e.g., loyalty_ledger.idempotency_key)
 * 4. Database enforces uniqueness via partial unique index
 *
 * @param required - Whether idempotency key is required (default: true)
 * @throws DomainError VALIDATION_ERROR - If required key is missing
 */
export function withIdempotency<T>(required: boolean = true): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    if (required && !ctx.idempotencyKey) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Missing required x-idempotency-key header for mutation',
        { details: { header: 'x-idempotency-key', required: true } },
      );
    }

    return next();
  };
}
