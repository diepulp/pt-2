# WORKFLOW-WS1 — Middleware Architecture Implementation

**Workstream:** WS1 (Middleware Architecture)
**Priority:** P0 (Blocking)
**Parallel Execution:** Yes - Tasks 1-6 can run in parallel after types.ts
**Estimated LOC:** ~345

---

## Prerequisites

Before starting, ensure:
- [ ] Read existing files listed in "Existing Code Reference" section
- [ ] Directory `lib/server-actions/middleware/` exists

```bash
mkdir -p lib/server-actions/middleware
mkdir -p lib/server-actions/middleware/__tests__
```

---

## Existing Code Reference

**MUST READ before implementation:**

| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/supabase/rls-context.ts` | Auth + RLS | `getAuthContext()`, `injectRLSContext()`, `RLSContext` |
| `lib/errors/domain-errors.ts` | Error types | `DomainError`, `DomainErrorCode` |
| `lib/server-actions/error-map.ts` | Error mapping | `mapDatabaseError()`, `MappedError` |
| `lib/correlation.ts` | Correlation | `runWithCorrelation()`, `getCorrelationId()` |
| `lib/http/service-response.ts` | Result types | `ServiceResult<T>`, `ServiceHttpResult<T>` |
| `types/database.types.ts` | DB types | `Database`, `Json` |

---

## Parallel Execution Plan

```
                    ┌─────────────────────┐
                    │  TASK 1: types.ts   │
                    │   (Foundation)      │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ TASK 2: auth.ts │  │ TASK 3: rls.ts  │  │ TASK 4:         │
│                 │  │                 │  │ idempotency.ts  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  TASK 5: audit.ts   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ TASK 6: tracing.ts  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ TASK 7: compositor  │
                    │    + index.ts       │
                    └─────────────────────┘
```

**Parallel Groups:**
- **Group A (Sequential):** Task 1 → (Task 2, 3, 4 parallel) → Task 5 → Task 6 → Task 7
- Sub-agents can work on Tasks 2, 3, 4 simultaneously after Task 1 completes

---

## TASK 1: Middleware Types (Foundation)

**File:** `lib/server-actions/middleware/types.ts`
**Blocking:** All other tasks depend on this
**Est. LOC:** 60

### Implementation

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { RLSContext } from '@/lib/supabase/rls-context';
import type { ServiceResult } from '@/lib/http/service-response';

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
  next: () => Promise<ServiceResult<T>>
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
```

### Acceptance Criteria

- [ ] Types compile without errors: `npx tsc --noEmit lib/server-actions/middleware/types.ts`
- [ ] All interfaces have JSDoc comments
- [ ] No circular dependencies

---

## TASK 2: withAuth Middleware

**File:** `lib/server-actions/middleware/auth.ts`
**Depends on:** Task 1 (types.ts)
**Can run parallel with:** Tasks 3, 4
**Est. LOC:** 40

### Implementation

```typescript
import { DomainError } from '@/lib/errors/domain-errors';
import { getAuthContext } from '@/lib/supabase/rls-context';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Authentication Middleware
 *
 * Validates:
 * 1. User is authenticated (auth.uid() exists)
 * 2. User is linked to active staff record
 * 3. Staff has valid casino assignment
 *
 * Populates ctx.rlsContext for downstream middleware.
 *
 * @throws DomainError UNAUTHORIZED - No authenticated user
 * @throws DomainError FORBIDDEN - User not active staff or no casino
 */
export function withAuth<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    try {
      const rlsContext = await getAuthContext(ctx.supabase);
      ctx.rlsContext = rlsContext;
      return next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';

      if (message.includes('UNAUTHORIZED')) {
        throw new DomainError('UNAUTHORIZED', 'Authentication required');
      }

      if (message.includes('FORBIDDEN')) {
        throw new DomainError('FORBIDDEN', message);
      }

      throw new DomainError('INTERNAL_ERROR', message, { details: error });
    }
  };
}
```

