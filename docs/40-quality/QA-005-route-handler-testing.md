---
id: QA-005
title: Route Handler Testing Patterns
owner: QA
status: Active
affects: [QA-001, QA-003, ADR-008]
created: 2025-12-20
last_review: 2025-12-20
issue: ISSUE-607F9CCB
---

## Purpose

Document the patterns for testing Next.js API route handlers to prevent HTTP boundary layer regressions. Created in response to ISSUE-607F9CCB where a missing route handler caused production failures.

## Problem Statement

The service layer had 90%+ test coverage, but route handlers had 0% coverage. This gap allowed a critical bug where `http.ts` called a non-existent endpoint (`PATCH /api/v1/rating-slips/[id]/average-bet`), resulting in 404 responses and JSON parse failures in production.

## Test Strategy

### Test Pyramid Position

Route handler tests fill the gap between:
- **Unit tests** (service layer) - test business logic
- **E2E tests** (Playwright) - test full user flows

Route handler tests verify the HTTP boundary layer:
- Route exports exist
- Request/response shape compliance
- Header requirements (e.g., Idempotency-Key)
- Error response formatting

### Test Infrastructure

**Helper location:** `lib/testing/route-test-helpers.ts`

```typescript
import { NextRequest } from 'next/server';

interface MockRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

export function createMockRequest(
  method: string,
  url: string,
  options: MockRequestOptions = {},
): NextRequest {
  const { headers = {}, body, searchParams } = options;

  const fullUrl = new URL(url, 'http://localhost:3000');
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) =>
      fullUrl.searchParams.set(k, v),
    );
  }

  return new NextRequest(fullUrl, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function createMockRouteParams<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
```

## Route Handler Test Pattern

### File Location

Tests live alongside route handlers:
```
app/api/v1/rating-slips/
├── route.ts
├── __tests__/
│   └── route.test.ts
└── [id]/
    ├── route.ts
    ├── __tests__/
    │   └── route.test.ts
    └── pause/
        ├── route.ts
        └── __tests__/
            └── route.test.ts
```

### Test Template

```typescript
/**
 * @jest-environment node
 */
import { GET, POST } from '../route';
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock service layer
jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    list: jest.fn().mockResolvedValue({ items: [], cursor: null }),
  })),
}));

describe('GET /api/v1/rating-slips', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
    });
  });
});
```

### Required Assertions

Every route handler test MUST verify:

1. **Route export exists**
   ```typescript
   expect(typeof GET).toBe('function');
   ```

2. **Success response shape** (ServiceHttpResult envelope)
   ```typescript
   expect(body).toMatchObject({
     ok: true,
     code: 'OK',
     data: expect.any(Object),
     requestId: expect.any(String),
   });
   ```

3. **Idempotency header** (for mutations)
   ```typescript
   // Without header → 400
   const response = await POST(request);
   expect(response.status).toBe(400);

   // With header → success
   const request = createMockRequest('POST', url, {
     headers: { 'Idempotency-Key': 'test-key' },
   });
   ```

### Next.js 15 Async Params

Route params are now async in Next.js 15:

```typescript
// Route signature
type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, segmentData: RouteParams) {
  const { id } = await segmentData.params;
  // ...
}

// Test usage
const routeParams = createMockRouteParams({ id: 'slip-123' });
const response = await GET(request, routeParams);
```

### UUID Validation

Routes validate UUID format via Zod schemas. Tests must use valid UUIDs:

```typescript
// Bad - will fail schema validation
const request = createMockRequest('GET', '/api/v1/rating-slips/slip-123');

// Good - valid UUID format
const slipId = '123e4567-e89b-12d3-a456-426614174000';
const request = createMockRequest('GET', `/api/v1/rating-slips/${slipId}`);
```

## HTTP Client Contract Tests

### Purpose

Prevent client → route mismatches by verifying every `http.ts` function maps to an existing route export.

### Pattern

```typescript
// services/rating-slip/__tests__/http-contract.test.ts
import * as http from '../http';
import * as collectionRoute from '@/app/api/v1/rating-slips/route';
import * as resourceRoute from '@/app/api/v1/rating-slips/[id]/route';
// ... import all action routes

describe('http.ts ↔ route.ts contract', () => {
  it('startRatingSlip → POST /rating-slips', () => {
    expect(typeof http.startRatingSlip).toBe('function');
    expect(typeof collectionRoute.POST).toBe('function');
  });

  it('updateAverageBet → PATCH /rating-slips/[id]/average-bet', () => {
    expect(typeof http.updateAverageBet).toBe('function');
    expect(typeof averageBetRoute.PATCH).toBe('function');
  });
});
```

## Running Tests

```bash
# Run all rating-slip route tests
npm test -- app/api/v1/rating-slips

# Run contract tests
npm test -- services/rating-slip/__tests__/http-contract

# Run with verbose output
npm test -- app/api/v1/rating-slips --verbose
```

## CI Integration

Add to GitHub Actions workflow:

```yaml
- name: Route Handler Tests
  run: npm test -- app/api/v1/rating-slips/

- name: HTTP Contract Tests
  run: npm test -- services/*/\\_\\_tests\\_\\_/http-contract
```

## Coverage Matrix

| Endpoint | Method | http.ts Function | Test File |
|----------|--------|------------------|-----------|
| `/api/v1/rating-slips` | GET | `listRatingSlips` | `__tests__/route.test.ts` |
| `/api/v1/rating-slips` | POST | `startRatingSlip` | `__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]` | GET | `getRatingSlip` | `[id]/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/pause` | POST | `pauseRatingSlip` | `pause/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/resume` | POST | `resumeRatingSlip` | `resume/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/close` | POST | `closeRatingSlip` | `close/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/duration` | GET | `getRatingSlipDuration` | `duration/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/average-bet` | PATCH | `updateAverageBet` | `average-bet/__tests__/route.test.ts` |

## Related Documents

- **Issue:** ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
- **EXECUTION-SPEC:** QA-ROUTE-TESTING
- **QA-001:** Service Testing Strategy
- **QA-003:** Service Testing Patterns
- **ADR-008:** Service Layer Architecture
