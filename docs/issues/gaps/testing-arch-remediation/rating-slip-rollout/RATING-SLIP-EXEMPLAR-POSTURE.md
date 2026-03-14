# RatingSlip Bounded Context — Exemplar Posture Document

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-03-14
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue:** ISSUE-C4D2AA48
**Predecessor:** Player exemplar (validated 2026-03-14)

---

## Layer Health

| File | Canonical Layer (S3) | Config | Verification Tier | Health State | Notes |
|------|----------------------|--------|-------------------|--------------|-------|
| `rating-slip-rpc-contract.int.test.ts` | Integration (S3.5) | integration | Trusted-Local | Healthy | Canary exemplar (53 tests). Type contracts, schema validation, mapper contract, enum drift, RPC arg assertions. |
| `rating-slip-route-boundary.test.ts` | Route-Handler (S3.4) | node | Trusted-Local | Healthy | Boundary exemplar (3 tests). HTTP contract: status codes, body shape, id passthrough, 404 path. |
| `rating-slip.service.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | State machine + CRUD tests (35 tests). Mock-based RPC verification, error mapping. |
| `mappers.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Pure transforms. Row -> DTO, null handling, immutability, player/ghost visit. 65 tests. |
| `queries.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Published queries. hasOpenSlipsForTable, countOpenSlipsForTable. 20 tests. |
| `rating-slip-continuity.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | PRD-016 continuity logic. move_group_id propagation, accumulated_seconds. 11 tests. |
| `http-contract.test.ts` | Smoke (S3.7) | node | Advisory | Compromised | Shallow test: only asserts `typeof === 'function'` on exports. No behavioral assertions. Reclassified per S9.2. |
| `rating-slip-move-pooling.test.ts` | **Misclassified** | node (wrong) | N/A | Degraded | Integration test with `.test.ts` suffix. Needs Supabase. Should be renamed to `.integration.test.ts`. |

---

## Aggregate Summary

| Metric | Value |
|--------|-------|
| Total test files (node config) | 7 (6 proper unit + 1 misclassified) |
| Integration config files | 1 (canary) + 3 pre-existing |
| Config overlap | 0 |
| Healthy files | 6 |
| Degraded files | 1 (move-pooling misclassified) |
| Compromised/Advisory files | 1 (http-contract, reclassified as Smoke) |
| Total tests passing (node, proper unit) | 143 (excludes 4 move-pooling failures) |
| Total tests passing (integration canary) | 53 |
| Skipped tests | 0 |
| Failed tests (node config) | 4 (move-pooling, pre-existing misclassification) |

---

## Skip Registry (S11)

**Empty.** No skipped tests.

---

## Fixes Applied During Rollout

| File | Tests Affected | Root Cause | Fix Applied |
|------|---------------|------------|-------------|
| `rating-slip.service.test.ts` | 3 fixed | PERF-005 WS6 removed pre-validation visit lookup; 3 tests mocked stale visit chain instead of RPC error | Changed to mock `rpc` returning errors (23503 FK violation, VISIT_NOT_OPEN message) |
| `rating-slip.service.test.ts` | 1 renamed | `VISIT_CASINO_MISMATCH` was pre-validation-only error code, no longer emitted | Renamed test to reflect RPC returns `VISIT_NOT_OPEN` for casino mismatch |
| 4 files | -- | Missing `@jest-environment node` directive | Added directive to service, mappers, queries, continuity |
| `http-contract.test.ts` | -- | Shallow theatre test | Reclassified header as Smoke (S3.7) per S9.2 |

---

## Effectiveness Classification

