# Casino Exemplar Validation Report

**Date:** 2026-03-14
**Branch:** `testing-gov-remediation`
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue:** ISSUE-C4D2AA48
**Baseline:** commit `5ffc851` (Casino exemplar completion)
**Scope:** Answers three questions prior to bounded-context rollout

---

## Question 1: Is the Governance Effective?

**Verdict: Yes.** The casino exemplar demonstrates that the governance framework (ADR-044, TESTING_GOVERNANCE_STANDARD.md) produces actionable, honest test classification. 15 of 20 test files are **Effective**, 3 are **Partially Effective**, 1 is **Theatre** (correctly reclassified), and 1 is a misnamed integration file.

### Per-File Effectiveness Classification

| File | Layer (§3) | Classification | Evidence |
|------|-----------|----------------|----------|
| `schemas.test.ts` | Server-Unit | **Effective** | Pure Zod validation, no mocks. Rejects invalid inputs, verifies constraints. |
| `mappers.test.ts` | Server-Unit | **Effective** | Pure row→DTO transforms. Immutability, null handling, field exclusion verified. |
| `keys.test.ts` | Server-Unit | **Effective** | Deterministic key serialization. Cache stability, scope patterns. |
| `crud.unit.test.ts` | Server-Unit | **Effective** | Error code mapping (PG 23505→UNIQUE_VIOLATION, 23503→CASINO_NOT_FOUND, PGRST116→NOT_FOUND). Role constraint logic. |
| `bootstrap.test.ts` | Server-Unit | **Effective** | Side-effect orchestration (reconcileStaffClaims). RPC param mapping, error translation. |
| `gaming-day.test.ts` | Server-Unit | **Effective** | Pure temporal algorithm. Boundary, DST, month/year edge cases. |
| `gaming-day-boundary.int.test.ts` | Server-Unit | **Effective** | Temporal edge cases with mock RPCs. DST transitions, fail-closed behavior. |
| `game-settings.test.ts` | Server-Unit | **Effective** | Shoe decks, deck profiles, edge validation. Mapper + schema + CRUD. |
| `invite.test.ts` | Server-Unit | **Effective** | RPC delegation, error code translation, schema validation. |
| `settings-route.test.ts` | Server-Unit | **Effective** | Schema + DTO type checks. `.loose()` regression guard. |
| `onboarding-rpc-contract.test.ts` | Server-Unit | **Effective** | Compile-time type assertions: RPC args/returns vs Database types. |
| `rpc-create-staff.int.test.ts` | Server-Unit | **Effective** | ADR-024 INV-8 type contracts. No spoofable params. |
| `rpc-bootstrap-casino-abuse.int.test.ts` | Server-Unit | **Effective** | ADR-024 + abuse-case documentation. Security boundary matrix. |
| `rpc-accept-staff-invite-abuse.int.test.ts` | Server-Unit | **Effective** | ADR-024 + abuse-case matrix. Replay, role elevation, cross-casino prevention. |
| `setup-wizard-rpc.int.test.ts` | Integration | **Effective** | Canary exemplar (39 tests). Enum drift detection, algorithm determinism. |
| `casino.test.ts` | Server-Unit | **Partially Effective** | URL construction + error handling are real. Data pass-through assertions are mock theatre. Header contract now verified (idempotency key fix applied). |
| `service.test.ts` | Server-Unit | **Partially Effective** | Delegation is mock pass-through. Error propagation and interface contract are real. |
| `casino.integration.test.ts` | Integration | **Partially Effective** | Real Supabase (gated). Tests constraints + RPCs. No cross-tenant isolation test. |
| `http-contract.test.ts` | Smoke | **Theatre** | `typeof === 'function'` only. Correctly reclassified per §9.2. |
| `settings-route-boundary.test.ts` | Route-Handler | **Effective** | Real handler invocation. Status codes, body shape, casino_id passthrough. |

### Governance Corrections Discovered During Validation

The validation itself surfaced corrections — this is proof the governance is working:

1. **TS2322 "schema drift" was a false positive.** The posture doc claimed RPC type contracts were detecting real schema drift. Investigation proved all TS2322 errors cascade from TS2307 (path alias `@/` unresolvable without `--project`). Under `tsconfig.json`: **zero type errors**. The RPC signatures match `database.types.ts` exactly. **No action needed.**