### Unit Tests

**File:** `lib/server-actions/middleware/__tests__/auth.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAuth } from '../auth';
import { DomainError } from '@/lib/errors/domain-errors';
import type { MiddlewareContext } from '../types';

// Mock getAuthContext
vi.mock('@/lib/supabase/rls-context', () => ({
  getAuthContext: vi.fn(),
}));

import { getAuthContext } from '@/lib/supabase/rls-context';

describe('withAuth middleware', () => {
  const mockSupabase = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: 'test' });
  });

  function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now(),
      ...overrides,
    };
  }

  it('should populate rlsContext on successful auth', async () => {
    const mockRlsContext = {
      actorId: 'actor-uuid',
      casinoId: 'casino-uuid',
      staffRole: 'admin',
    };
    vi.mocked(getAuthContext).mockResolvedValue(mockRlsContext);

    const ctx = createContext();
    const middleware = withAuth();

    await middleware(ctx, mockNext);

    expect(ctx.rlsContext).toEqual(mockRlsContext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw UNAUTHORIZED when no user', async () => {
    vi.mocked(getAuthContext).mockRejectedValue(new Error('UNAUTHORIZED: No authenticated user'));

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw FORBIDDEN when user not active staff', async () => {
    vi.mocked(getAuthContext).mockRejectedValue(new Error('FORBIDDEN: User is not active staff'));

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should throw FORBIDDEN when no casino assignment', async () => {
    vi.mocked(getAuthContext).mockRejectedValue(
      new Error('FORBIDDEN: Staff member has no casino assignment')
    );

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should throw INTERNAL_ERROR for unexpected errors', async () => {
    vi.mocked(getAuthContext).mockRejectedValue(new Error('Database connection failed'));

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
```

### Acceptance Criteria

- [ ] Populates `ctx.rlsContext` on success
- [ ] Returns 401 UNAUTHORIZED for unauthenticated requests
- [ ] Returns 403 FORBIDDEN for inactive/missing staff
- [ ] All 5 test cases pass

---

## TASK 3: withRLS Middleware

**File:** `lib/server-actions/middleware/rls.ts`
**Depends on:** Task 1 (types.ts)
**Can run parallel with:** Tasks 2, 4
**Est. LOC:** 35

### Implementation

```typescript
import { DomainError } from '@/lib/errors/domain-errors';
import { injectRLSContext } from '@/lib/supabase/rls-context';
import type { Middleware, MiddlewareContext } from './types';

/**
 * RLS Context Injection Middleware
 *
 * Executes SET LOCAL statements to inject context into Postgres session:
 * - SET LOCAL app.actor_id = 'uuid'
 * - SET LOCAL app.casino_id = 'uuid'
 * - SET LOCAL app.staff_role = 'role'
 * - SET LOCAL application_name = 'correlation-id'
 *
 * RLS policies can then use: current_setting('app.casino_id')::uuid
 *
 * REQUIRES: withAuth must run first to populate ctx.rlsContext
 *
 * @throws DomainError INTERNAL_ERROR - If RLS context missing or injection fails
 */
export function withRLS<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    if (!ctx.rlsContext) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RLS context not available - withAuth must run first'
      );
    }

    try {
      await injectRLSContext(ctx.supabase, ctx.rlsContext, ctx.correlationId);
      return next();
    } catch (error) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Failed to inject RLS context',
        { details: error }
      );
    }
  };
}
```

### Unit Tests

