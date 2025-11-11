# Error Taxonomy & Resilience Framework

**Status**: MANDATORY (Enforced at edge layer)
**Effective**: 2025-11-09
**Purpose**: Prevent Postgres errors from leaking to UI, implement retry policies, and protect hot paths with rate limiting

---

## TL;DR

**❌ BANNED:**
```typescript
// Postgres error leaking to UI
catch (error) {
  return { error: '23505: duplicate key violation' }; // ❌
}

// Uncontrolled retries causing duplicates
for (let i = 0; i < 3; i++) {
  await createTransaction(); // ❌ No idempotency!
}
```

**✅ REQUIRED:**
```typescript
// Domain errors with business context
throw new DomainError('REWARD_ALREADY_ISSUED', 'Reward has already been issued');

// Idempotent retry with backoff
await withIdempotentRetry({
  execute: () => createTransaction(data),
  idempotencyKey: requestId,
  checkDuplicate: () => findExisting(requestId),
});

// Rate limiting at edge
await withServerAction(handler, {
  endpoint: 'loyalty.issue-reward',
  actorId: staffId,
  casinoId,
});
```

---

## Problem Statement

### Pitfalls (Current State)

1. **UI couples to Postgres codes**: Error messages expose database implementation details
   - User sees: `"error": "23505: duplicate key violation"`
   - Should see: `"error": "REWARD_ALREADY_ISSUED"`

2. **Retries cause duplicates**: No idempotency enforcement leads to double-spend
   - Retry without idempotency key → duplicate financial transaction
   - User charged twice for the same operation

3. **User-visible 500s**: Generic errors don't provide actionable feedback
   - All errors return HTTP 500
   - No distinction between client errors (400) and server errors (500)

---

## Solution Architecture

### 1. Domain Error Catalog

Define business-level error codes that hide infrastructure details:

```typescript
// lib/errors/domain-errors.ts

export type LoyaltyErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'REWARD_ALREADY_ISSUED'
  | 'LOYALTY_ACCOUNT_NOT_FOUND'
  | 'LOYALTY_TIER_INVALID'
  | 'LOYALTY_REDEMPTION_FAILED'
  | 'LOYALTY_POINTS_NEGATIVE'
  | 'LOYALTY_POLICY_VIOLATION';

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(
    code: DomainErrorCode,
    message?: string,
    options?: {
      httpStatus?: number;
      retryable?: boolean;
      details?: unknown;
    },
  ) {
    super(message ?? DomainError.getDefaultMessage(code));
    this.httpStatus = options?.httpStatus ?? this.getDefaultHttpStatus(code);
    this.retryable = options?.retryable ?? this.isRetryable(code);
    this.details = options?.details;
  }
}
```

**Usage in Service Layer:**

```typescript
// services/loyalty/mid-session-reward.ts

export async function issueMidSessionReward(input: IssueMidSessionRewardInput) {
  const { ratingSlipId, playerId, casinoId, points } = input;

  // Check if rating slip is open
  const slip = await getRatingSlip(ratingSlipId);
  if (!slip) {
    throw new DomainError('RATING_SLIP_NOT_FOUND');
  }
  if (slip.status !== 'open') {
    throw new DomainError('RATING_SLIP_NOT_OPEN',
      'Rating slip must be in open state to issue rewards');
  }

  // Check for duplicate issuance
  const existing = await checkExistingReward(input.idempotencyKey);
  if (existing) {
    throw new DomainError('REWARD_ALREADY_ISSUED',
      'A reward has already been issued for this rating slip');
  }

  // Proceed with reward issuance...
}
```

---

### 2. Error Mapping Layer

Map infrastructure errors (Postgres, PostgREST) to domain errors:

```typescript
// lib/server-actions/error-map.ts

const PG_ERROR_CODE_MAP: Record<string, DomainErrorCode> = {
  '23502': 'VALIDATION_ERROR',
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23505': 'UNIQUE_VIOLATION',        // Duplicate key
  '23514': 'VALIDATION_ERROR',
  '40001': 'VISIT_CONCURRENT_MODIFICATION', // Serialization failure
  '40P01': 'VISIT_CONCURRENT_MODIFICATION', // Deadlock
};

export function mapDatabaseError(error: unknown): MappedError {
  // Already a domain error - preserve it
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
      details: error.details,
    };
  }

  // Map Postgres errors
  if (error && typeof error === 'object') {
    const code = Reflect.get(error, 'code');
    if (typeof code === 'string' && PG_ERROR_CODE_MAP[code]) {
      const domainCode = PG_ERROR_CODE_MAP[code];
      return new DomainError(domainCode, 'Database constraint violated');
    }
  }

  // Fallback to INTERNAL_ERROR
  return new DomainError('INTERNAL_ERROR', 'An unexpected error occurred');
}
```

