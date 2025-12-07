import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult } from '@/lib/http/service-response';
import type { RLSContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

/**
 * Context passed through middleware chain
 *
 * Each middleware can read and modify this context.
 * Properties are populated progressively as the chain executes.
 */
export interface MiddlewareContext {
  /** Supabase client for database operations */
  supabase: SupabaseClient<Database>;

  /** Unique request identifier (UUID v4) */
  correlationId: string;

  /** Request start timestamp (ms since epoch) */
  startedAt: number;

  /** RLS context (populated by withAuth middleware) */
  rlsContext?: RLSContext;

  /** Idempotency key from x-idempotency-key header */
  idempotencyKey?: string;

  /** Endpoint identifier for rate limiting and audit */
  endpoint?: string;

  /** Domain for audit logging (e.g., 'loyalty', 'player') */
  domain?: string;

  /** Action name for audit logging (e.g., 'ledger.append') */
  action?: string;
}

/**
 * Middleware function signature
 *
 * Each middleware is a pure function that:
 * 1. Receives context and a next() function
 * 2. Can modify context before calling next()
 * 3. Can short-circuit by returning early (not calling next())
 * 4. Can transform result after calling next()
 *
 * @template T - The data type of the ServiceResult
 */
export type Middleware<T> = (
  ctx: MiddlewareContext,
  next: () => Promise<ServiceResult<T>>,
) => Promise<ServiceResult<T>>;

/**
 * Configuration for withServerAction compositor
 */
export interface ServerActionConfig {
  /** Endpoint identifier for rate limiting */
  endpoint?: string;

  /** Domain for audit logging */
  domain?: string;

  /** Action name for audit logging */
  action?: string;

  /** Require idempotency key for this action (default: false) */
  requireIdempotency?: boolean;

  /** Skip auth middleware (internal use only - e.g., health checks) */
  skipAuth?: boolean;
}

/**
 * Extended config with runtime options
 */
export interface ServerActionOptions extends ServerActionConfig {
  /** Override correlation ID (default: auto-generated UUID) */
  correlationId?: string;

  /** Idempotency key extracted from request header */
  idempotencyKey?: string;
}