**File:** `lib/server-actions/middleware/__tests__/rls.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRLS } from '../rls';
import { DomainError } from '@/lib/errors/domain-errors';
import type { MiddlewareContext } from '../types';

vi.mock('@/lib/supabase/rls-context', () => ({
  injectRLSContext: vi.fn(),
}));

import { injectRLSContext } from '@/lib/supabase/rls-context';

describe('withRLS middleware', () => {
  const mockSupabase = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: 'test' });
  });

  function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now(),
      ...overrides,
    };
  }

  it('should inject RLS context and call next', async () => {
    vi.mocked(injectRLSContext).mockResolvedValue(undefined);

    const rlsContext = {
      actorId: 'actor-uuid',
      casinoId: 'casino-uuid',
      staffRole: 'admin',
    };
    const ctx = createContext({ rlsContext });
    const middleware = withRLS();

    const result = await middleware(ctx, mockNext);

    expect(injectRLSContext).toHaveBeenCalledWith(
      mockSupabase,
      rlsContext,
      'test-correlation-id'
    );
    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should throw INTERNAL_ERROR when rlsContext missing', async () => {
    const ctx = createContext(); // No rlsContext
    const middleware = withRLS();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'RLS context not available - withAuth must run first',
    });
  });

  it('should throw INTERNAL_ERROR on injection failure', async () => {
    vi.mocked(injectRLSContext).mockRejectedValue(new Error('RPC failed'));

    const ctx = createContext({
      rlsContext: { actorId: 'a', casinoId: 'c', staffRole: 'r' },
    });
    const middleware = withRLS();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to inject RLS context',
    });
  });
});
```

### Acceptance Criteria

- [ ] Calls `injectRLSContext` with correct parameters
- [ ] Throws INTERNAL_ERROR if `ctx.rlsContext` is missing
- [ ] Throws INTERNAL_ERROR on injection failure
- [ ] All 3 test cases pass

---

## TASK 4: withIdempotency Middleware

**File:** `lib/server-actions/middleware/idempotency.ts`
**Depends on:** Task 1 (types.ts)
**Can run parallel with:** Tasks 2, 3
**Est. LOC:** 25

### Implementation

```typescript
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
        { details: { header: 'x-idempotency-key', required: true } }
      );
    }

    return next();
  };
}
```

### Unit Tests

**File:** `lib/server-actions/middleware/__tests__/idempotency.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withIdempotency } from '../idempotency';
import { DomainError } from '@/lib/errors/domain-errors';
import type { MiddlewareContext } from '../types';

describe('withIdempotency middleware', () => {
  const mockSupabase = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: 'test' });
  });

  function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now(),
      ...overrides,
    };
  }

  it('should pass through when key is present', async () => {
    const ctx = createContext({ idempotencyKey: 'test-key-123' });
    const middleware = withIdempotency(true);

    const result = await middleware(ctx, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should throw VALIDATION_ERROR when required key is missing', async () => {
    const ctx = createContext(); // No idempotencyKey
    const middleware = withIdempotency(true);

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Missing required x-idempotency-key header for mutation',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should pass through when required=false and key is missing', async () => {
    const ctx = createContext(); // No idempotencyKey
    const middleware = withIdempotency(false);

    const result = await middleware(ctx, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });
});
```

### Acceptance Criteria

- [ ] Passes through when key present
- [ ] Throws VALIDATION_ERROR when required key missing
- [ ] Passes through when `required=false` and key missing
- [ ] All 3 test cases pass

---

## TASK 5: withAudit Middleware

**File:** `lib/server-actions/middleware/audit.ts`
**Depends on:** Tasks 1, 2 (needs rlsContext populated)
**Est. LOC:** 60

### Implementation

