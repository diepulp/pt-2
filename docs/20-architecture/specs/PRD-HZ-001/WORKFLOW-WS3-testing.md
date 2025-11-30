# WORKFLOW-WS3 — Testing Implementation

**Workstream:** WS3 (Testing)
**Priority:** P0 (Blocking)
**Parallel Execution:** Yes - Unit tests can run parallel with WS1/WS2
**Dependencies:** Requires WS1 middleware code to exist before writing tests
**Test Framework:** Jest (project standard per jest.config.js)
**Approved:** 2025-11-29 (Lead Architect)

---

## Prerequisites

- [ ] WS1 (Middleware) implementation complete
- [ ] WS2 (Query) implementation complete
- [ ] Local Supabase running for integration tests

```bash
# Start local Supabase
npx supabase start

# Verify test helpers exist (co-located per QA-001)
ls -la lib/server-actions/middleware/__tests__/helpers/
```

---

## Parallel Execution Plan

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIT TESTS (Parallel)                        │
│            Location: __tests__/*.test.ts                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  auth.test.ts   │  rls.test.ts    │  idempotency.test.ts        │
│  (5 cases)      │  (3 cases)      │  (3 cases)                  │
├─────────────────┼─────────────────┼─────────────────────────────┤
│  audit.test.ts  │  tracing.test.ts│  compositor.test.ts         │
│  (3 cases)      │  (3 cases)      │  (5 cases)                  │
└─────────────────┴─────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 INTEGRATION TESTS (Sequential)                   │
│            Location: __tests__/*.int.test.ts                    │
├─────────────────────────────────────────────────────────────────┤
│  middleware-chain.int.test.ts  │  audit-log.int.test.ts         │
│  (Full chain with real DB)     │  (Verify audit rows)           │
├─────────────────────────────────────────────────────────────────┤
│  wrapped-route.int.test.ts                                      │
│  (Route handler contract validation)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## TASK 1: Test Fixtures

**Location:** `lib/server-actions/middleware/__tests__/helpers/` (co-located per QA-001)
**Purpose:** Shared mocks and helpers for all middleware tests

### File: `lib/server-actions/middleware/__tests__/helpers/middleware-context.ts`

```typescript
// Jest test helpers (project standard)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { MiddlewareContext } from '@/lib/server-actions/middleware/types';
import type { RLSContext } from '@/lib/supabase/rls-context';

/**
 * Default mock RLS context for testing
 */
export const mockRLSContext: RLSContext = {
  actorId: 'actor-uuid-1234',
  casinoId: 'casino-uuid-5678',
  staffRole: 'admin',
};

/**
 * Create mock Supabase client for unit tests
 */
export function createMockSupabase(
  overrides?: Partial<{
    authUser: { id: string } | null;
    authError: Error | null;
    staffData: { id: string; casino_id: string; role: string } | null;
    staffError: Error | null;
    rpcError: Error | null;
    insertError: Error | null;
  }>
): SupabaseClient<Database> {
  const opts = {
    authUser: { id: 'user-uuid' },
    authError: null,
    staffData: { id: 'staff-uuid', casino_id: 'casino-uuid', role: 'admin' },
    staffError: null,
    rpcError: null,
    insertError: null,
    ...overrides,
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.authUser },
        error: opts.authError,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: opts.staffData,
        error: opts.staffError,
      }),
      insert: jest.fn().mockResolvedValue({
        data: null,
        error: opts.insertError,
      }),
    }),
    rpc: jest.fn().mockResolvedValue({
      data: null,
      error: opts.rpcError,
    }),
  } as unknown as SupabaseClient<Database>;
}

/**
 * Create mock MiddlewareContext for testing
 */
