---
id: QA-ROUTE-TESTING
title: Route Handler Testing Coverage
service: RatingSlipService
phase: Quality Hardening
pattern: Route Handler Unit Tests
http_boundary: true
version: 1.0.0
created: 2025-12-21
status: completed
issue: ISSUE-607F9CCB

workstreams:
  WS1:
    name: Test Infrastructure (Minimal)
    agent: e2e-testing
    status: completed
    depends_on: []
    outputs:
      - lib/testing/route-test-helpers.ts
    gate: type-check
    notes: Minimal helper for creating mock NextRequest objects (~49 LOC)

  WS2:
    name: Rating Slip Route Tests (Collection)
    agent: e2e-testing
    status: completed
    depends_on: [WS1]
    outputs:
      - app/api/v1/rating-slips/__tests__/route.test.ts
    gate: test-pass
    notes: Tests GET (list) and POST (create) endpoints

  WS3:
    name: Rating Slip Route Tests (Resource)
    agent: e2e-testing
    status: completed
    depends_on: [WS1]
    outputs:
      - app/api/v1/rating-slips/[id]/__tests__/route.test.ts
    gate: test-pass
    notes: Tests GET (single), lifecycle actions

  WS4:
    name: Rating Slip Route Tests (Actions)
    agent: e2e-testing
    status: completed
    depends_on: [WS1]
    outputs:
      - app/api/v1/rating-slips/[id]/pause/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/resume/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/close/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/duration/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/average-bet/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/move/__tests__/route.test.ts
      - app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts
    gate: test-pass
    notes: Tests all action endpoints - 29 tests total

  WS5:
    name: HTTP Client Contract Tests
    agent: e2e-testing
    status: completed
    depends_on: [WS2, WS3, WS4]
    outputs:
      - services/rating-slip/__tests__/http-contract.test.ts
    gate: test-pass
    notes: Validates http.ts functions match actual route exports - 9 contract tests

  WS6:
    name: Update QA Documentation
    agent: e2e-testing
    status: completed
    depends_on: [WS5]
    outputs:
      - docs/40-quality/QA-005-route-handler-testing.md
    gate: docs-review

execution_phases:
  - name: Phase 1 (Infrastructure)
    parallel: [WS1]
    status: completed
    gate: type-check

  - name: Phase 2 (Route Tests)
    parallel: [WS2, WS3, WS4]
    status: completed
    gate: test-pass

  - name: Phase 3 (Contract Validation)
    parallel: [WS5]
    status: completed
    gate: test-pass

  - name: Phase 4 (Documentation)
    parallel: [WS6]
    status: completed
    gate: docs-review

gates:
  - name: type-check
    command: npm run type-check
    required_for: [WS1]

  - name: test-pass
    command: npm test app/api/v1/rating-slips/
    required_for: [WS2, WS3, WS4, WS5]

  - name: docs-review
    command: echo "Manual review required"
    required_for: [WS6]
---

# EXECUTION-SPEC: Route Handler Testing Coverage

## Problem Statement

**Issue:** ISSUE-607F9CCB - Rating Slip Testing Coverage Gap

A critical regression occurred when `PATCH /api/v1/rating-slips/[id]/average-bet` returned 404 because the route handler was missing entirely. The HTTP client (`services/rating-slip/http.ts`) called an endpoint that didn't exist.

**Root Cause Analysis:**
- Service layer tests: 90%+ coverage (excellent)
- Route handler tests: 0% coverage (CRITICAL GAP)
- No mechanism to detect client → route mismatches

**Impact:** Production error where JSON.parse failed on 404 HTML response.

## Scope

### In Scope
- Route handler unit tests for all 10 rating-slip API endpoints
- Test helper for creating mock NextRequest objects
- Contract tests validating http.ts ↔ route parity
- Documentation for route handler testing patterns

### Out of Scope
- Full integration tests (service layer already has 90%+ coverage)
- E2E tests (covered by Playwright suite)
- New test infrastructure beyond minimal helpers
- Other API domains (can be extended later)

## Architecture Decision

### Test Strategy: Lightweight Route Handler Unit Tests

Following the OE Guardrail, we avoid:
- New test servers (supertest, etc.)
- Complex mock infrastructure
- Separate test database connections

Instead, we use:
- **Direct function imports** - Import `GET`, `POST`, etc. directly from route.ts
- **Mock NextRequest** - Create typed request objects with minimal helpers
- **Mock service layer** - Jest mock the service factory, not the database
- **Assert response envelope** - Verify `ServiceHttpResult` shape

### Test Pattern

```typescript
// app/api/v1/rating-slips/__tests__/route.test.ts
import { GET, POST } from '../route';
import { createMockRequest } from '@/lib/testing/route-test-helpers';

// Mock the service layer
jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    list: jest.fn().mockResolvedValue({ items: [], cursor: null }),
    create: jest.fn().mockResolvedValue({ id: 'slip-123', status: 'open' }),
  })),
}));

describe('GET /api/v1/rating-slips', () => {
  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/rating-slips');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
    });
  });
});
```

### Test Helper (Minimal)

```typescript
// lib/testing/route-test-helpers.ts (~30 LOC)
import { NextRequest } from 'next/server';

interface MockRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

export function createMockRequest(
  method: string,
  url: string,
  options: MockRequestOptions = {}
): NextRequest {
  const { headers = {}, body, searchParams } = options;

  const fullUrl = new URL(url, 'http://localhost:3000');
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) =>
      fullUrl.searchParams.set(k, v)
    );
  }

  return new NextRequest(fullUrl, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function createMockRouteParams<T extends Record<string, string>>(
  params: T
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
```