```typescript
import type { Database, Json } from '@/types/database.types';
import type { ServiceResult } from '@/lib/http/service-response';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Convert unknown value to JSON-safe type
 */
function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as Json;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item)) as Json;
  }

  if (typeof value === 'object') {
    const result: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toJson(val);
    }
    return result;
  }

  return String(value);
}

/**
 * Audit Logging Middleware
 *
 * Records audit_log entries for all operations.
 *
 * Captures:
 * - correlation_id (from context)
 * - actor_id (from RLS context)
 * - casino_id (from RLS context)
 * - domain, action (from config)
 * - result details (ok, code, error)
 * - duration (ms)
 *
 * NOTE: Only writes in production environment.
 * Fire-and-forget pattern - audit failures don't fail the request.
 */
export function withAudit<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    const result = await next();

    // Only audit in production
    if (process.env.NODE_ENV !== 'production') {
      return result;
    }

    try {
      await writeAuditEntry(ctx, result);
    } catch (error) {
      // Log but don't fail the request
      console.error('[audit] Failed to write audit log:', error);
    }

    return result;
  };
}

/**
 * Write audit log entry to database
 */
async function writeAuditEntry<T>(
  ctx: MiddlewareContext,
  result: ServiceResult<T>
): Promise<void> {
  const details: Json = toJson({
    correlationId: ctx.correlationId,
    idempotencyKey: ctx.idempotencyKey ?? null,
    durationMs: Date.now() - ctx.startedAt,
    ok: result.ok,
    code: result.code,
    error: result.error ?? null,
  });

  const payload = {
    casino_id: ctx.rlsContext?.casinoId ?? null,
    domain: ctx.domain ?? ctx.endpoint ?? 'unknown',
    actor_id: ctx.rlsContext?.actorId ?? null,
    action: ctx.action ?? 'unknown',
    details,
  } satisfies Database['public']['Tables']['audit_log']['Insert'];

  await ctx.supabase.from('audit_log').insert(payload);
}
```

### Unit Tests

**File:** `lib/server-actions/middleware/__tests__/audit.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withAudit } from '../audit';
import type { MiddlewareContext } from '../types';

describe('withAudit middleware', () => {
  const originalEnv = process.env.NODE_ENV;
  const mockInsert = vi.fn();
  const mockSupabase = {
    from: vi.fn().mockReturnValue({ insert: mockInsert }),
  } as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockNext.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
      requestId: 'req-123',
      durationMs: 50,
      timestamp: '2025-01-01T00:00:00Z',
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now() - 100,
      domain: 'loyalty',
      action: 'ledger.append',
      rlsContext: {
        actorId: 'actor-uuid',
        casinoId: 'casino-uuid',
        staffRole: 'admin',
      },
      ...overrides,
    };
  }

  it('should write audit log in production', async () => {
    process.env.NODE_ENV = 'production';

    const ctx = createContext();
    const middleware = withAudit();

    await middleware(ctx, mockNext);

    expect(mockSupabase.from).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        casino_id: 'casino-uuid',
        actor_id: 'actor-uuid',
        domain: 'loyalty',
        action: 'ledger.append',
      })
    );
  });

  it('should skip audit in non-production', async () => {
    process.env.NODE_ENV = 'development';

    const ctx = createContext();
    const middleware = withAudit();

    const result = await middleware(ctx, mockNext);

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('should not fail request on audit error', async () => {
    process.env.NODE_ENV = 'production';
    mockInsert.mockResolvedValue({ error: new Error('DB error') });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ctx = createContext();
    const middleware = withAudit();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(true); // Request still succeeds
    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit] Failed to write audit log:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
```

### Acceptance Criteria

- [ ] Writes audit_log in production
- [ ] Skips audit in non-production
- [ ] Does not fail request on audit error
- [ ] All 3 test cases pass

---

## TASK 6: withTracing Middleware

**File:** `lib/server-actions/middleware/tracing.ts`
**Depends on:** Task 1 (types.ts)
**Est. LOC:** 45

### Implementation

```typescript
import { mapDatabaseError } from '@/lib/server-actions/error-map';
import type { ServiceResult } from '@/lib/http/service-response';
import type { Middleware, MiddlewareContext } from './types';

/**
 * Tracing Middleware
 *
 * Responsibilities:
 * 1. Wrap handler execution to catch unhandled errors
 * 2. Map database/domain errors to ServiceResult
 * 3. Record accurate duration in result
 * 4. Ensure requestId and timestamp are present
 *
 * Future: OpenTelemetry span integration
 */
export function withTracing<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    try {
      const result = await next();

      // Ensure duration is accurate and metadata is complete
      return {
        ...result,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const mapped = mapDatabaseError(error);

      return {
        ok: false,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      } as ServiceResult<T>;
    }
  };
}
```

