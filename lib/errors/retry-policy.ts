/**
 * Retry Policy with Idempotency
 *
 * Purpose: Implement retry logic with exponential backoff for transient failures
 * while preventing duplicate operations through idempotency checks.
 *
 * Pattern:
 * - Only retry idempotent operations
 * - Use exponential backoff with jitter
 * - Circuit break after max retries
 * - Never retry non-retryable errors (validation, not found, etc.)
 */

import type { DomainErrorCode } from './domain-errors';
import { DomainError } from './domain-errors';

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

// ============================================================================
// RETRY POLICY
// ============================================================================

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  startTime: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  durationMs: number;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs,
  );

  // Add jitter to prevent thundering herd
  const jitter = baseDelay * config.jitterFactor * (Math.random() - 0.5);
  return Math.max(0, baseDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof DomainError) {
    return error.retryable;
  }

  // Network/timeout errors are retryable
  if (error instanceof Error) {
    const retryableMessages = [
      'timeout',
      'network',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'concurrent',
    ];

    return retryableMessages.some((msg) =>
      error.message.toLowerCase().includes(msg.toLowerCase()),
    );
  }

  return false;
}

// ============================================================================
// RETRY WITH IDEMPOTENCY
// ============================================================================

export interface IdempotentOperation<T> {
  execute: () => Promise<T>;
  idempotencyKey: string;
  checkDuplicate?: () => Promise<T | null>;
}

/**
 * Execute an operation with retry policy
 *
 * IMPORTANT: Only use for idempotent operations!
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  const ctx: RetryContext = {
    attempt: 0,
    startTime: Date.now(),
  };

  for (let i = 1; i <= config.maxRetries + 1; i++) {
    ctx.attempt = i;

    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts: ctx.attempt,
        durationMs: Date.now() - ctx.startTime,
      };
    } catch (error) {
      ctx.lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if this is the last attempt
      if (i === config.maxRetries + 1) {
        break;
      }

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        return {
          success: false,
          error: ctx.lastError,
          attempts: ctx.attempt,
          durationMs: Date.now() - ctx.startTime,
        };
      }

      // Wait before retry
      const delay = calculateDelay(i, config);
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: ctx.lastError,
    attempts: ctx.attempt,
    durationMs: Date.now() - ctx.startTime,
  };
}

/**
 * Execute an idempotent operation with duplicate check
 *
 * Pattern:
 * 1. Check if operation already completed (via idempotency key)
 * 2. If yes, return cached result
 * 3. If no, execute with retry
 */
export async function withIdempotentRetry<T>(
  operation: IdempotentOperation<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  const startTime = Date.now();

  // Check for duplicate
  if (operation.checkDuplicate) {
    try {
      const cached = await operation.checkDuplicate();
      if (cached !== null) {
        return {
          success: true,
          data: cached,
          attempts: 0, // No actual execution
          durationMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      // If duplicate check fails, proceed with execution
      // (better to risk retry than fail entirely)
    }
  }

  // Execute with retry
  return withRetry(operation.execute, config);
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  halfOpenMaxAttempts: 3,
};

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private halfOpenAttempts = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        throw new DomainError(
          'INTERNAL_ERROR',
          `Circuit breaker "${this.name}" is open`,
          { httpStatus: 503, retryable: true },
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }

    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// ============================================================================
// RETRY POLICY REGISTRY
// ============================================================================

/**
 * Per-endpoint retry policies
 *
 * Pattern: Configure retry behavior based on operation criticality
 */
export const RETRY_POLICIES: Record<string, RetryConfig> = {
  // High-value financial operations: aggressive retry
  'finance.create-transaction': {
    maxRetries: 5,
    initialDelayMs: 200,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // Loyalty operations: moderate retry
  'loyalty.issue-reward': {
    maxRetries: 3,
    initialDelayMs: 150,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // Read operations: minimal retry
  '*.read': {
    maxRetries: 2,
    initialDelayMs: 50,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // Default for all other operations
  default: DEFAULT_RETRY_CONFIG,
};

export function getRetryPolicy(operationKey: string): RetryConfig {
  return RETRY_POLICIES[operationKey] ?? RETRY_POLICIES.default;
}
