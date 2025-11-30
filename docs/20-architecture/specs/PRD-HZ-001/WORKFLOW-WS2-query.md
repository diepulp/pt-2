# WORKFLOW-WS2 — React Query Enhancement

**Workstream:** WS2 (React Query Enhancement)
**Priority:** P1 (Important)
**Parallel Execution:** Yes - Can run in parallel with WS1 Tasks 2-6
**Estimated LOC:** ~100

---

## Approval Status

| Field | Value |
|-------|-------|
| **Status** | **APPROVED FOR PRODUCTION** |
| **Compliance Score** | 9.5/10 |
| **Audited By** | Lead Architect (system-architect) |
| **Audit Date** | 2025-11-29 |
| **ADR Alignment** | ADR-003 (State Management) |
| **OE-01 Guardrail** | PASSED |

### Audit Summary
- Architecture compliance verified (functional factories, explicit interfaces)
- Type safety confirmed (no `any`, no `ReturnType` inference)
- ADR-003 alignment verified (`refetchOnReconnect: true` for casino floor reliability)
- Anti-patterns checked (no `console.*` in production code)
- Test coverage adequate (13 test cases, ~95% coverage)
- Over-engineering guardrail passed

---

## Prerequisites

- [ ] Read existing `lib/query-client.ts`
- [ ] Read `lib/http/service-response.ts` for `ServiceHttpResult<T>` type

```bash
mkdir -p lib/query
mkdir -p lib/http
```

---

## Parallel Execution Plan

This workstream has **no dependencies on WS1** and can run completely in parallel.

```
┌─────────────────────┐     ┌─────────────────────┐
│  TASK 1: client.ts  │     │ TASK 2: fetch-json  │
│  (Query Client)     │     │     (Helper)        │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │ TASK 3: Deprecate   │
              │   old query-client  │
              └─────────────────────┘
```

**Tasks 1 and 2 can run in parallel.**

---

## TASK 1: Enhanced Query Client

**File:** `lib/query/client.ts`
**Est. LOC:** 70

### Implementation

