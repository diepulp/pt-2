/**
 * Correlation ID Management
 *
 * Provides request-scoped correlation IDs for distributed tracing
 * across server actions, RPCs, and telemetry events.
 *
 * Uses AsyncLocalStorage to maintain correlation context without
 * explicit parameter threading.
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

interface CorrelationContext {
  correlationId: string;
  createdAt: Date;
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
 * @param correlationId - Correlation ID to store
 */
export function setCorrelationId(correlationId: string): void {
  const currentContext = correlationStorage.getStore();
  if (currentContext) {
    // Warn if overwriting existing correlation ID
    if (currentContext.correlationId !== correlationId) {
      console.warn(
        `[correlation] Overwriting existing correlation ID: ${currentContext.correlationId} -> ${correlationId}`,
      );
    }
  }

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