### Unit Tests

**File:** `lib/server-actions/middleware/__tests__/tracing.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTracing } from '../tracing';
import { DomainError } from '@/lib/errors/domain-errors';
import type { MiddlewareContext } from '../types';

vi.mock('@/lib/server-actions/error-map', () => ({
  mapDatabaseError: vi.fn(),
}));

import { mapDatabaseError } from '@/lib/server-actions/error-map';

describe('withTracing middleware', () => {
  const mockSupabase = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mapDatabaseError).mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred',
      httpStatus: 500,
      retryable: false,
    });
  });

  function createContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now() - 100, // 100ms ago
      ...overrides,
    };
  }

  it('should pass through successful result with metadata', async () => {
    mockNext.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
    });

    const ctx = createContext();
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(true);
    expect(result.requestId).toBe('test-correlation-id');
    expect(result.durationMs).toBeGreaterThanOrEqual(100);
    expect(result.timestamp).toBeDefined();
  });

  it('should map thrown errors to ServiceResult', async () => {
    mockNext.mockRejectedValue(new Error('Database error'));
    vi.mocked(mapDatabaseError).mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'Database error',
      httpStatus: 500,
      retryable: false,
    });

    const ctx = createContext();
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.error).toBe('Database error');
    expect(result.requestId).toBe('test-correlation-id');
  });

  it('should calculate accurate duration', async () => {
    const startTime = Date.now() - 250; // 250ms ago
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: null });

    const ctx = createContext({ startedAt: startTime });
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.durationMs).toBeGreaterThanOrEqual(250);
    expect(result.durationMs).toBeLessThan(500); // Reasonable upper bound
  });
});
```

### Acceptance Criteria

- [ ] Passes through successful results with metadata
- [ ] Maps thrown errors to ServiceResult
- [ ] Calculates accurate duration
- [ ] All 3 test cases pass

---

## TASK 7: Compositor + Index

**Files:**
- `lib/server-actions/middleware/compositor.ts`
- `lib/server-actions/middleware/index.ts`

**Depends on:** All previous tasks (2-6)
**Est. LOC:** 80

### Implementation: compositor.ts

```typescript
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { runWithCorrelation } from '@/lib/correlation';
import type { ServiceResult } from '@/lib/http/service-response';
import { withAuth } from './auth';
import { withRLS } from './rls';
import { withIdempotency } from './idempotency';
import { withAudit } from './audit';
import { withTracing } from './tracing';
import type {
  Middleware,
  MiddlewareContext,
  ServerActionConfig,
  ServerActionOptions,
} from './types';

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
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      const fn = i < middlewares.length ? middlewares[i] : next;

      if (!fn) {
        return Promise.reject(new Error('No handler provided'));
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
  options: ServerActionOptions = {}
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
  const middlewares: Middleware<T>[] = [];

  if (!options.skipAuth) {
    middlewares.push(withAuth<T>());
    middlewares.push(withRLS<T>());
  }

  // Add idempotency check (only enforced if requireIdempotency is true)
  middlewares.push(withIdempotency<T>(options.requireIdempotency ?? false));

  middlewares.push(withAudit<T>());
  middlewares.push(withTracing<T>());

  const chain = compose(middlewares);

  return runWithCorrelation(correlationId, () =>
    chain(ctx, () => handler(ctx))
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
export function createServerActionWrapper(defaultConfig: ServerActionConfig) {
  return async function <T>(
    supabase: SupabaseClient<Database>,
    handler: (ctx: MiddlewareContext) => Promise<ServiceResult<T>>,
    overrides?: ServerActionOptions
  ): Promise<ServiceResult<T>> {
    return withServerAction(supabase, handler, {
      ...defaultConfig,
      ...overrides,
    });
  };
}
```