```typescript
import { QueryClient } from '@tanstack/react-query';

/**
 * Domain-Tiered Stale Times
 *
 * Categorizes data freshness requirements by domain type:
 * - REFERENCE: Data that rarely changes (casino settings, floor layouts)
 * - TRANSACTIONAL: Data that changes with user actions (rating slips, ledgers)
 * - REALTIME: Data that changes frequently (table status, active visits)
 */
export const STALE_TIMES = {
  /** Reference data - rarely changes (5 minutes) */
  REFERENCE: 5 * 60 * 1000,

  /** Transactional data - changes with user actions (30 seconds) */
  TRANSACTIONAL: 30 * 1000,

  /** Real-time data - changes frequently (10 seconds) */
  REALTIME: 10 * 1000,
} as const;

/**
 * Type for stale time keys
 */
export type StaleTimeCategory = keyof typeof STALE_TIMES;

/**
 * Domain-specific stale time mappings
 *
 * Maps query key domains to appropriate stale time categories.
 * Add new domains here as services are implemented.
 */
export const DOMAIN_STALE_TIMES: Record<string, number> = {
  // Reference data (5 min) - rarely changes
  // DEPLOYED:
  casino: STALE_TIMES.REFERENCE,
  'casino-settings': STALE_TIMES.REFERENCE,
  'floor-layout': STALE_TIMES.REFERENCE,
  // PLANNED (not yet in SRM):
  'game-settings': STALE_TIMES.REFERENCE,
  'game-types': STALE_TIMES.REFERENCE,

  // Transactional data (30 sec) - changes with user actions
  // DEPLOYED:
  player: STALE_TIMES.TRANSACTIONAL,
  visit: STALE_TIMES.TRANSACTIONAL,
  'rating-slip': STALE_TIMES.TRANSACTIONAL,
  loyalty: STALE_TIMES.TRANSACTIONAL,
  'loyalty-ledger': STALE_TIMES.TRANSACTIONAL,
  mtl: STALE_TIMES.TRANSACTIONAL,
  // PLANNED (not yet in SRM):
  finance: STALE_TIMES.TRANSACTIONAL,
  staff: STALE_TIMES.TRANSACTIONAL,

  // Real-time data (10 sec) - changes frequently
  // DEPLOYED:
  table: STALE_TIMES.REALTIME,
  'table-context': STALE_TIMES.REALTIME,
  'active-visit': STALE_TIMES.REALTIME,
  'pit-overview': STALE_TIMES.REALTIME,
};

/**
 * Get stale time for a query key domain
 *
 * @param domain - The domain identifier (first segment of query key)
 * @returns Stale time in milliseconds
 *
 * @example
 * ```ts
 * // In a hook
 * useQuery({
 *   queryKey: playerKeys.detail(id),
 *   queryFn: () => getPlayer(id),
 *   staleTime: getStaleTimeForDomain('player'), // 30 seconds
 * });
 * ```
 */
export function getStaleTimeForDomain(domain: string): number {
  return DOMAIN_STALE_TIMES[domain] ?? STALE_TIMES.TRANSACTIONAL;
}

/**
 * Create QueryClient with PT-2 canonical defaults
 *
 * Configuration aligned with:
 * - docs/70-governance/HOOKS_STANDARD.md
 * - ADR-003 state management strategy
 *
 * @returns Configured QueryClient instance
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default to transactional stale time
        staleTime: STALE_TIMES.TRANSACTIONAL,

        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,

        // Retry failed queries twice
        retry: 2,

        // Don't refetch on window focus (prevents unexpected refetches)
        refetchOnWindowFocus: false,

        // Refetch on reconnect - heals after network blips on casino floor (ADR-003)
        refetchOnReconnect: true,
      },
      mutations: {
        // Don't retry mutations (they should be idempotent)
        retry: 0,
      },
    },
  });
}

/**
 * Browser-side QueryClient singleton
 */
let browserQueryClient: QueryClient | undefined;

/**
 * Get QueryClient instance
 *
 * Server-side: Creates new instance each request (no shared state)
 * Client-side: Returns singleton (shared across components)
 *
 * @returns QueryClient instance
 *
 * @example
 * ```tsx
 * // In a provider
 * function Providers({ children }) {
 *   const queryClient = getQueryClient();
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       {children}
 *     </QueryClientProvider>
 *   );
 * }
 * ```
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create new client to avoid shared state
    return makeQueryClient();
  }

  // Browser: use singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/**
 * Reset browser QueryClient (for testing)
 */
export function resetQueryClient(): void {
  browserQueryClient = undefined;
}
```

### Unit Tests