| Classification | Count | Files |
|---------------|-------|-------|
| **Effective** | 4 | mappers, queries, continuity, rating-slip-route-boundary |
| **Exemplar** | 1 | rating-slip-rpc-contract.int (frozen canary) |
| **Partially Effective** | 1 | rating-slip.service (RPC mock verification, error mapping real, response assertions mock-bounded) |
| **Theatre -> Smoke** | 1 | http-contract (correctly reclassified per S9.2) |
| **Misclassified** | 1 | rating-slip-move-pooling (integration test in unit config) |

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests may be added to the RatingSlip bounded context.
- New route-handler tests must follow the `rating-slip-route-boundary.test.ts` exemplar pattern:
  real request objects, real handler invocation, status/body/error assertions.
- `http-contract.test.ts` is reclassified as **Smoke (S3.7)** per S9.2. It verifies import
  resolution only -- it does not count toward verification status. It is not removed.

---

## Misclassification Registry

| File | Current Suffix | Correct Suffix | Impact | Remediation |
|------|---------------|---------------|--------|-------------|
| `rating-slip-move-pooling.test.ts` | `.test.ts` | `.integration.test.ts` | 4 false failures in node config | Rename file (follow-up) |

---

## Tenancy Verification Gap

Route-handler tests (e.g., `rating-slip-route-boundary.test.ts`) verify handler contracts with
mocked middleware context. They inject a controlled `rlsContext.casinoId` and assert it flows
through to query parameters.

They do **not** verify tenant isolation or RLS enforcement. Cross-tenant abuse verification
requires integration tests against a running Supabase instance with real RLS policies. This is
a known gap shared with the Casino and Player exemplars.

---

## Test Coverage Gaps

| Route | Method | Test Status | Notes |
|-------|--------|-------------|-------|
| `/api/v1/rating-slips/[id]/move` | POST | **NO TEST** | PRD-016 move operation, complex (close + start chain) |
| `/api/v1/rating-slips/[id]/modal-data` | GET | **NO TEST** | BFF aggregation endpoint |
| `/api/v1/rating-slips/active-players` | GET | **NO TEST** | Casino-wide dashboard query |
| `/api/v1/rating-slips/closed-today` | GET | **NO TEST** | Start From Previous panel |

These gaps do not block Trusted-Local tier. Route-handler boundary tests for these endpoints
are recommended as a follow-up.

---

## TypeScript Diagnostics

Same pattern as Player exemplar:

| Diagnostic | Files | Root Cause | Status |
|------------|-------|------------|--------|
| TS2307: Cannot find module `@/types/database.types` | `rating-slip-rpc-contract.int` | `@/` path alias resolved by Jest `moduleNameMapper` but not by standalone `tsc`. Runtime-correct. | **Not a defect** |
| TS2322: Type `true` not assignable to `never` | `rating-slip-rpc-contract.int` | Cascading artifact of TS2307. Under `tsconfig.json` (`tsc --noEmit`): zero errors. | **False positive** |
| TS2307: Cannot find module `@/app/api/...` | Smoke tests, boundary test | Same path alias issue. | **Not a defect** |

---

## Promotion Readiness

RatingSlip is the fourth bounded context achieving Trusted-Local (Casino, Player, Visit, RatingSlip).

| S7 Criterion | Status |
|-------------|--------|
| 1. Jest environments correctly split | **Met** (7 files have `@jest-environment node`) |
| 2. At least one context Trusted-Local | **Met** (Casino + Player + Visit + RatingSlip) |
| 3. Unit test execution in CI (advisory) | Not yet |
| 4. Stable signal observation period | Not yet |
| 5. Governance effectiveness validated | **Met** |

---

## Verification Commands

```bash
# Node-config unit tests (6 proper files, 143 passing + 4 move-pooling expected failures)
npx jest --config jest.node.config.js --testPathPatterns='services/rating-slip/__tests__/.*\.test\.ts$'

# Integration canary (1 file, 53 passing)
npx jest --config jest.integration.config.js --testPathPatterns='services/rating-slip/__tests__/rating-slip-rpc-contract'

# Route boundary only
npx jest --config jest.node.config.js --testPathPatterns='services/rating-slip/__tests__/rating-slip-route-boundary'
```
