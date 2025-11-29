/**
 * Rate Limiter
 *
 * Purpose: Protect hot paths from excessive load by limiting request rates
 * per actor (user/staff) and per casino.
 *
 * Pattern:
 * - Token bucket algorithm
 * - Multi-level limits (actor, casino, global)
 * - Configurable per-endpoint limits
 */

import { DomainError } from "./domain-errors";

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

export interface RateLimitConfig {
  tokensPerInterval: number;
  intervalMs: number;
  burstSize?: number; // Max tokens that can accumulate (defaults to tokensPerInterval)
}

export interface RateLimitRule {
  perActor?: RateLimitConfig;
  perCasino?: RateLimitConfig;
  global?: RateLimitConfig;
}

// ============================================================================
// TOKEN BUCKET IMPLEMENTATION
// ============================================================================

interface TokenBucket {
  tokens: number;
  lastRefillTime: number;
  capacity: number;
  refillRate: number; // tokens per ms
}

class TokenBucketLimiter {
  private buckets = new Map<string, TokenBucket>();

  constructor(private readonly config: RateLimitConfig) {}

  tryConsume(key: string, tokens = 1): boolean {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  getRemainingTokens(key: string): number {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);
    return Math.floor(bucket.tokens);
  }

  getResetTime(key: string): number {
    const bucket = this.getBucket(key);
    const tokensNeeded = 1 - bucket.tokens;
    if (tokensNeeded <= 0) {
      return 0;
    }
    return Math.ceil(tokensNeeded / bucket.refillRate);
  }

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const burstSize = this.config.burstSize ?? this.config.tokensPerInterval;
      bucket = {
        tokens: burstSize,
        lastRefillTime: Date.now(),
        capacity: burstSize,
        refillRate: this.config.tokensPerInterval / this.config.intervalMs,
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefillTime;
    const tokensToAdd = elapsedMs * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillTime = now;
  }

  // Cleanup old buckets (call periodically)
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.intervalMs * 10; // Keep buckets for 10 intervals

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefillTime > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export class RateLimiter {
  private limiters = new Map<string, TokenBucketLimiter>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly rules: Map<string, RateLimitRule>) {
    // Periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  async checkLimit(
    endpoint: string,
    context: {
      actorId?: string;
      casinoId?: string;
    },
  ): Promise<void> {
    const rule = this.rules.get(endpoint);
    if (!rule) {
      return; // No rate limit for this endpoint
    }

    // Check actor limit
    if (rule.perActor && context.actorId) {
      const limiter = this.getLimiter(`${endpoint}:actor`, rule.perActor);
      if (!limiter.tryConsume(context.actorId)) {
        const resetMs = limiter.getResetTime(context.actorId);
        throw new DomainError(
          "RATE_LIMIT_EXCEEDED",
          "Rate limit exceeded for user",
          {
            httpStatus: 429,
            retryable: true,
            details: {
              limit: "per_actor",
              resetInMs: resetMs,
            },
          },
        );
      }
    }

    // Check casino limit
    if (rule.perCasino && context.casinoId) {
      const limiter = this.getLimiter(`${endpoint}:casino`, rule.perCasino);
      if (!limiter.tryConsume(context.casinoId)) {
        const resetMs = limiter.getResetTime(context.casinoId);
        throw new DomainError(
          "RATE_LIMIT_EXCEEDED",
          "Rate limit exceeded for casino",
          {
            httpStatus: 429,
            retryable: true,
            details: {
              limit: "per_casino",
              resetInMs: resetMs,
            },
          },
        );
      }
    }

    // Check global limit
    if (rule.global) {
      const limiter = this.getLimiter(`${endpoint}:global`, rule.global);
      if (!limiter.tryConsume("global")) {
        const resetMs = limiter.getResetTime("global");
        throw new DomainError(
          "RATE_LIMIT_EXCEEDED",
          "Global rate limit exceeded",
          {
            httpStatus: 429,
            retryable: true,
            details: {
              limit: "global",
              resetInMs: resetMs,
            },
          },
        );
      }
    }
  }

  getRateLimitInfo(
    endpoint: string,
    context: {
      actorId?: string;
      casinoId?: string;
    },
  ) {
    const rule = this.rules.get(endpoint);
    if (!rule) {
      return null;
    }

    const info: {
      perActor?: { remaining: number; resetInMs: number };
      perCasino?: { remaining: number; resetInMs: number };
      global?: { remaining: number; resetInMs: number };
    } = {};

    if (rule.perActor && context.actorId) {
      const limiter = this.getLimiter(`${endpoint}:actor`, rule.perActor);
      info.perActor = {
        remaining: limiter.getRemainingTokens(context.actorId),
        resetInMs: limiter.getResetTime(context.actorId),
      };
    }

    if (rule.perCasino && context.casinoId) {
      const limiter = this.getLimiter(`${endpoint}:casino`, rule.perCasino);
      info.perCasino = {
        remaining: limiter.getRemainingTokens(context.casinoId),
        resetInMs: limiter.getResetTime(context.casinoId),
      };
    }

    if (rule.global) {
      const limiter = this.getLimiter(`${endpoint}:global`, rule.global);
      info.global = {
        remaining: limiter.getRemainingTokens("global"),
        resetInMs: limiter.getResetTime("global"),
      };
    }

    return info;
  }

  private getLimiter(key: string, config: RateLimitConfig): TokenBucketLimiter {
    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = new TokenBucketLimiter(config);
      this.limiters.set(key, limiter);
    }
    return limiter;
  }

  private cleanup(): void {
    for (const limiter of this.limiters.values()) {
      limiter.cleanup();
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// DEFAULT RATE LIMIT RULES
// ============================================================================

export const DEFAULT_RATE_LIMITS = new Map<string, RateLimitRule>([
  // High-value mutations: strict limits
  [
    "finance.create-transaction",
    {
      perActor: {
        tokensPerInterval: 10,
        intervalMs: 60000, // 10 per minute per user
      },
      perCasino: {
        tokensPerInterval: 100,
        intervalMs: 60000, // 100 per minute per casino
      },
    },
  ],
  [
    "loyalty.issue-reward",
    {
      perActor: {
        tokensPerInterval: 20,
        intervalMs: 60000, // 20 per minute per user
      },
      perCasino: {
        tokensPerInterval: 200,
        intervalMs: 60000, // 200 per minute per casino
      },
    },
  ],

  // MTL operations: moderate limits
  [
    "mtl.create-entry",
    {
      perActor: {
        tokensPerInterval: 30,
        intervalMs: 60000,
      },
      perCasino: {
        tokensPerInterval: 500,
        intervalMs: 60000,
      },
    },
  ],

  // Visit operations: generous limits
  [
    "visit.check-in",
    {
      perCasino: {
        tokensPerInterval: 1000,
        intervalMs: 60000, // 1000 per minute per casino
      },
    },
  ],

  // Read operations: very generous limits
  [
    "*.read",
    {
      perActor: {
        tokensPerInterval: 100,
        intervalMs: 60000, // 100 per minute per user
      },
      perCasino: {
        tokensPerInterval: 5000,
        intervalMs: 60000, // 5000 per minute per casino
      },
    },
  ],
]);

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(DEFAULT_RATE_LIMITS);
  }
  return rateLimiterInstance;
}

export function setRateLimiter(limiter: RateLimiter): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.destroy();
  }
  rateLimiterInstance = limiter;
}
