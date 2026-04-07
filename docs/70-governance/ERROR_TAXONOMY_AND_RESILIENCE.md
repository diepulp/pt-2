# Error Taxonomy & Resilience Framework

**Status**: MANDATORY (Enforced at edge layer and render layer)
**Effective**: 2025-11-09 | **Last amended**: 2026-04-06
**Purpose**: Prevent Postgres errors from leaking to UI, guarantee JSON-serializable error payloads, implement retry policies, protect hot paths with rate limiting, and handle render-layer errors via error boundaries

---

## TL;DR

**❌ BANNED:**
```typescript
// Raw Error object stored as details (causes cyclic JSON serialization crash)
throw new DomainError('INTERNAL_ERROR', error.message, { details: error }); // ❌

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
// Safe error details extraction (INV-ERR-DETAILS)
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
throw new DomainError('INTERNAL_ERROR', error.message, { details: safeErrorDetails(error) });

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

---

### INV-ERR-DETAILS: Error Details Must Be JSON-Serializable

**Status**: MANDATORY | **Effective**: 2026-04-06 | **Enforced by**: `safeDetails()` boundary guard + ESLint rule `error-safety/no-unsafe-error-details` + code review

#### Incident / Motivation

On 2026-04-06, entitlement reward issuance began crashing with `TypeError: cyclic object value` instead of returning the intended `CATALOG_CONFIG_INVALID` domain error. Root cause: raw Supabase `PostgrestError` objects stored in `DomainError.details` contained circular references through internal client/request/response refs. When `NextResponse.json()` called `JSON.stringify()`, the serialization crashed, masking the actual business error and making debugging impossible for operators.

The initial fix (commit `0af9114`) sanitized error details at the service layer (call sites) but missed the **transport boundary** — the server-action wrappers and several API routes that serialized `result.details` without sanitization. This gap proved that call-site discipline alone is insufficient; the boundary guard must live in the transport wrappers themselves.

See `docs/issues/cyclic-error/fix-gap.md` for the full post-incident analysis.

#### Rule 1: Serializable — no circular references

The `details` field of `DomainError` and `ServiceResult` **MUST** be JSON-serializable. Raw `Error` objects, Supabase client objects, or any value containing circular references **MUST NOT** be stored in `details`.

```typescript
// ❌ BANNED — raw Error objects have circular references
throw new DomainError('INTERNAL_ERROR', error.message, { details: error });

// ✅ REQUIRED — extract only serializable properties
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
throw new DomainError('INTERNAL_ERROR', error.message, { details: safeErrorDetails(error) });