---

### 3. Retry Policy with Idempotency

Only retry operations that are safe to retry (idempotent):

```typescript
// lib/errors/retry-policy.ts

export interface IdempotentOperation<T> {
  execute: () => Promise<T>;
  idempotencyKey: string;
  checkDuplicate?: () => Promise<T | null>;
}

export async function withIdempotentRetry<T>(
  operation: IdempotentOperation<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  // 1. Check for duplicate execution
  if (operation.checkDuplicate) {
    const cached = await operation.checkDuplicate();
    if (cached !== null) {
      return {
        success: true,
        data: cached,
        attempts: 0, // No actual execution
        durationMs: 0,
      };
    }
  }

  // 2. Execute with exponential backoff
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      const data = await operation.execute();
      return { success: true, data, attempts: attempt };
    } catch (error) {
      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Last attempt - rethrow
      if (attempt === config.maxRetries + 1) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }
}
```

**Usage Example:**

```typescript
// app/actions/loyalty.ts

export async function issueRewardAction(input: IssueMidSessionRewardInput) {
  return withIdempotentRetry({
    execute: async () => {
      return supabase.rpc('rpc_issue_mid_session_reward', {
        p_casino_id: input.casinoId,
        p_player_id: input.playerId,
        p_rating_slip_id: input.ratingSlipId,
        p_staff_id: input.staffId,
        p_points: input.points,
        p_idempotency_key: input.idempotencyKey,
      });
    },
    idempotencyKey: input.idempotencyKey,
    checkDuplicate: async () => {
      // Query loyalty_ledger for existing entry with same idempotency key
      const { data } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('idempotency_key', input.idempotencyKey)
        .eq('casino_id', input.casinoId)
        .single();
      return data;
    },
  });
}
```

---

### 4. Rate Limiting

Protect hot paths from abuse:

```typescript
// lib/errors/rate-limiter.ts

export const DEFAULT_RATE_LIMITS = new Map<string, RateLimitRule>([
  // Finance: strict limits
  ['finance.create-transaction', {
    perActor: {
      tokensPerInterval: 10,
      intervalMs: 60000, // 10 per minute per user
    },
    perCasino: {
      tokensPerInterval: 100,
      intervalMs: 60000, // 100 per minute per casino
    },
  }],

  // Loyalty: moderate limits
  ['loyalty.issue-reward', {
    perActor: {
      tokensPerInterval: 20,
      intervalMs: 60000,
    },
    perCasino: {
      tokensPerInterval: 200,
      intervalMs: 60000,
    },
  }],

  // Visit: generous limits
  ['visit.check-in', {
    perCasino: {
      tokensPerInterval: 1000,
      intervalMs: 60000,
    },
  }],
]);
```

**Integration with withServerAction:**

```typescript
// lib/server-actions/with-server-action-wrapper.ts

export async function withServerAction<T>(
  handler: ServerActionHandler<T>,
  context: ServerActionContext & {
    endpoint?: string;
    actorId?: string;
    casinoId?: string;
  },
): Promise<ServiceResult<T>> {
  // Rate limiting check
  if (context.endpoint) {
    const rateLimiter = getRateLimiter();
    await rateLimiter.checkLimit(context.endpoint, {
      actorId: context.actorId,
      casinoId: context.casinoId,
    });
  }

  // Execute handler...
}
```

**Usage in Server Actions:**

```typescript
// app/actions/loyalty.ts

export async function issueRewardServerAction(input: IssueMidSessionRewardInput) {
  return withServerAction(
    () => issueMidSessionReward(input),
    {
      supabase: getSupabaseClient(),
      endpoint: 'loyalty.issue-reward',
      actorId: input.staffId,
      casinoId: input.casinoId,
      domain: 'loyalty',
      operation: 'issue_mid_session_reward',
      requestId: input.idempotencyKey,
    },
  );
}
```

