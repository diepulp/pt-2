# Casino Bounded Context — Exemplar Posture Document

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-03-13
**Validated:** 2026-03-14
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md
**Issue:** ISSUE-C4D2AA48

---

## Layer Health

| File | Canonical Layer (S3) | Config | Verification Tier | Health State | Notes |
|------|----------------------|--------|-------------------|--------------|-------|
| `setup-wizard-rpc.int.test.ts` | Integration (S3.5) | integration | Trusted-Local | Healthy | Canary exemplar (39 tests). Schema validation, type contracts, algorithm determinism. |
| `settings-route-boundary.test.ts` | Route-Handler (S3.4) | node | Trusted-Local | Healthy | Boundary exemplar (3 tests). HTTP contract: status codes, body shape, casino_id passthrough. |
| `mappers.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Pure transforms. Casino, settings, staff mappers. Immutability and null handling. |
| `schemas.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Zod validation: createCasino, updateSettings, createStaff, gamingDayQuery. |
| `keys.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | React Query key factory. Serialization stability, scope patterns. |
| `gaming-day.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Pure algorithm tests. Boundary, DST, month/year edge cases. |
| `bootstrap.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | CRUD wrapper + schema. RPC call shape, error mapping, claims reconciliation. |
| `invite.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | CRUD wrappers for invite system. RPC delegation, error codes, schema validation. |
| `game-settings.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Game settings mappers, schemas, CRUD. Shoe decks, deck profiles, edge validation. |
| `service.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Service factory delegation. Interface contract, error propagation. |
| `settings-route.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Schema + DTO type checks for alert_thresholds, `.loose()` regression guard. |
| `onboarding-rpc-contract.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | Compile-time type assertions: RPC args/returns vs Database types. |
| `crud.unit.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | 32/32 tests passing. Error code mapping, role constraints, claims mock applied. |
| `casino.test.ts` | Server-Unit (S3.3) | node | Trusted-Local | Healthy | 28/28 tests passing. HTTP fetcher URL construction, header contract (Idempotency-Key), error handling. |
| `gaming-day-boundary.int.test.ts` | Server-Unit (S3.3) | integration | Trusted-Local | Healthy | Misnamed as `.int.test.ts` but uses mocked RPCs. Temporal contract edge cases. |
| `rpc-create-staff.int.test.ts` | Server-Unit (S3.3) | integration | Trusted-Local | Healthy | Misnamed as `.int.test.ts`. Compile-time RPC type contract, ADR-024 compliance. |
| `rpc-bootstrap-casino-abuse.int.test.ts` | Server-Unit (S3.3) | integration | Trusted-Local | Healthy | Misnamed as `.int.test.ts`. Compile-time type + abuse-case documentation. |
| `rpc-accept-staff-invite-abuse.int.test.ts` | Server-Unit (S3.3) | integration | Trusted-Local | Healthy | Misnamed as `.int.test.ts`. Compile-time type + abuse-case documentation. |
| `http-contract.test.ts` | Smoke (S3.7) | node | Advisory | Compromised | Shallow test: only asserts `typeof === 'function'` on exports. No behavioral assertions. Reclassified per S9.2. |
| `casino.integration.test.ts` | Integration (S3.5) | integration | Trusted-Local | Healthy | Real Supabase: compute_gaming_day, staff constraints, settings. Gated by `RUN_INTEGRATION_TESTS`. |

---

## Aggregate Summary

| Metric | Value |
|--------|-------|
| Total test files | 20 |
| Node config files | 14 |
| Integration config files | 6 |
| Config overlap | 0 |
| Healthy files | 19 |
| Degraded files | 0 |
| Compromised/Advisory files | 1 (http-contract.test.ts, reclassified as smoke) |
| Total tests passing | 355 (node) + 96 (integration without Supabase) |
| Skipped tests | 0 |

---

## Skip Registry (S11)

**Empty.** All 7 previously-skipped tests were resolved during validation (2026-03-14):

| File | Tests Resolved | Root Cause | Fix Applied |
|------|---------------|------------|-------------|
| `crud.unit.test.ts` | 1 | Missing `reconcileStaffClaims` mock (ADR-030 WS3) | Added `jest.mock('@/lib/supabase/claims-reconcile')` |
| `casino.test.ts` | 6 | Header casing drift: `'idempotency-key'` → `'Idempotency-Key'` (IETF title case, `lib/http/headers.ts:14`) | Updated 6 test expectations to `'Idempotency-Key'` |

---

## Effectiveness Classification

Validation report (`CASINO-EXEMPLAR-VALIDATION-REPORT.md`) classified all 20 files:

| Classification | Count | Files |
|---------------|-------|-------|
| **Effective** | 15 | schemas, mappers, keys, crud.unit, bootstrap, gaming-day, gaming-day-boundary.int, game-settings, invite, settings-route, onboarding-rpc-contract, rpc-create-staff.int, rpc-bootstrap-casino-abuse.int, rpc-accept-staff-invite-abuse.int, settings-route-boundary |
| **Partially Effective** | 3 | casino (URL/header real, pass-through theatre), service (delegation theatre, error propagation real), casino.integration (real Supabase, no cross-tenant isolation) |
| **Theatre** | 1 | http-contract (correctly reclassified as Smoke §9.2) |
| **Exemplar** | 1 | setup-wizard-rpc.int (frozen canary) |

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests may be added to the Casino bounded context.
- New route-handler tests must follow the `settings-route-boundary.test.ts` exemplar pattern:
  real request objects, real handler invocation, status/body/error assertions.
- `http-contract.test.ts` is reclassified as **Smoke (S3.7)** per S9.2. It verifies import
  resolution only — it does not count toward verification status. It is not removed.

---

## Tenancy Verification Gap

Route-handler tests (e.g., `settings-route-boundary.test.ts`) verify handler contracts with
mocked middleware context. They inject a controlled `rlsContext.casino_id` and assert it flows
through to the query filter (`.eq('casino_id', ...)`).

They do **not** verify tenant isolation or RLS enforcement. Cross-tenant abuse verification
requires integration tests against a running Supabase instance with real RLS policies. The
`casino.integration.test.ts` file provides some coverage here but does not test RLS isolation
across tenants.

---

## TypeScript Diagnostics

**Corrected 2026-03-14.** The original posture doc incorrectly characterized TS2322 errors as
"schema drift" detected by type-contract tests. Investigation proved this was wrong:

| Diagnostic | Files | Root Cause | Status |
|------------|-------|------------|--------|
| TS2307: Cannot find module `@/types/database.types` | `casino.integration`, `gaming-day-boundary.int`, `rpc-*.int` | `@/` path alias resolved by Jest `moduleNameMapper` but not by standalone `tsc`. Runtime-correct. | **Not a defect** |
| TS2322: Type `true` not assignable to `never` | `rpc-accept-staff-invite-abuse.int`, `rpc-bootstrap-casino-abuse.int`, `rpc-create-staff.int` | **Cascading artifact of TS2307.** When module is unresolvable, `Database` type is opaque, all conditional types evaluate to `never`. Under `tsconfig.json` (`tsc --noEmit -p tsconfig.json`): **zero errors.** RPC signatures match `database.types.ts` exactly. **No schema drift exists.** | **False positive — no action needed** |
| TS6133: `data` declared but never read | `casino.integration` (4 instances) | Unused destructured variables in negative-path tests. | **Fixed** (removed unused bindings) |

---

## Naming Anomalies

Four files use `.int.test.ts` naming but do NOT require a live Supabase instance:

| File | Actual Nature |
|------|---------------|
| `gaming-day-boundary.int.test.ts` | Uses mocked `supabase.rpc()`. Pure server-unit test. |
| `rpc-create-staff.int.test.ts` | Compile-time type assertions only. |
| `rpc-bootstrap-casino-abuse.int.test.ts` | Compile-time types + security documentation tests. |
| `rpc-accept-staff-invite-abuse.int.test.ts` | Compile-time types + security documentation tests. |

These files run under `jest.integration.config.js` but pass without `RUN_INTEGRATION_TESTS`
because they don't touch real infrastructure. They are honestly classified as Server-Unit (S3.3)
in this posture doc despite their file naming. Renaming is deferred to avoid churn — the naming
is a cosmetic issue, not a governance defect.

---

## Promotion Readiness

Casino meets S7 criterion 2: "At least one bounded context has achieved Trusted-Local."

| S7 Criterion | Status |
|-------------|--------|
| 1. Jest environments correctly split | Met (Slice One) |
| 2. At least one context Trusted-Local | **Met (Casino — 355/355, 0 skips)** |
| 3. Unit test execution in CI (advisory) | Not yet |
| 4. Stable signal observation period | Not yet |
| 5. Governance effectiveness validated | **Met (see Validation Report)** |

---

## Verification Commands

```bash
# Node-config unit tests (14 files, 355 passing, 0 skipped)
npx jest --config jest.node.config.js --testPathPatterns='services/casino/__tests__/.*\.test\.ts$'

# Full casino slice (convenience script)
npm run test:slice:casino

# Integration tests without live Supabase (5 files pass, 1 gated)
npx jest --config jest.integration.config.js --testPathPatterns='services/casino/'

# Integration tests with live Supabase (requires running instance)
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js --testPathPatterns='services/casino/'
```