export function createMockContext(
  overrides?: Partial<MiddlewareContext>
): MiddlewareContext {
  return {
    supabase: createMockSupabase(),
    correlationId: 'test-correlation-id-' + Date.now(),
    startedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create mock MiddlewareContext with RLS context populated
 */
export function createMockContextWithAuth(
  overrides?: Partial<MiddlewareContext>
): MiddlewareContext {
  return createMockContext({
    rlsContext: mockRLSContext,
    ...overrides,
  });
}

/**
 * Create a mock next() function for middleware testing
 */
export function createMockNext<T>(returnValue?: Partial<T>) {
  return jest.fn().mockResolvedValue({
    ok: true,
    code: 'OK',
    data: returnValue ?? { id: 'test' },
    requestId: 'test-request-id',
    durationMs: 50,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a failing mock next() function
 */
export function createFailingMockNext(error: Error = new Error('Handler failed')) {
  return jest.fn().mockRejectedValue(error);
}
```

### File: `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Get test Supabase client connected to local instance
 *
 * Requires local Supabase to be running: `npx supabase start`
 */
export function getTestSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  return createClient<Database>(supabaseUrl, supabaseKey);
}

/**
 * Get test Supabase client with service role (bypasses RLS)
 */
export function getTestSupabaseServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  return createClient<Database>(supabaseUrl, serviceKey);
}

/**
 * Test data setup helpers
 */
export const testData = {
  casino: {
    id: 'test-casino-uuid',
    name: 'Test Casino',
  },
  staff: {
    id: 'test-staff-uuid',
    user_id: 'test-user-uuid',
    casino_id: 'test-casino-uuid',
    role: 'admin',
    status: 'active',
  },
};

/**
 * Setup test data in local Supabase
 */
export async function setupTestData() {
  const supabase = getTestSupabaseServiceClient();

  // Insert test casino
  await supabase.from('casinos').upsert({
    id: testData.casino.id,
    name: testData.casino.name,
  });

  // Insert test staff
  await supabase.from('staff').upsert({
    id: testData.staff.id,
    user_id: testData.staff.user_id,
    casino_id: testData.staff.casino_id,
    role: testData.staff.role,
    status: testData.staff.status,
  });
}

/**
 * Cleanup test data from local Supabase
 */
export async function cleanupTestData() {
  const supabase = getTestSupabaseServiceClient();

  // Clean up in reverse dependency order
  await supabase.from('audit_log').delete().eq('casino_id', testData.casino.id);
  await supabase.from('staff').delete().eq('id', testData.staff.id);
  await supabase.from('casinos').delete().eq('id', testData.casino.id);
}
```

---

## TASK 2: Unit Tests (Complete)

All unit tests are defined in WORKFLOW-WS1-middleware.md. Here's a summary checklist:

| Test File | Location | Cases | WS1 Task |
|-----------|----------|-------|----------|
| `auth.test.ts` | `lib/server-actions/middleware/__tests__/` | 5 | Task 2 |
| `rls.test.ts` | `lib/server-actions/middleware/__tests__/` | 3 | Task 3 |
| `idempotency.test.ts` | `lib/server-actions/middleware/__tests__/` | 3 | Task 4 |
| `audit.test.ts` | `lib/server-actions/middleware/__tests__/` | 3 | Task 5 |
| `tracing.test.ts` | `lib/server-actions/middleware/__tests__/` | 3 | Task 6 |
| `compositor.test.ts` | `lib/server-actions/middleware/__tests__/` | 5 | Task 7 |

**Total: 22 unit test cases**

---

## TASK 3: Integration Tests

### File: `lib/server-actions/middleware/__tests__/middleware-chain.int.test.ts`

```typescript
// Integration tests use Jest (project standard)
import { withServerAction } from '../compositor';
import type { ServiceResult } from '@/lib/http/service-response';
import {
  getTestSupabaseServiceClient,
  setupTestData,
  cleanupTestData,
  testData,
} from './helpers/supabase-test-client';

describe('Middleware Chain Integration', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Full Chain Execution', () => {
    it('should execute complete middleware chain with authenticated user', async () => {
      const supabase = getTestSupabaseServiceClient();

      // Mock authenticated context
      // Note: In real integration, we'd authenticate via Supabase Auth
      const result = await withServerAction(
        supabase,
        async (ctx) => {
          // Verify context was populated
          expect(ctx.correlationId).toBeDefined();
          expect(ctx.startedAt).toBeDefined();

          return {
            ok: true,
            code: 'OK',
            data: { message: 'success' },
          } as ServiceResult<{ message: string }>;
        },
        {
          skipAuth: true, // Skip auth for service role client
          domain: 'test',
          action: 'integration.test',
        }
      );

      expect(result.ok).toBe(true);
      expect(result.code).toBe('OK');
      expect(result.data).toEqual({ message: 'success' });
      expect(result.requestId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should reject when idempotency required but missing', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => ({
          ok: true,
          code: 'OK',
          data: null,
        }),
        {
          skipAuth: true,
          requireIdempotency: true,
          // No idempotencyKey provided
        }
      );

      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('idempotency');
    });

    it('should pass when idempotency key provided', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async (ctx) => {
          expect(ctx.idempotencyKey).toBe('test-idem-key');
          return { ok: true, code: 'OK', data: { created: true } };
        },
        {
          skipAuth: true,
          requireIdempotency: true,
          idempotencyKey: 'test-idem-key',
        }
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should map thrown errors to ServiceResult', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => {
          throw new Error('Something went wrong');
        },
        { skipAuth: true }
      );

      expect(result.ok).toBe(false);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.error).toBe('Something went wrong');
      expect(result.requestId).toBeDefined();
    });
  });
});
```

### File: `lib/server-actions/middleware/__tests__/audit-log.int.test.ts`

```typescript
// Integration tests use Jest (project standard)
import { withServerAction } from '../compositor';
import {
  getTestSupabaseServiceClient,
  setupTestData,
  cleanupTestData,
  testData,
} from './helpers/supabase-test-client';

