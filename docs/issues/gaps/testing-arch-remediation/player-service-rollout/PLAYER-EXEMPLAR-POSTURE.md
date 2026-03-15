# Player Bounded Context — Exemplar Posture Document

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-03-14
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue:** ISSUE-C4D2AA48
**Predecessor:** Casino exemplar (validated 2026-03-14)

---

## Layer Health

| File | Canonical Layer (S3) | Config | Verification Tier | Health State | Notes |
|------|----------------------|--------|-------------------|--------------|-------|
| `player-rpc-contract.int.test.ts` | Integration (S3.5) | integration | Trusted-Local | Healthy | Canary exemplar (30 tests). Type contracts, schema validation, mapper contract, enum drift. |
| `player-route-boundary.test.ts` | Route-Handler (S3.4) | node | Trusted-Local | Healthy | Boundary exemplar (3 tests). HTTP contract: status codes, body shape, playerId passthrough, 404 path. |
| `player.service.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | HTTP fetcher tests (18 tests). URL construction, header contract (Idempotency-Key), error handling. |
| `schemas.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Zod validation: createPlayer, updatePlayer, playerIdentity. 63 tests. |
| `exclusion-mappers.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Pure transforms. Exclusion row → DTO, null handling, immutability. 12 tests. |
| `exclusion-schemas.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Zod validation: createExclusion, liftExclusion, route params. 24 tests. |
| `http-contract.test.ts` | Smoke (S3.7) | node | Advisory | Compromised | Shallow test: only asserts `typeof === 'function'` on exports. No behavioral assertions. Reclassified per S9.2. |
| `exclusion-http-contract.test.ts` | Smoke (S3.7) | node | Advisory | Compromised | Shallow test: import resolution only. Reclassified per S9.2. |

---

## Aggregate Summary

| Metric | Value |
|--------|-------|
| Total test files | 8 |
| Node config files | 7 |
| Integration config files | 1 |
| Config overlap | 0 |
| Healthy files | 6 |
| Degraded files | 0 |
| Compromised/Advisory files | 2 (http-contract + exclusion-http-contract, reclassified as Smoke) |
| Total tests passing (node) | 113 |
| Total tests passing (integration) | 30 |
| Skipped tests | 0 |
| Failed tests | 0 |

---

## Skip Registry (S11)

**Empty.** No skipped tests.

---

## Fixes Applied During Rollout

| File | Tests Affected | Root Cause | Fix Applied |
|------|---------------|------------|-------------|
| `player.service.test.ts` | 2 deleted | `enrollPlayer` import stale — function moved to CasinoService per ADR-022 D5 | Deleted 2 tests + removed import |
| `player.service.test.ts` | 3 fixed | `globalThis.crypto` mock via `Object.defineProperty` not overriding Node built-in | Changed to `jest.spyOn(globalThis.crypto, 'randomUUID')` |
| 4 files | — | Missing `@jest-environment node` directive | Added directive to schemas, exclusion-mappers, exclusion-schemas, player.service |

---

## Effectiveness Classification

| Classification | Count | Files |
|---------------|-------|-------|
| **Effective** | 4 | schemas, exclusion-mappers, exclusion-schemas, player-route-boundary |
| **Exemplar** | 1 | player-rpc-contract.int (frozen canary) |
| **Partially Effective** | 1 | player.service (URL/header real, pass-through theatre for response data) |
| **Theatre → Smoke** | 2 | http-contract, exclusion-http-contract (correctly reclassified per §9.2) |

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests may be added to the Player bounded context.
- New route-handler tests must follow the `player-route-boundary.test.ts` exemplar pattern:
  real request objects, real handler invocation, status/body/error assertions.
- `http-contract.test.ts` and `exclusion-http-contract.test.ts` are reclassified as **Smoke (S3.7)**
  per S9.2. They verify import resolution only — they do not count toward verification status.
  They are not removed.

---

## Tenancy Verification Gap

Route-handler tests (e.g., `player-route-boundary.test.ts`) verify handler contracts with
mocked middleware context. They inject a controlled `rlsContext.casinoId` and assert it flows
through to query parameters.

They do **not** verify tenant isolation or RLS enforcement. Cross-tenant abuse verification
requires integration tests against a running Supabase instance with real RLS policies. This is
a known gap shared with the Casino exemplar.

---

## Test Coverage Gaps

| Route | Method | Test Status | Notes |
|-------|--------|-------------|-------|
| `/api/v1/players/[playerId]/identity` | GET, POST | **NO TEST** | Post-MVP (ADR-022), documented gap |
| `/api/v1/players/[playerId]/exclusions` | GET, POST | **NO TEST** | Covered by integration canary schemas |
| `/api/v1/players/[playerId]/exclusions/active` | GET | **NO TEST** | Covered by integration canary schemas |
| `/api/v1/players/[playerId]/exclusions/[exclusionId]/lift` | POST | **NO TEST** | Covered by integration canary schemas |

These gaps do not block Trusted-Local tier. Route-handler boundary tests for exclusion endpoints
are recommended as a follow-up.

---

## TypeScript Diagnostics

Same pattern as Casino exemplar:

| Diagnostic | Files | Root Cause | Status |
|------------|-------|------------|--------|
| TS2307: Cannot find module `@/types/database.types` | `player-rpc-contract.int` | `@/` path alias resolved by Jest `moduleNameMapper` but not by standalone `tsc`. Runtime-correct. | **Not a defect** |
| TS2322: Type `true` not assignable to `never` | `player-rpc-contract.int` | Cascading artifact of TS2307. Under `tsconfig.json` (`tsc --noEmit`): zero errors. | **False positive** |
| TS2307: Cannot find module `@/app/api/...` | Smoke tests, boundary test | Same path alias issue. | **Not a defect** |

---

## Promotion Readiness

Player meets S7 criterion: second bounded context achieving Trusted-Local.

| S7 Criterion | Status |
|-------------|--------|
| 1. Jest environments correctly split | **Met** (all 8 files have `@jest-environment node`) |
| 2. At least one context Trusted-Local | **Met** (Casino + Player) |
| 3. Unit test execution in CI (advisory) | Not yet |
| 4. Stable signal observation period | Not yet |
| 5. Governance effectiveness validated | **Met** |

---

## Verification Commands

```bash
# Node-config unit tests (7 files, 113 passing, 0 skipped)
npx jest --config jest.node.config.js --testPathPatterns='services/player/__tests__/.*\.test\.ts$'

# Full player slice (convenience script)
npm run test:slice:player

# Integration canary (1 file, 30 passing)
npx jest --config jest.integration.config.js --testPathPatterns='services/player/'

# Both slices together
npm run test:slice:casino && npm run test:slice:player
```