### Implementation: index.ts

```typescript
// Middleware exports
export { withAuth } from './auth';
export { withRLS } from './rls';
export { withIdempotency } from './idempotency';
export { withAudit } from './audit';
export { withTracing } from './tracing';

// Compositor exports
export { withServerAction, createServerActionWrapper } from './compositor';

// Type exports
export type {
  MiddlewareContext,
  Middleware,
  ServerActionConfig,
  ServerActionOptions,
} from './types';
```

### Integration Test

**File:** `lib/server-actions/middleware/__tests__/compositor.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withServerAction, createServerActionWrapper } from '../compositor';
import type { ServiceResult } from '@/lib/http/service-response';

// Mock all middleware dependencies
vi.mock('@/lib/supabase/rls-context', () => ({
  getAuthContext: vi.fn().mockResolvedValue({
    actorId: 'actor-uuid',
    casinoId: 'casino-uuid',
    staffRole: 'admin',
  }),
  injectRLSContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/correlation', () => ({
  runWithCorrelation: vi.fn((id, fn) => fn()),
}));

vi.mock('@/lib/server-actions/error-map', () => ({
  mapDatabaseError: vi.fn().mockReturnValue({
    code: 'INTERNAL_ERROR',
    message: 'Error',
    httpStatus: 500,
    retryable: false,
  }),
}));

describe('withServerAction compositor', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('should execute full middleware chain', async () => {
    const handler = vi.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
    } as ServiceResult<{ id: string }>);

    const result = await withServerAction(mockSupabase, handler, {
      domain: 'test',
      action: 'test.action',
    });

    expect(handler).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.requestId).toBeDefined();
    expect(result.durationMs).toBeDefined();
  });

  it('should skip auth when skipAuth=true', async () => {
    const { getAuthContext } = await import('@/lib/supabase/rls-context');

    const handler = vi.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    await withServerAction(mockSupabase, handler, { skipAuth: true });

    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it('should require idempotency key when configured', async () => {
    const handler = vi.fn();

    const result = await withServerAction(mockSupabase, handler, {
      requireIdempotency: true,
      // No idempotencyKey provided
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should pass with idempotency key when required', async () => {
    const handler = vi.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    const result = await withServerAction(mockSupabase, handler, {
      requireIdempotency: true,
      idempotencyKey: 'test-key-123',
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalled();
  });
});

describe('createServerActionWrapper', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  } as any;

  it('should create wrapper with default config', async () => {
    const wrapper = createServerActionWrapper({
      domain: 'loyalty',
      requireIdempotency: true,
    });

    const handler = vi.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    // Should fail without idempotency key (from default config)
    const result = await wrapper(mockSupabase, handler, {
      action: 'ledger.append',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });
});
```

### Acceptance Criteria

- [ ] Composes middleware in correct order
- [ ] Supports `skipAuth` for health checks
- [ ] Enforces `requireIdempotency` when configured
- [ ] Factory helper works with defaults
- [ ] All 5 test cases pass

---

## Verification Commands

After completing all tasks, run:

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint -- lib/server-actions/middleware/

# Run all middleware tests
npm test -- lib/server-actions/middleware/

# Coverage report
npm run test:coverage -- lib/server-actions/middleware/
```

---

## Success Criteria Summary

| Task | Files | Tests | Status |
|------|-------|-------|--------|
| Task 1: types.ts | 1 | 0 | ☐ |
| Task 2: auth.ts | 2 | 5 | ☐ |
| Task 3: rls.ts | 2 | 3 | ☐ |
| Task 4: idempotency.ts | 2 | 3 | ☐ |
| Task 5: audit.ts | 2 | 3 | ☐ |
| Task 6: tracing.ts | 2 | 3 | ☐ |
| Task 7: compositor.ts + index.ts | 2 | 5 | ☐ |
| **TOTAL** | **13** | **22** | ☐ |