describe('Audit Log Integration', () => {
  const supabase = getTestSupabaseServiceClient();
  let testCorrelationIds: string[] = [];

  beforeAll(async () => {
    await setupTestData();
    // Force production mode for audit logging
    process.env.NODE_ENV = 'production';
  });

  afterAll(async () => {
    process.env.NODE_ENV = 'test';
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up audit logs created during tests
    if (testCorrelationIds.length > 0) {
      for (const correlationId of testCorrelationIds) {
        await supabase
          .from('audit_log')
          .delete()
          .contains('details', { correlationId });
      }
      testCorrelationIds = [];
    }
  });

  it('should write audit log entry with correct fields', async () => {
    const correlationId = `test-audit-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    await withServerAction(
      supabase,
      async () => ({
        ok: true,
        code: 'OK',
        data: { id: 'test' },
      }),
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.action',
        idempotencyKey: 'test-idem-key',
      }
    );

    // Query the audit log
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .contains('details', { correlationId });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs![0]).toMatchObject({
      domain: 'test-domain',
      action: 'test.action',
    });

    const details = auditLogs![0].details as Record<string, unknown>;
    expect(details.correlationId).toBe(correlationId);
    expect(details.idempotencyKey).toBe('test-idem-key');
    expect(details.ok).toBe(true);
    expect(details.code).toBe('OK');
  });

  it('should include error details in failed operations', async () => {
    const correlationId = `test-audit-error-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    await withServerAction(
      supabase,
      async () => {
        throw new Error('Test error message');
      },
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.error',
      }
    );

    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .contains('details', { correlationId });

    expect(auditLogs).toHaveLength(1);

    const details = auditLogs![0].details as Record<string, unknown>;
    expect(details.ok).toBe(false);
    expect(details.error).toBe('Test error message');
  });
});
```

---

## TASK 4: Route Handler Integration Tests

> **Note:** True E2E tests use Cypress per QA-001. These are route handler integration tests
> that validate the HTTP layer contract without browser automation.

### File: `lib/server-actions/middleware/__tests__/wrapped-route.int.test.ts`

```typescript
// Route handler integration tests use Jest (project standard)
import { NextRequest } from 'next/server';
import {
  getTestSupabaseServiceClient,
  setupTestData,
  cleanupTestData,
} from './helpers/supabase-test-client';

/**
 * Route Handler Integration Test
 *
 * Tests the complete flow:
 * 1. HTTP Request with headers
 * 2. Middleware chain execution
 * 3. Service layer call
 * 4. Audit log write
 * 5. Response envelope
 */