---

## Domain Error Codes by Service

### Visit Domain

```typescript
export type VisitErrorCode =
  | 'VISIT_NOT_FOUND'
  | 'VISIT_NOT_OPEN'
  | 'VISIT_ALREADY_CLOSED'
  | 'VISIT_PLAYER_MISMATCH'
  | 'VISIT_CASINO_MISMATCH'
  | 'VISIT_CONCURRENT_MODIFICATION';
```

### Loyalty Domain

```typescript
export type LoyaltyErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'REWARD_ALREADY_ISSUED'
  | 'LOYALTY_ACCOUNT_NOT_FOUND'
  | 'LOYALTY_TIER_INVALID'
  | 'LOYALTY_REDEMPTION_FAILED'
  | 'LOYALTY_POINTS_NEGATIVE'
  | 'LOYALTY_POLICY_VIOLATION';
```

### Rating Slip Domain

```typescript
export type RatingSlipErrorCode =
  | 'RATING_SLIP_NOT_FOUND'
  | 'RATING_SLIP_NOT_OPEN'
  | 'RATING_SLIP_ALREADY_CLOSED'
  | 'RATING_SLIP_INVALID_STATE'
  | 'RATING_SLIP_MISSING_REQUIRED_DATA'
  | 'RATING_SLIP_CONCURRENT_UPDATE';
```

### Finance Domain

```typescript
export type FinanceErrorCode =
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_ALREADY_PROCESSED'
  | 'TRANSACTION_AMOUNT_INVALID'
  | 'TRANSACTION_INSUFFICIENT_FUNDS'
  | 'TRANSACTION_CANCELLED'
  | 'TRANSACTION_VOIDED'
  | 'GAMING_DAY_MISMATCH';
```

### MTL Domain

```typescript
export type MTLErrorCode =
  | 'MTL_ENTRY_NOT_FOUND'
  | 'MTL_THRESHOLD_EXCEEDED'
  | 'MTL_WATCHLIST_HIT'
  | 'MTL_CTR_REQUIRED'
  | 'MTL_IMMUTABLE_ENTRY'
  | 'MTL_MISSING_COMPLIANCE_DATA';
```

### Table Context Domain

```typescript
export type TableContextErrorCode =
  | 'TABLE_NOT_FOUND'
  | 'TABLE_NOT_ACTIVE'
  | 'TABLE_ALREADY_ACTIVE'
  | 'TABLE_OCCUPIED'
  | 'TABLE_DEALER_CONFLICT'
  | 'TABLE_SETTINGS_INVALID'
  | 'TABLE_FILL_REJECTED'
  | 'TABLE_CREDIT_REJECTED';
```

### Player Domain

```typescript
export type PlayerErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_ALREADY_EXISTS'
  | 'PLAYER_NOT_ENROLLED'
  | 'PLAYER_ENROLLMENT_DUPLICATE'
  | 'PLAYER_SUSPENDED'
  | 'PLAYER_SELF_EXCLUDED';
```

### Casino Domain

```typescript
export type CasinoErrorCode =
  | 'CASINO_NOT_FOUND'
  | 'CASINO_SETTINGS_NOT_FOUND'
  | 'CASINO_INACTIVE'
  | 'STAFF_NOT_FOUND'
  | 'STAFF_UNAUTHORIZED'
  | 'STAFF_CASINO_MISMATCH';
```

### Floor Layout Domain

```typescript
export type FloorLayoutErrorCode =
  | 'LAYOUT_NOT_FOUND'
  | 'LAYOUT_VERSION_NOT_FOUND'
  | 'LAYOUT_NOT_APPROVED'
  | 'LAYOUT_ALREADY_ACTIVE'
  | 'LAYOUT_IMMUTABLE'
  | 'LAYOUT_VALIDATION_FAILED';
```

---

## HTTP Status Mapping

Domain errors automatically map to appropriate HTTP status codes:

