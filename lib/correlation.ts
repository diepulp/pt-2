/**
 * Correlation ID Management
 *
 * Provides request-scoped correlation IDs for distributed tracing
 * across server actions, RPCs, and telemetry events.
 *
 * Uses AsyncLocalStorage to maintain correlation context without
 * explicit parameter threading.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

interface CorrelationContext {
  correlationId: string;
  createdAt: Date;
  /** AUTH-HARDENING v0.1 WS6: Set to true after RPC context injection */
  rpcContextInjected?: boolean;
}

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generate a unique correlation ID
 * Format: UUID v4 (RFC 4122 compliant)
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Get the current correlation ID from async context
 *
 * @returns correlation ID if context exists, null otherwise
 */
export function getCorrelationId(): string | null {
  const context = correlationStorage.getStore();
  return context?.correlationId ?? null;
}

/**
 * Set correlation ID in async context
 * Primarily used by withServerAction wrapper
 *
 * Note: Nested requests may legitimately update correlation context.
 * P3 fix (ISSUE-983EFA10): Removed console.warn to reduce log noise.
 *
 * @param correlationId - Correlation ID to store
 */
export function setCorrelationId(correlationId: string): void {
  const newContext: CorrelationContext = {
    correlationId,
    createdAt: new Date(),
  };

  correlationStorage.enterWith(newContext);
}

/**
 * Run callback with correlation context
 *
 * @param correlationId - Correlation ID to use (auto-generated if not provided)
 * @param callback - Async function to execute within correlation context
 * @returns Promise resolving to callback result
 */
export async function runWithCorrelation<T>(
  correlationId: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const id = correlationId ?? generateCorrelationId();
  const context: CorrelationContext = {
    correlationId: id,
    createdAt: new Date(),
  };

  return correlationStorage.run(context, callback);
}

/**
 * Get correlation context metadata
 * Useful for debugging and telemetry
 */
export function getCorrelationContext(): CorrelationContext | null {
  return correlationStorage.getStore() ?? null;
}

/**
 * Mark that RPC context has been injected for this request.
 *
 * AUTH-HARDENING v0.1 WS6: Called by injectRLSContext() after successful
 * RPC call. Used by assertRpcContextInjected() canary.
 */
export function markRpcContextInjected(): void {
  const store = correlationStorage.getStore();
  if (store) {
    store.rpcContextInjected = true;
  }
}

/**
 * Canary assertion: warn if a DB query executes without prior RPC context.
 *
 * AUTH-HARDENING v0.1 WS6: Defensive monitoring for middleware regressions.
 * If the middleware chain is skipped (code regression), write policies (WS5)
 * will hard-fail; SELECT policies will silently use JWT. This canary
 * detects that scenario.
 *
 * @param operation - Description of the DB operation for the log message
 */
export function assertRpcContextInjected(operation?: string): void {
  const store = correlationStorage.getStore();
  // No correlation context = not in a middleware-managed request (e.g., cron job)
  // Only warn when we ARE in a request context but RPC was never called
  if (store && !store.rpcContextInjected) {
    console.error(
      '[RLS CANARY] DB query executed without RPC context — JWT fallback in effect (operation=%s, correlationId=%s)',
      operation ?? 'unknown',
      store.correlationId,
    );
  }
}