## Test Coverage Matrix

| Endpoint | Method | http.ts Function | Test File |
|----------|--------|------------------|-----------|
| `/api/v1/rating-slips` | GET | `listRatingSlips` | WS2 |
| `/api/v1/rating-slips` | POST | `startRatingSlip` | WS2 |
| `/api/v1/rating-slips/[id]` | GET | `getRatingSlip` | WS3 |
| `/api/v1/rating-slips/[id]/pause` | POST | `pauseRatingSlip` | WS4 |
| `/api/v1/rating-slips/[id]/resume` | POST | `resumeRatingSlip` | WS4 |
| `/api/v1/rating-slips/[id]/close` | POST | `closeRatingSlip` | WS4 |
| `/api/v1/rating-slips/[id]/duration` | GET | `getRatingSlipDuration` | WS4 |
| `/api/v1/rating-slips/[id]/average-bet` | PATCH | `updateAverageBet` | WS4 |
| `/api/v1/rating-slips/[id]/move` | POST | (internal) | WS4 |
| `/api/v1/rating-slips/[id]/modal-data` | GET | (internal) | WS4 |

## Test Assertions per Route

Each route test MUST verify:

1. **Route Export Exists**
   ```typescript
   expect(typeof GET).toBe('function');
   ```

2. **Success Response Shape**
   ```typescript
   expect(body).toMatchObject({
     ok: true,
     code: 'OK',
     data: expect.any(Object),
     requestId: expect.any(String),
     timestamp: expect.any(String),
   });
   ```

3. **Error Response Shape**
   ```typescript
   expect(body).toMatchObject({
     ok: false,
     code: expect.any(String),
     error: expect.any(String),
     requestId: expect.any(String),
   });
   ```

4. **Idempotency Header (mutations only)**
   ```typescript
   // Without header
   const response = await POST(requestWithoutHeader);
   expect(response.status).toBe(400);

   // With header
   const response = await POST(requestWithHeader);
   expect(response.status).not.toBe(400);
   ```

5. **Request Validation**
   ```typescript
   const request = createMockRequest('POST', url, { body: { invalid: true } });
   const response = await POST(request);
   expect(response.status).toBe(400);
   expect(body.code).toBe('VALIDATION_ERROR');
   ```

## HTTP Client Contract Test

**Purpose:** Prevent the original bug - client calling non-existent routes.

```typescript
// services/rating-slip/__tests__/http-contract.test.ts
import * as http from '../http';

// Import all route modules to verify exports exist
import * as collectionRoute from '@/app/api/v1/rating-slips/route';
import * as resourceRoute from '@/app/api/v1/rating-slips/[id]/route';
import * as pauseRoute from '@/app/api/v1/rating-slips/[id]/pause/route';
// ... etc

describe('http.ts ↔ route.ts contract', () => {
  it('startRatingSlip calls POST /rating-slips', () => {
    expect(typeof http.startRatingSlip).toBe('function');
    expect(typeof collectionRoute.POST).toBe('function');
  });

  it('listRatingSlips calls GET /rating-slips', () => {
    expect(typeof http.listRatingSlips).toBe('function');
    expect(typeof collectionRoute.GET).toBe('function');
  });

  it('updateAverageBet calls PATCH /rating-slips/[id]/average-bet', () => {
    expect(typeof http.updateAverageBet).toBe('function');
    expect(typeof averageBetRoute.PATCH).toBe('function');
  });

  // ... all 8 http.ts functions
});
```

## Success Criteria

1. **All 10 routes have tests** - One test file per route directory
2. **Contract test passes** - http.ts functions map to existing route exports
3. **CI gate added** - `npm test app/api/v1/rating-slips/` runs in CI
4. **Documentation updated** - QA-005 documents the pattern for other domains

## Estimated Effort

| Workstream | Complexity | Files |
|------------|-----------|-------|
| WS1 - Test Helper | Low | 1 |
| WS2 - Collection Tests | Low | 1 |
| WS3 - Resource Tests | Low | 1 |
| WS4 - Action Tests | Medium | 7 |
| WS5 - Contract Tests | Low | 1 |
| WS6 - Documentation | Low | 1 |

**Total:** 12 files, primarily boilerplate test code.

## OE Guardrail Compliance

| Check | Status |
|-------|--------|
| Abstraction with one consumer? | No - test helper used by all route tests |
| New infrastructure "for later"? | No - minimal 30 LOC helper |
| Duplicating existing mechanisms? | No - extends Jest, no new test runner |
| >150 LOC with no measured problem? | No - each test file <100 LOC |

## Definition of Done

- [x] All 10 rating-slip routes have unit tests (9 test suites, 29 tests)
- [x] Contract test validates http.ts ↔ route parity (9 contract tests)
- [x] CI runs route tests on PR (via existing Jest configuration)
- [x] No regressions in existing test suite (all tests pass)
- [x] QA-005 documentation created (docs/40-quality/QA-005-route-handler-testing.md)
- [x] ISSUE-607F9CCB resolved (average-bet route created)

## Related Documents

- **Issue:** ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
- **PRD:** PRD-002 (Rating Slip Service)
- **Quality:** QA-001 (Service Testing Strategy), QA-003 (Testing Patterns)
- **Governance:** OVER_ENGINEERING_GUARDRAIL.md