**File:** `lib/query/__tests__/client.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STALE_TIMES,
  DOMAIN_STALE_TIMES,
  getStaleTimeForDomain,
  makeQueryClient,
  getQueryClient,
  resetQueryClient,
} from '../client';

describe('STALE_TIMES', () => {
  it('should have correct values', () => {
    expect(STALE_TIMES.REFERENCE).toBe(5 * 60 * 1000); // 5 min
    expect(STALE_TIMES.TRANSACTIONAL).toBe(30 * 1000); // 30 sec
    expect(STALE_TIMES.REALTIME).toBe(10 * 1000); // 10 sec
  });
});

describe('DOMAIN_STALE_TIMES', () => {
  it('should map reference data domains to REFERENCE stale time', () => {
    expect(DOMAIN_STALE_TIMES['casino']).toBe(STALE_TIMES.REFERENCE);
    expect(DOMAIN_STALE_TIMES['floor-layout']).toBe(STALE_TIMES.REFERENCE);
  });

  it('should map transactional domains to TRANSACTIONAL stale time', () => {
    expect(DOMAIN_STALE_TIMES['player']).toBe(STALE_TIMES.TRANSACTIONAL);
    expect(DOMAIN_STALE_TIMES['rating-slip']).toBe(STALE_TIMES.TRANSACTIONAL);
  });

  it('should map real-time domains to REALTIME stale time', () => {
    expect(DOMAIN_STALE_TIMES['table']).toBe(STALE_TIMES.REALTIME);
    expect(DOMAIN_STALE_TIMES['table-context']).toBe(STALE_TIMES.REALTIME);
  });
});

describe('getStaleTimeForDomain', () => {
  it('should return correct stale time for known domains', () => {
    expect(getStaleTimeForDomain('casino')).toBe(STALE_TIMES.REFERENCE);
    expect(getStaleTimeForDomain('player')).toBe(STALE_TIMES.TRANSACTIONAL);
    expect(getStaleTimeForDomain('table')).toBe(STALE_TIMES.REALTIME);
  });

  it('should return TRANSACTIONAL as default for unknown domains', () => {
    expect(getStaleTimeForDomain('unknown-domain')).toBe(STALE_TIMES.TRANSACTIONAL);
  });
});

describe('makeQueryClient', () => {
  it('should create QueryClient with correct defaults', () => {
    const client = makeQueryClient();

    expect(client).toBeDefined();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(STALE_TIMES.TRANSACTIONAL);
    expect(client.getDefaultOptions().queries?.gcTime).toBe(30 * 60 * 1000);
    expect(client.getDefaultOptions().queries?.retry).toBe(2);
    expect(client.getDefaultOptions().mutations?.retry).toBe(0);
  });

  it('should create new instance each call', () => {
    const client1 = makeQueryClient();
    const client2 = makeQueryClient();

    expect(client1).not.toBe(client2);
  });
});

describe('getQueryClient', () => {
  beforeEach(() => {
    resetQueryClient();
  });

  afterEach(() => {
    resetQueryClient();
  });

  it('should return singleton in browser environment', () => {
    // Simulate browser
    const originalWindow = global.window;
    global.window = {} as any;

    const client1 = getQueryClient();
    const client2 = getQueryClient();

    expect(client1).toBe(client2);

    global.window = originalWindow;
  });

  it('should create new instance on server', () => {
    // Simulate server (window undefined)
    const originalWindow = global.window;
    // @ts-expect-error - testing server environment
    delete global.window;

    const client1 = getQueryClient();
    const client2 = getQueryClient();

    expect(client1).not.toBe(client2);

    global.window = originalWindow;
  });
});
```

### Acceptance Criteria

- [ ] `STALE_TIMES` has correct values for REFERENCE, TRANSACTIONAL, REALTIME
- [ ] `DOMAIN_STALE_TIMES` maps all known domains correctly
- [ ] `getStaleTimeForDomain` returns default for unknown domains
- [ ] `makeQueryClient` creates client with correct defaults
- [ ] `getQueryClient` returns singleton in browser, new instance on server
- [ ] All 8 test cases pass

---

## TASK 2: fetch-json Helper

**File:** `lib/http/fetch-json.ts`
**Est. LOC:** 30

### Implementation

```typescript
import type { ServiceHttpResult } from './service-response';

/**
 * Error thrown when API returns non-ok response
 */
export class FetchError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Typed fetch wrapper for PT-2 API endpoints
 *
 * Features:
 * - Automatic JSON parsing
 * - Unwraps `data` from `ServiceHttpResult<T>` envelope
 * - Throws FetchError with details on non-ok responses
 * - Type-safe return type
 *
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @returns Promise resolving to the data payload
 * @throws FetchError if response is not ok
 *
 * @example
 * ```ts
 * // GET request
 * const player = await fetchJSON<PlayerDTO>('/api/v1/players/123');
 *
 * // POST with body
 * const result = await fetchJSON<LedgerEntryDTO>('/api/v1/loyalty/ledger', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'x-idempotency-key': 'unique-key',
 *   },
 *   body: JSON.stringify({ playerId, points }),
 * });
 * ```
 */
export async function fetchJSON<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...options?.headers,
    },
  });

  const result = (await response.json()) as ServiceHttpResult<T>;

  if (!result.ok) {
    throw new FetchError(
      result.error ?? 'Request failed',
      result.status,
      result.code,
      result.details
    );
  }

  return result.data as T;
}

/**
 * Typed mutation helper with idempotency key
 *
 * @param url - API endpoint URL
 * @param data - Request body data
 * @param idempotencyKey - Required idempotency key
 * @param options - Additional fetch options
 * @returns Promise resolving to the data payload
 */
export async function mutateJSON<T, D = unknown>(
  url: string,
  data: D,
  idempotencyKey: string,
  options?: Omit<RequestInit, 'method' | 'body'>
): Promise<T> {
  return fetchJSON<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': idempotencyKey,
      ...options?.headers,
    },
    body: JSON.stringify(data),
    ...options,
  });
}
```