2. **7 skipped tests were fixable and fixed.** The skip registry documented exit criteria. Both were executed in this session:
   - `casino.test.ts` (6 skips): `IDEMPOTENCY_HEADER` constant changed to `'Idempotency-Key'` (IETF title case). Tests updated to match.
   - `crud.unit.test.ts` (1 skip): Added `jest.mock('@/lib/supabase/claims-reconcile')` matching `bootstrap.test.ts` pattern.

3. **4 TS6133 unused `data` variables cleaned up** in `casino.integration.test.ts`.

### Casino Exemplar Post-Validation State

| Metric | Before Validation | After Validation |
|--------|-------------------|------------------|
| Passing tests | 348 | **355** |
| Skipped tests | 7 | **0** |
| TS diagnostics (project config) | 0 | 0 |
| Unused variables | 4 | **0** |
| Test files | 20 | 20 |
| Effective/Partially Effective | 15/2 | 15/3 (casino.test.ts promoted by header fix) |

---

## Question 2: Emergent Error Matrix

Full node test suite run (`jest.node.config.js`) surfaced **182 failures across 25 test files** that were invisible under the previous regime. These failures were masked by: (a) wrong runtime (jsdom hiding node errors), (b) no CI gate, (c) never being run.

### Summary

| Metric | Value |
|--------|-------|
| Test suites | 183 total |
| Suites passing | 158 (86.3%) |
| Suites failing | 25 (13.7%) |
| Tests passing | 2514 |
| Tests failing | 182 |
| Tests skipped | 1 |
| Tests todo | 71 |
| Failure rate | 6.6% |

### Error Classification Matrix

Failures organized by root cause category:

#### Category A: RPC/Schema Drift (99 failures, 5 files)

Mock data structures no longer match actual RPC return shapes. The service layer evolved; tests were not updated.

| File | Failures | Root Cause |
|------|----------|------------|
| `services/rating-slip-modal/__tests__/rpc-contract.test.ts` | 33 | `DomainError: Invalid RPC response structure` — mock data doesn't match evolved `rpc_get_rating_slip_modal_data` return shape |
| `services/rating-slip-modal/__tests__/rpc.test.ts` | 22 | Same — stale mock data for modal RPC |
| `services/rating-slip-modal/__tests__/rpc-security.test.ts` | 10 | Same — security tests use same stale mock structure |
| `services/loyalty/__tests__/crud.test.ts` | 19 | Stale mock data for loyalty CRUD operations |
| `services/rating-slip/__tests__/rating-slip.service.test.ts` | 15 | `TypeError: Cannot destructure 'data'` — service API changed, mock setup stale |

**Remediation:** Update mock data fixtures to match current RPC/service return shapes. These are the highest-value fixes — they validate real business logic once mocks align.

#### Category B: Idempotency Header Casing (14 failures, 3 files)

Same root cause as the casino exemplar fix: `'idempotency-key'` → `'Idempotency-Key'`.

| File | Failures | Root Cause |
|------|----------|------------|
| `services/visit/__tests__/visit.service.test.ts` | 5 | Stale header casing in HTTP fetcher assertions |
| `services/player/__tests__/player.service.test.ts` | 5 | Same |
| `app/api/v1/visits/__tests__/route.test.ts` | 4 | Same |

**Remediation:** Mechanical find-replace of `'idempotency-key'` → `'Idempotency-Key'` in test expectations. Identical to the casino exemplar fix.

#### Category C: Missing Mock / Stale Mock Setup (29 failures, 5 files)

Service internals changed (e.g., new RPC calls, changed middleware), but test mocks weren't updated.

| File | Failures | Root Cause |
|------|----------|------------|
| `app/actions/auth/__tests__/set-pin.test.ts` | 3 | `TypeError: supabase.rpc is not a function` — mock missing `rpc` method |
| `services/rating-slip/__tests__/rating-slip-move-pooling.test.ts` | 8 | `AuthApiError: invalid JWT` — tests hitting real auth without proper mock setup |
| `app/api/v1/rating-slips/[id]/move/__tests__/route.test.ts` | 2 | Route handler mock setup incomplete |
| `lib/server-actions/middleware/__tests__/rls.test.ts` | 6 | Middleware shape changed, assertions stale |
| `lib/server-actions/middleware/__tests__/auth-chain-entrypoints.test.ts` | 4 | Auth chain entrypoint assertions stale |
| `lib/query/__tests__/client.test.ts` | 6 | Query client API changed |