| Pattern | HTTP Status | Retryable |
|---------|-------------|-----------|
| `*_NOT_FOUND` | 404 | No |
| `*_INVALID`, `*_MISSING`, `*_MISMATCH` | 400 | No |
| `*_ALREADY_*`, `*_DUPLICATE`, `*_CONCURRENT_*` | 409 | Yes (concurrent only) |
| `INSUFFICIENT_*`, `*_EXCEEDED`, `*_VIOLATION`, `*_REJECTED` | 422 | No |
| `UNAUTHORIZED` | 401 | No |
| `FORBIDDEN`, `*_UNAUTHORIZED` | 403 | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes |
| `INTERNAL_ERROR` | 500 | Yes |

---

## Retry Policies by Operation

```typescript
export const RETRY_POLICIES: Record<string, RetryConfig> = {
  // High-value financial: aggressive retry
  'finance.create-transaction': {
    maxRetries: 5,
    initialDelayMs: 200,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // Loyalty: moderate retry
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

  // Default
  default: {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },
};
```

---

## Circuit Breaker

For noisy endpoints that repeatedly fail:

```typescript
const circuitBreaker = new CircuitBreaker('finance.create-transaction', {
  failureThreshold: 5,       // Open after 5 failures
  resetTimeoutMs: 60000,     // Try again after 1 minute
  halfOpenMaxAttempts: 3,    // Require 3 successes to close
});

await circuitBreaker.execute(async () => {
  return createTransaction(data);
});
```

**Circuit States:**
- **CLOSED**: Normal operation
- **OPEN**: All requests fail fast (503)
- **HALF_OPEN**: Testing if service recovered

---

## Implementation Checklist

### Service Layer (REQUIRED)

- [ ] Import `DomainError` from `@/lib/errors/domain-errors`
- [ ] Throw domain-specific errors instead of generic errors
- [ ] Document error codes in service's `README.md`
- [ ] Add error scenarios to integration tests

### Edge Layer (Server Actions)

- [ ] Use `withServerAction` wrapper for all mutations
- [ ] Provide `endpoint` for rate limiting
- [ ] Provide `actorId` and `casinoId` for multi-level limits
- [ ] Supply `idempotencyKey` from request headers

### Database Layer

- [ ] Idempotency columns (`idempotency_key`) on mutation tables
- [ ] Partial unique indexes: `(casino_id, idempotency_key) where idempotency_key is not null`
- [ ] RPC functions check for duplicates before insert

### Testing

- [ ] Unit tests for error mapping
- [ ] Integration tests for retry logic
- [ ] Load tests for rate limiting
- [ ] Chaos tests for circuit breaker

---

## Anti-Patterns

### ❌ DON'T: Expose Postgres errors to UI

```typescript
// ❌ BAD
catch (error) {
  return { error: error.message }; // "23505: duplicate key..."
}
```

### ✅ DO: Map to domain errors

```typescript
// ✅ GOOD
catch (error) {
  if (error.code === '23505') {
    throw new DomainError('REWARD_ALREADY_ISSUED');
  }
  throw new DomainError('INTERNAL_ERROR');
}
```

### ❌ DON'T: Retry without idempotency

```typescript
// ❌ BAD
for (let i = 0; i < 3; i++) {
  try {
    return await createTransaction(data);
  } catch (error) {
    // Retry → duplicate transaction!
  }
}
```

### ✅ DO: Use idempotent retry

```typescript
// ✅ GOOD
return withIdempotentRetry({
  execute: () => createTransaction(data),
  idempotencyKey: requestId,
  checkDuplicate: () => findExisting(requestId),
});
```

### ❌ DON'T: Return all errors as HTTP 500

```typescript
// ❌ BAD
catch (error) {
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
```

### ✅ DO: Use appropriate HTTP status codes

```typescript
// ✅ GOOD
catch (error) {
  const domainError = toDomainError(error);
  return NextResponse.json(
    { error: domainError.message, code: domainError.code },
    { status: domainError.httpStatus }
  );
}
```

---

## References

- **Domain Errors**: `lib/errors/domain-errors.ts`
- **Error Mapping**: `lib/server-actions/error-map.ts`
- **Retry Policy**: `lib/errors/retry-policy.ts`
- **Rate Limiter**: `lib/errors/rate-limiter.ts`
- **Server Action Wrapper**: `lib/server-actions/with-server-action-wrapper.ts`
- **SRM Error Taxonomy**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

---

**Effective Date**: 2025-11-09
**Enforcement**: Mandatory for all edge layer operations
**Migration**: Existing services must adopt domain errors in Sprint 2