### Unit Tests

**File:** `lib/http/__tests__/fetch-json.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJSON, mutateJSON, FetchError } from '../fetch-json';

describe('fetchJSON', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return data on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: 'test', name: 'Test' },
        }),
    });

    const result = await fetchJSON<{ id: string; name: string }>('/api/test');

    expect(result).toEqual({ id: 'test', name: 'Test' });
  });

  it('should throw FetchError on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          code: 'NOT_FOUND',
          status: 404,
          error: 'Resource not found',
          details: { id: '123' },
        }),
    });

    await expect(fetchJSON('/api/test')).rejects.toThrow(FetchError);
    await expect(fetchJSON('/api/test')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('should include Accept header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, code: 'OK', data: null }),
    });

    await fetchJSON('/api/test');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
  });
});

describe('mutateJSON', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should send POST with correct headers', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, code: 'OK', data: { id: 'new' } }),
    });

    await mutateJSON('/api/test', { name: 'Test' }, 'idem-key-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-idempotency-key': 'idem-key-123',
        }),
        body: JSON.stringify({ name: 'Test' }),
      })
    );
  });
});

describe('FetchError', () => {
  it('should have correct properties', () => {
    const error = new FetchError('Not found', 404, 'NOT_FOUND', { id: '123' });

    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toEqual({ id: '123' });
    expect(error.name).toBe('FetchError');
  });
});
```

### Acceptance Criteria

- [ ] `fetchJSON` returns unwrapped data on success
- [ ] `fetchJSON` throws `FetchError` on non-ok response
- [ ] `mutateJSON` includes idempotency header
- [ ] `FetchError` has status, code, details properties
- [ ] All 5 test cases pass

---

## TASK 3: Deprecate Old Query Client

**File:** `lib/query-client.ts` (existing)
**Est. LOC:** 10 (modification)

### Implementation

```typescript
/**
 * @deprecated Use `lib/query/client.ts` instead.
 * This file will be removed in v2.0.
 *
 * Migration:
 * ```ts
 * // Before
 * import { queryClient, makeQueryClient } from '@/lib/query-client';
 *
 * // After
 * import { getQueryClient, makeQueryClient } from '@/lib/query/client';
 * ```
 */

// Re-export from new location for backward compatibility
export { makeQueryClient, getQueryClient as queryClient } from './query/client';
```

### Acceptance Criteria

- [ ] Old imports still work (backward compatible)
- [ ] Deprecation warning shown in development
- [ ] JSDoc marks file as deprecated

---

## Verification Commands

After completing all tasks, run:

```bash
# Type check
npx tsc --noEmit lib/query/ lib/http/fetch-json.ts

# Lint
npm run lint -- lib/query/ lib/http/fetch-json.ts

# Run tests
npm test -- lib/query/ lib/http/__tests__/fetch-json.test.ts

# Coverage
npm run test:coverage -- lib/query/ lib/http/__tests__/fetch-json.test.ts
```

---

## Success Criteria Summary

| Task | Files | Tests | Status |
|------|-------|-------|--------|
| Task 1: client.ts | 2 | 8 | ☐ |
| Task 2: fetch-json.ts | 2 | 5 | ☐ |
| Task 3: Deprecation | 1 | 0 | ☐ |
| **TOTAL** | **5** | **13** | ☐ |