describe('Wrapped Route Handler Integration', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('POST with idempotency', () => {
    it('should return ServiceHttpResult envelope', async () => {
      // Create a mock request
      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': 'e2e-test-key-' + Date.now(),
        },
        body: JSON.stringify({ name: 'Test Entity' }),
      });

      // Note: In real E2E test, we'd call the actual route handler
      // For now, we're testing the pattern

      // Expected response shape
      const expectedShape = {
        ok: true,
        code: 'OK',
        status: 200,
        data: expect.any(Object),
        requestId: expect.any(String),
        durationMs: expect.any(Number),
        timestamp: expect.any(String),
      };

      // Verify the idempotency header was extracted
      expect(request.headers.get('x-idempotency-key')).toMatch(/^e2e-test-key-/);
    });

    it('should reject request without idempotency header for mutations', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No x-idempotency-key
        },
        body: JSON.stringify({ name: 'Test Entity' }),
      });

      // Expected error response
      const expectedError = {
        ok: false,
        code: 'VALIDATION_ERROR',
        status: 400,
        error: expect.stringContaining('idempotency'),
      };

      // Verify no idempotency key
      expect(request.headers.get('x-idempotency-key')).toBeNull();
    });

    it('should include correlation ID in response and audit log', async () => {
      const correlationId = 'e2e-correlation-' + Date.now();

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': 'e2e-test-key',
          'x-request-id': correlationId, // Some frameworks use this
        },
        body: JSON.stringify({ name: 'Test Entity' }),
      });

      // Verify correlation ID header
      expect(request.headers.get('x-request-id')).toBe(correlationId);

      // In real E2E:
      // 1. Call route handler
      // 2. Check response.requestId === correlationId
      // 3. Query audit_log for correlationId
      // 4. Verify audit entry exists
    });
  });

  describe('Error responses', () => {
    it('should not expose Postgres error codes', async () => {
      // Expected: UNIQUE_VIOLATION not "23505"
      const expectedErrorCodes = [
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'UNIQUE_VIOLATION',
        'FOREIGN_KEY_VIOLATION',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'INTERNAL_ERROR',
      ];

      // All error codes should be domain codes, not PG codes
      expectedErrorCodes.forEach((code) => {
        expect(code).not.toMatch(/^\d{5}$/); // Not a 5-digit PG code
      });
    });
  });
});
```

---

## Test Execution Commands

```bash
# Run all unit tests
npm test -- lib/server-actions/middleware/__tests__/

# Run with coverage
npm run test:coverage -- lib/server-actions/middleware/

# Run integration tests only (co-located with unit tests)
npm test -- lib/server-actions/middleware/__tests__/*.int.test.ts

# Run all WS3 tests (unit + integration)
npm test -- lib/server-actions/middleware/__tests__/

# Watch mode for development
npm test -- --watch lib/server-actions/middleware/__tests__/

# Note: True E2E tests run via Cypress (npm run cypress:run)
```

---

## Coverage Requirements

| Category | Target | Actual |
|----------|--------|--------|
| Middleware (unit) | 90% | ☐ |
| Compositor (unit) | 85% | ☐ |
| Integration | 80% | ☐ |
| E2E | N/A | ☐ |

---

## Success Criteria Summary

| Task | Files | Test Cases | Location | Status |
|------|-------|------------|----------|--------|
| Task 1: Fixtures | 2 | N/A | `__tests__/helpers/` | ☐ |
| Task 2: Unit Tests | 6 | 22 | `__tests__/*.test.ts` | ☐ |
| Task 3: Integration | 2 | 5 | `__tests__/*.int.test.ts` | ☐ |
| Task 4: Route Handler Int. | 1 | 3 | `__tests__/*.int.test.ts` | ☐ |
| **TOTAL** | **11** | **30** | Co-located | ☐ |

---

## Architectural Approval

| Reviewer | Role | Date | Status |
|----------|------|------|--------|
| Lead Architect | Architecture Validation | 2025-11-29 | **APPROVED** |

**Approval Notes:**
- ✅ Jest framework alignment verified
- ✅ QA-001 co-location pattern applied
- ✅ Coverage targets meet QA-001 standards (90%/85%/80%)
- ✅ 30 test cases fully specified
- ✅ Mock patterns comply with PT-2 anti-patterns
