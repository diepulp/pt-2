# FloorLayout Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Route-Handler (GET /floor-layouts) | Trusted-Local | Healthy | `floor-layout-route-boundary.test.ts` |
| Existing shallow test (http-contract) | Advisory | Smoke (S9.2) | Reclassified -- see below |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `http-contract.test.ts` | Smoke (S9.2) | Reclassified | node | N/A |
| `floor-layout-route-boundary.test.ts` | Route-Handler (S3.4) | Boundary | node | N/A |

---

## Reclassification: http-contract.test.ts (S9.2)

`http-contract.test.ts` is reclassified as **Smoke (S9.2)**. It only asserts:
- `typeof http.listFloorLayouts === 'function'`
- `typeof http.getFloorLayout === 'function'`
- `typeof layoutsRoute.GET === 'function'`
- `typeof layoutsRoute.POST === 'function'`
- `typeof versionsRoute.GET === 'function'`

This verifies import resolution and export existence, not behavioral contract.
It does NOT test request/response shape, status codes, error paths, or data flow.
It remains in the test suite for import-resolution safety but is not counted
toward Trusted-Local verification status.

---

## Route-Handler Boundary Test

`floor-layout-route-boundary.test.ts` validates the GET /api/v1/floor-layouts
route handler at the HTTP boundary:

**Test cases:**
1. **Happy path 200** -- Returns layout list with correct ServiceHttpResult envelope
2. **casino_id scoping** -- Verifies casino_id from query params is passed through
   to the Supabase `.eq('casino_id', ...)` call chain
3. **Error path 400** -- Missing required `casino_id` query param triggers Zod
   validation failure and returns 400

**Mock strategy:**
- `withServerAction` intercepted to inject controlled MiddlewareContext with
  mock Supabase client
- `createClient` mocked to avoid `next/headers` cookies() in Jest node env
- Chainable Supabase mock supports `.from().select().eq().order().limit()`
  chain with thenable resolution

---

## Route Coverage

| Route | Method | Handler | Boundary Test |
|-------|--------|---------|---------------|
| `/api/v1/floor-layouts` | GET | `listLayouts` | `floor-layout-route-boundary.test.ts` |
| `/api/v1/floor-layouts` | POST | `createLayout` (RPC) | Not yet tested |
| `/api/v1/floor-layouts/[layoutId]/versions` | GET | `listVersions` | Not yet tested |

POST and versions GET routes are candidates for future boundary tests when
those code paths are next modified (S9.5 exit criteria).

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler logic given a pre-set RLS context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
must be verified via integration tests against a running Supabase instance.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in FloorLayout context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing shallow test (`http-contract.test.ts`) is reclassified as smoke, not removed

---

## Skipped Tests

None. All tests pass under node runtime.

---

## Slice Script

```bash
npx jest --config jest.node.config.js services/floor-layout/__tests__/
```

Runs all `services/floor-layout/__tests__/*.test.ts` files under `jest.node.config.js`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Floor-layout route-handler boundary test added, shallow
   `http-contract.test.ts` reclassified as smoke (S9.2).
2. **Why:** Testing governance remediation per ADR-044, Tier 2 posture documentation.
3. **Layers gained:** Route-Handler boundary test for GET /floor-layouts.
   Shallow test -> Advisory/Smoke reclassification.
4. **Confidence:** Increased -- FloorLayout now has honest local verification
   under correct runtime with behavioral assertions.
5. **Compensating controls:** N/A (confidence increased).
6. **Exit criteria for advisory layers:** Shallow `http-contract.test.ts` replaced
   when route handlers are next modified (S9.5).