**Remediation:** Update mock setup to match current API surfaces. Each fix is localized to the test file.

#### Category D: Integration Tests Without Gating (16 failures, 4 files)

Tests that require live Supabase but lack `RUN_INTEGRATION_TESTS` environment gating. They crash with `TypeError: Cannot read properties of null` when creating test users/data.

| File | Failures | Root Cause |
|------|----------|------------|
| `__tests__/integration/player-identity.test.ts` | 4 | No `RUN_INTEGRATION_TESTS` gate, tries real Supabase ops |
| `__tests__/constraints/player-identity.test.ts` | 4 | Same |
| `__tests__/rls/player-identity.test.ts` | 4 | Same |
| `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | 4 | Same |

**Remediation:** Add `RUN_INTEGRATION_TESTS` environment gate (matching `casino.integration.test.ts` pattern). Or rename to `.int.test.ts` to exclude from node config.

#### Category E: Unit Math / Logic Drift (8 failures, 2 files)

Tests asserting stale business logic values.

| File | Failures | Root Cause |
|------|----------|------------|
| `services/visit/__tests__/visit-continuation.test.ts` | 5 | `Expected: -50, Received: -0.5` — cents-to-dollars conversion changed, test expects old unit |
| `__tests__/services/loyalty/promo-instruments.test.ts` | 3 | Mock data / expected values diverged from current implementation |

**Remediation:** Verify which unit system the service actually uses, update test expectations to match.

#### Category F: Route Handler Assertion Drift (12 failures, 4 files)

Route handler tests asserting stale response shapes or status codes.

| File | Failures | Root Cause |
|------|----------|------------|
| `app/api/v1/mtl/entries/__tests__/route.test.ts` | 4 | `Expected: 200, Received: 500` — route handler behavior changed |
| `app/api/v1/mtl/entries/[entryId]/__tests__/route.test.ts` | 3 | Same |
| `app/api/v1/mtl/entries/[entryId]/audit-notes/__tests__/route.test.ts` | 3 | Same |
| `app/api/v1/players/[playerId]/enroll/__tests__/route.test.ts` | 2 | `Expected: < 300` — enrollment route error handling changed |

**Remediation:** Investigate whether route handlers or test expectations are wrong. These may surface real bugs.

#### Category G: Architecture Contract Drift (4 failures, 1 file)

| File | Failures | Root Cause |
|------|----------|------------|
| `__tests__/slad/player-identity-ownership.test.ts` | 4 | `Expected: "function", Received: "undefined"` — SLAD contract test expects exports that no longer exist |

**Remediation:** Verify SLAD ownership model is current. May indicate real architectural drift.

### Error Matrix Heat Map

| Category | Files | Failures | Severity | Fix Effort |
|----------|-------|----------|----------|------------|
| **A. RPC/Schema Drift** | 5 | 99 | **High** — real business logic hidden | Medium (mock data update) |
| **B. Header Casing** | 3 | 14 | Low — mechanical fix | Trivial |
| **C. Missing Mocks** | 6 | 29 | Medium — API surface changed | Low-Medium |
| **D. Ungated Integration** | 4 | 16 | Medium — crashes without infra | Trivial (add gate) |
| **E. Unit Drift** | 2 | 8 | **High** — may be real bugs | Low (investigation) |
| **F. Route Handler Drift** | 4 | 12 | **High** — may be real bugs | Medium (investigation) |
| **G. Architecture Drift** | 1 | 4 | Medium — SLAD contract stale | Low |
| **Total** | **25** | **182** | | |

### Top Priority Fixes

1. **Category D** (16 failures): Add `RUN_INTEGRATION_TESTS` gate. 4 files, 10 minutes. Removes all crashes.
2. **Category B** (14 failures): `'idempotency-key'` → `'Idempotency-Key'`. 3 files, mechanical.
3. **Category E** (8 failures): Investigate cents-vs-dollars. `visit-continuation` returning `-0.5` instead of `-50` may indicate a real production bug or intentional unit change.
4. **Category F** (12 failures): MTL routes returning 500 instead of 200. Investigate whether the routes are broken or the test expectations are stale.
5. **Category A** (99 failures): Highest count but lowest urgency — these are mock alignment issues. Fix as each context is rolled.

---

## Question 3: Updated System Posture

### Pre-Exemplar State (ISSUE-C4D2AA48 Investigation)

| Finding | Status |
|---------|--------|
| 0 functional test gates in CI | **Unchanged** — CI still has no test gate |
| `main` branch unprotected | **Unchanged** — no branch protection |
| 81 tests in wrong runtime (jsdom) | **Fixed for Casino context** (20 files under correct node config) |
| 67 route handler theatre tests | **Unchanged** — frozen per §9.1, exemplar (`settings-route-boundary.test.ts`) produced |
| No integration test gating | **Partially fixed** — casino exemplar has gate; 4 ungated files discovered (Category D) |

### Post-Exemplar State

| Metric | Before Exemplar | After Exemplar |
|--------|----------------|----------------|
| Bounded contexts at Trusted-Local | 0 | **1 (Casino)** |
| Jest environment split | None | **Active** (`jest.node.config.js` + `jest.integration.config.js`) |
| Casino passing tests | Unknown (wrong runtime) | **355 passing, 0 skipped, 0 failed** |
| Full node suite visibility | None | **2514 passing, 182 failing, 25 files affected** |
| Error categories identified | 0 | **7 categories (A-G)** |
| Governance effectiveness | Unproven | **Validated — 15/20 files Effective, 3 Partially Effective** |
| Skip registry | Not practiced | **Active — 7 skips documented with exit criteria, all 7 resolved** |

### Systemic Failure Audit Update

The original investigation identified a **systemic failure**: tests existed but never ran, providing false confidence. The casino exemplar validates that the remediation framework works:

1. **Runtime split works.** Node config correctly isolates server-side tests. 158 of 183 suites pass under correct environment.
2. **Governance taxonomy works.** The §3 canonical classification accurately distinguishes effective tests from theatre. The §9 shallow-test policy correctly reclassified `http-contract.test.ts`.
3. **Skip discipline works.** All 7 Casino skips had documented exit criteria. All 7 were resolved in the first validation pass.
4. **Error surfacing works.** Running the node config for the first time exposed 182 failures across 7 categories. These were invisible under the old regime. The error matrix now provides a prioritized remediation path.

### What Remains Broken

| Area | State | Remediation Phase |
|------|-------|-------------------|
| CI test gate | Not implemented | Phase 3 (Move 7) |
| Branch protection | Not enabled | Phase 4 (Move 9) |
| 14 bounded contexts without exemplar treatment | Untreated | Phase 2 (incremental rollout) |
| 182 failing tests (25 files) | Newly visible, unresolved | Prioritized by error matrix |
| 71 todo tests | Not investigated | Deferred |
| Route handler theatre (67 files) | Frozen, not replaced | Phase 2 (Move 6) |
| Cypress dead wood | Not removed | Phase 2 (Move 6) |

### Promotion Readiness (§7)

| Criterion | Status |
|-----------|--------|
| 1. Jest environments correctly split | **Met** |
| 2. At least one context Trusted-Local | **Met (Casino — 355/355 passing)** |
| 3. Unit test execution in CI (advisory) | Not yet |
| 4. Stable signal observation period | Not yet |
| 5. Error matrix established | **Met (this document)** |

### Recommended Next Steps

1. **Fix Category D** (ungated integration tests) — trivial, reduces noise by 16 failures
2. **Fix Category B** (header casing) — mechanical, reduces by 14 failures
3. **Investigate Category E** (cents vs dollars) — may be a real production bug
4. **Investigate Category F** (MTL routes returning 500) — may be real route breakage
5. **Roll exemplar to Player context** — next bounded context per CONTEXT-ROLLOUT-TEMPLATE.md
6. **Wire CI advisory gate** (Phase 3, Move 7) — once node suite has < 50 failures

---

## References

- `TESTING-GOVERNANCE-REMEDIATION.md` — master remediation plan
- `CASINO-EXEMPLAR-POSTURE.md` — casino layer health (needs update per this report)
- `CASINO-EXEMPLAR-COMPLETION-SUMMARY.md` — slice-1 delivery record
- `CONTEXT-ROLLOUT-TEMPLATE.md` — rollout checklist for next contexts
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — operational rulebook v2.0.0
- `docs/80-adrs/ADR-044-testing-governance-posture.md` — durable decision record