// ✅ ALSO OK — manual extraction of known primitive fields
throw new DomainError('INTERNAL_ERROR', error.message, {
  details: { code: error.code, message: error.message },
});
```

#### Rule 2: Safe to expose — no internal leakage

Serializable does not mean safe to expose. A payload that survives `JSON.stringify()` can still leak internal infrastructure details (stack traces, Postgres error codes, connection strings, table names) to the client. The two concerns are distinct:

| Concern | Guard | Responsibility |
|---------|-------|----------------|
| **Serializable** (no circular refs) | `safeDetails()` / `safeErrorDetails()` | Prevent `JSON.stringify` crash |
| **Safe to expose** (no internals) | `mapDatabaseError()` + domain error catalog | Prevent infrastructure leakage to UI |

Service-layer `mapDatabaseError()` functions translate raw Postgres/PostgREST errors into domain codes (`23505` → `UNIQUE_VIOLATION`). The `details` field in client-facing responses should contain only business-relevant context (retry timing, field names, validation messages), never raw database error output.

#### Defense in depth (4 layers)

| Layer | File | Responsibility |
|-------|------|----------------|
| Source | Service `mapDatabaseError()` functions | Use `safeErrorDetails()` when wrapping errors |
| Central | `lib/server-actions/error-map.ts` | Sanitizes all error paths via `safeErrorDetails()` |
| Transport | `tracing.ts`, `with-server-action-wrapper.ts` | `safeDetails()` on every `result.details` before returning |
| Boundary | `lib/http/service-response.ts` | `safeDetails()` guard in `baseResult()` and `errorResponse()` catches any remaining cyclic refs |

**Canonical utility**: `lib/errors/safe-error-details.ts` — extracts `{ message, name, code, hint, details }` (primitives only) from Error objects.

**Static enforcement**: ESLint rule `error-safety/no-unsafe-error-details` flags any `details:` assignment using a bare variable or member-expression that isn't wrapped in `safeErrorDetails()` / `safeDetails()` or isn't an inline literal object. Suppressions require an `eslint-disable` comment explaining the safety justification.

#### Required test invariant

Every response-envelope code path (route handlers, server actions, middleware) must survive `JSON.stringify()` when `details` originates from a raw caught error. Integration tests that exercise error paths should assert:

```typescript
// The response must be valid JSON — no cyclic object crash
const res = await fetch('/api/v1/loyalty/issue', { ... });
const body = await res.json(); // Must not throw
expect(body.ok).toBe(false);
expect(body.code).toBeDefined();
```

If a new transport path is added (WebSocket, SSE, server action), it must include `safeDetails()` at its serialization boundary before shipping.

---

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
  // Already a domain error — preserve it.
  // details pass through here but are sanitized at the transport boundary
  // (tracing.ts, with-server-action-wrapper.ts, errorResponse) via safeDetails().
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
      details: error.details, // transport boundary applies safeDetails()
    };
  }

  // Map Postgres errors — extract only safe primitives
  if (error && typeof error === 'object') {
    const code = Reflect.get(error, 'code');
    const rawDetails = Reflect.get(error, 'details');
    const details =
      typeof rawDetails === 'string' || typeof rawDetails === 'number'
        ? rawDetails
        : safeErrorDetails(rawDetails);

    if (typeof code === 'string' && PG_ERROR_CODE_MAP[code]) {
      const domainCode = PG_ERROR_CODE_MAP[code];
      return { code: domainCode, message: 'Database constraint violated',
               httpStatus: 400, retryable: false, details };
    }
  }

  // Fallback to INTERNAL_ERROR
  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred',
           httpStatus: 500, retryable: false,
           details: safeErrorDetails(error) };
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
- [ ] Error-path integration tests assert `res.json()` succeeds (no cyclic crash)
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

## 5. Render-Layer Error Handling (ADR-032)

Errors that escape the `ServiceResult<T>` pipeline and occur during React rendering are a distinct error class not covered by the service/transport/client layers above. These include:

| Error Type | Example | Without Boundaries |
|------------|---------|-------------------|
| Null dereference in render | `player.name` when `player` is `undefined` | White screen |
| Malformed data in JSX | Array method on non-array query result | White screen |
| Browser API failure | `navigator.clipboard.writeText` throws | Unhandled rejection |
| Zustand selector crash | Store shape changes, selector throws | White screen |
| Component lifecycle error | `useEffect` cleanup throws | White screen |

**Solution**: Three-tier React Error Boundary hierarchy (ADR-032):

1. **Tier 1 — `error.tsx`** (route segment): Last-resort full-page recovery
2. **Tier 2 — `PanelErrorBoundary`** (layout panels): Per-panel isolation with inline retry
3. **Tier 3 — `QueryErrorResetBoundary`** (data subtrees): TanStack Query integration for failed query retry

**Key constraint**: Error boundaries use the same `logError()`, `getErrorMessage()`, `isRetryableError()`, and `isAuthError()` utilities defined in `lib/errors/error-utils.ts`. No parallel utility creation.

**ADR**: `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md`
**Components**: `components/error-boundary/error-state.tsx`, `components/error-boundary/panel-error-boundary.tsx`

---

## Amendment Log

| Date | Change | Trigger |
|------|--------|---------|
| 2025-11-09 | Initial framework: domain errors, retry, rate limiting, circuit breaker | Architecture review |
| 2026-02-02 | Added render-layer error boundaries (ADR-032) | White-screen incidents |
| 2026-04-06 | **INV-ERR-DETAILS**: serialization safety invariant, `safeErrorDetails()` canonical utility, 4-layer defense-in-depth, ESLint rule `error-safety/no-unsafe-error-details`, Rule 2 (serializable vs safe-to-expose distinction), required test invariant, `mapDatabaseError()` example updated to show sanitized passthrough | Cyclic object value crash during entitlement issuance (`docs/issues/cyclic-error/`) |

---

## References

- **Domain Errors**: `lib/errors/domain-errors.ts`
- **Safe Error Details**: `lib/errors/safe-error-details.ts`
- **Error Mapping**: `lib/server-actions/error-map.ts`
- **Retry Policy**: `lib/errors/retry-policy.ts`
- **Rate Limiter**: `lib/errors/rate-limiter.ts`
- **Server Action Wrapper**: `lib/server-actions/with-server-action-wrapper.ts`
- **Tracing Middleware**: `lib/server-actions/middleware/tracing.ts`
- **HTTP Service Response**: `lib/http/service-response.ts`
- **ESLint Rule**: `.eslint-rules/no-unsafe-error-details.js`
- **Incident Analysis**: `docs/issues/cyclic-error/fix-gap.md`
- **SRM Error Taxonomy**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Error Handling Standard**: `docs/70-governance/ERROR_HANDLING_STANDARD.md`
- **Error Boundary ADR**: `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md`
- **Error Handling Layers ADR**: `docs/80-adrs/ADR-012-error-handling-layers.md`
