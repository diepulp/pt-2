/**
 * In-Memory Rate Limiter
 *
 * Provides simple rate limiting for manual reward operations.
 * Uses Map-based storage with TTL cleanup.
 *
 * Production Note:
 * This is a basic in-memory implementation suitable for single-instance
 * deployments. For multi-instance/distributed systems, replace with
 * Redis-backed rate limiting (e.g., ioredis + rate-limiter-flexible).
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitOptions {
  max: number; // Maximum requests per window
  window: number; // Window duration in milliseconds
}

// In-memory storage for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (run every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Check if request should be rate limited
 *
 * @param key - Rate limit key (typically staff_id)
 * @param options - Rate limit configuration
 * @returns true if rate limit exceeded, false if allowed
 *
 * @example
 * const isLimited = checkRateLimit('staff-123', {
 *   max: 10,
 *   window: 60000 // 60 seconds
 * });
 *
 * if (isLimited) {
 *   throw new Error('Rate limit exceeded');
 * }
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No existing entry - allow and create new
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    });
    return false; // Not rate limited
  }

  // Check if window has expired
  const windowElapsed = now - entry.windowStart;
  if (windowElapsed > options.window) {
    // Window expired - reset counter
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    });
    return false; // Not rate limited
  }

  // Within active window - check limit
  if (entry.count >= options.max) {
    return true; // Rate limited
  }

  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);
  return false; // Not rate limited
}

/**
 * Get current rate limit status for a key
 *
 * @param key - Rate limit key
 * @param options - Rate limit configuration
 * @returns Object with remaining requests and reset time
 */
export function getRateLimitStatus(
  key: string,
  options: RateLimitOptions,
): {
  remaining: number;
  resetAt: Date | null;
  isLimited: boolean;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      remaining: options.max,
      resetAt: null,
      isLimited: false,
    };
  }

  const windowElapsed = now - entry.windowStart;
  if (windowElapsed > options.window) {
    // Window expired
    return {
      remaining: options.max,
      resetAt: null,
      isLimited: false,
    };
  }

  const remaining = Math.max(0, options.max - entry.count);
  const resetAt = new Date(entry.windowStart + options.window);

  return {
    remaining,
    resetAt,
    isLimited: remaining === 0,
  };
}

/**
 * Reset rate limit for a specific key
 * Useful for testing or manual overrides
 *
 * @param key - Rate limit key to reset
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clean up expired rate limit entries
 * Called periodically to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [key, entry] of rateLimitStore.entries()) {
    const age = now - entry.windowStart;
    if (age > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

// Start periodic cleanup
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
}
