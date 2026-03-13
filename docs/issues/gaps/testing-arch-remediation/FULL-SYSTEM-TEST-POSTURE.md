# Full System Test Posture Assessment

**Parent**: INVESTIGATION-REPORT.md (ISSUE-C4D2AA48)
**Date**: 2026-03-12
**Scope**: ALL test categories — unit, integration, E2E, CI enforcement
**Finding**: The testing failure is **systemic**, not limited to integration tests

---

## Verdict

| Test Category | Health | Files | Runs in CI? | Blocks Merge? |
|---------------|--------|-------|-------------|---------------|
| **Unit Tests** | **COMPROMISED** | ~2,571 | NO | NO |
| **Integration Tests** | **COMPROMISED** | 41 | NO | NO |
| **E2E Tests (Playwright)** | **DEGRADED** | 16 | NO | NO |
| **E2E Tests (Cypress)** | **DEAD** | 3 | NO | NO |
| **Security Gates (SQL)** | HEALTHY | 9 scripts | YES | YES (migration PRs) |
| **Lint** | HEALTHY | — | YES | YES |
| **Type Check** | HEALTHY | — | YES | YES |
| **Build** | HEALTHY | — | YES | YES |

**Zero functional tests block merge.** "Green CI" means the code compiles, lints clean, and builds. It says nothing about whether the code works.

---

## Unit Tests: COMPROMISED

The original remediation plan focused exclusively on integration tests. The unit test suite has its own compounding failures.

### Environment Misclassification (Same Root Cause)

The `jsdom` default doesn't just break integration tests — it misclassifies the majority of unit tests too:

| Unit Test Category | Files | Correct Env | Actual Env | Status |
|--------------------|-------|-------------|------------|--------|
| Route handlers | 67 | node | **node** | Correct (have `@jest-environment node` docblock) |
| Service layer | 81 | node | **jsdom** (63 of 81) | 78% WRONG |
| Lib/utilities | 18 | node | **jsdom** (all 18) | 100% WRONG |
| Components | 22 | jsdom | **jsdom** | Correct |
| Hooks | 16 | jsdom | **jsdom** | Correct (but tests are failing) |

**81 server-side unit tests run under jsdom unnecessarily.** While this doesn't break them the way it breaks integration tests (unit tests mock Supabase rather than calling it), it means:
- Node-specific APIs may behave differently
- `fetch` is overwritten (affects any test touching fetch utilities)
- False sense of coverage — tests pass in an environment that doesn't match production

### Route Handler Tests: Testing Theatre

67 route handler tests exist with correct `@jest-environment node` docblocks. However, **they mock everything so thoroughly that they test nothing**:

```typescript
// Typical pattern across 67 route handler tests:
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/server-actions/middleware', () => ({ withServerAction: jest.fn() }))
jest.mock('@/services/casino', () => ({ createCasinoService: jest.fn() }))

test('exports GET handler', () => {
  expect(GET).toBeDefined()  // This is all it checks
})
```

These tests verify that handler functions exist and can be imported. They don't test:
- Request validation
- Parameter handling
- Error responses
- Actual service integration
- HTTP status codes
- Response shapes

**Assessment**: These 67 tests create the illusion of coverage without providing safety.

### Hook Tests: Observable Failures

Hook tests using TanStack Query are demonstrably failing:
- `use-player-summary.test.tsx`: 8+ failures
- Pattern: `waitFor()` expecting data that never arrives
- Root cause: Mock service responses not integrating with QueryClientProvider
- These failures are **silent** because no one runs them in CI

### Flakiness Indicators

| Pattern | Count | Risk |
|---------|-------|------|
| `Date` / `Date.now` references in tests | 2,421 | HIGH — time-dependent assertions |
| `jest.useFakeTimers()` (proper mocking) | 3 | Almost none — 2,400+ Date refs unmocked |
| `setTimeout` / `setInterval` in tests | 166 | Race conditions |
| `as any` casts in test code | 864 | Type safety bypassed |
| `Math.random()` without seeds | 167 | Non-deterministic |
| `test.skip` / `xtest` | 7 | Acceptable (low count) |
| Console suppression spies | 12 | Acceptable |

**2,421 time-dependent assertions with only 3 proper fake timer setups** means the vast majority of time-sensitive tests are non-deterministic.

### Mock Quality

**Good**: MockQueryBuilder pattern in services is well-designed and consistent.

**Bad**: 864 `as any` casts in test code bypass the type system. Mock implementations aren't validated against current function signatures — they could drift silently.

---

## E2E Tests: DEGRADED

### Strengths

The E2E infrastructure is the healthiest part of the test system:
- Playwright config is modern and well-structured (`playwright.config.ts`)
- Fixture infrastructure is mature (`e2e/fixtures/` — 23 fixture files)
- Active development — E2E tests added with nearly every feature (last 3 weeks)
- Smart skip patterns for optional/auth-dependent features
- Good selector discipline (mostly `data-testid` and ARIA roles)
- Proper cleanup and test isolation via timestamps

### Weaknesses

| Issue | Severity | Details |
|-------|----------|---------|
| Not in CI | HIGH | Zero E2E enforcement on merge |
| Cashier workflow unimplemented | HIGH | 8 `test.fixme()` placeholders, 0% coverage |
| Hardcoded waits | MEDIUM | 5 instances of `page.waitForTimeout()` — flaky |
| Legacy Cypress tests abandoned | LOW | 3 files with obsolete selectors, not maintained |
| Incomplete tests | MEDIUM | `visit-continuation.spec.ts` ends mid-test |
| Seed data dependency | MEDIUM | `loyalty-accrual.spec.ts` relies on hardcoded seed IDs |

### Playwright Test Inventory (16 specs)

**Well-maintained (7)**:
- `setup-wizard.spec.ts` (PRD-030) — 5-step wizard, fixture-backed
- `loyalty-accrual-lifecycle.spec.ts` — Full accrual pipeline
- `admin-settings.spec.ts` (EXEC-042) — 8 threshold categories
- `shift-dashboard-v3-layout.spec.ts` (PRD-026) — Auth + data assertions
- `player-360-navigation.spec.ts` (PRD-022) — Redirect validation
- `csv-player-import.spec.ts` (PRD-037) — 6-step wizard
- `admin-alerts.spec.ts` (EXEC-040) — Role-based access

**Partially maintained (5)**:
- `player-360-panels.spec.ts` — Auth-gated skip
- `move-player.spec.ts` — Hardcoded waits, timing-brittle
- `rating-slip-modal.spec.ts` — Hardcoded waits
- `visit-continuation.spec.ts` — Incomplete
- `mtl-threshold-notifications.spec.ts` — 3s hardcoded wait

**Unimplemented (1)**:
- `cashier-workflow.spec.ts` — 8 `test.fixme()`, zero assertions

**Legacy/Dead (3 Cypress)**:
- `player-management.cy.ts`, `visit-management.cy.ts`, `rating-slip-lifecycle.cy.ts`
- Obsolete selectors (`#email`, `#firstName`), not maintained

---

## CI Enforcement: Zero Functional Gates

### What CI Actually Checks

```
ci.yml pipeline:
  ✅ Env drift guard (grep for leaked keys)
  ✅ ESLint
  ✅ TypeScript strict type-check
  ✅ Next.js production build
  ❌ No unit tests
  ❌ No integration tests
  ❌ No E2E tests
```

### What Merge-Blocks Exist

| Gate | Enforced Where | Scope |
|------|---------------|-------|
| Lint | CI (ci.yml) | All PRs |
| Type check | CI (ci.yml) | All PRs |
| Build | CI (ci.yml) | All PRs |
| Security SQL gates | CI (security-gates.yml) | Migration PRs only |
| Migration lint | CI (migration-lint.yml) | Migration PRs only |
| SRM doc links | CI (check-srm-links.yml) | Doc-change PRs only |
| 7 pre-commit hooks | Local only (.husky/) | Developer machine only |
| Unit tests | **NOWHERE** | — |
| Integration tests | **NOWHERE** | — |
| E2E tests | **NOWHERE** | — |
| Coverage thresholds | **NOWHERE** | Defined in jest.config.js but never evaluated |

### Branch Protection

**`main` branch is NOT protected.** No required status checks. Direct push to main is allowed.

### What Can Ship Undetected

Given only compile-time gates, these bug categories merge freely:

1. **Runtime logic bugs** — Service methods that type-check but return wrong data
2. **API contract violations** — Route handlers returning wrong status codes or shapes
3. **Business rule errors** — Loyalty miscalculations, gaming day boundary errors
4. **Multi-tenancy leaks** — Casino ID leakage in service layer (RLS is checked at SQL level, but JS-side enforcement isn't tested)
5. **State machine violations** — Rating slip or visit lifecycle state transitions
6. **Concurrency bugs** — Race conditions in ledger operations
7. **Data corruption** — Incorrect insert/update payloads that pass type checking

### Documentation vs Reality

QA-001 prescribes a testing pyramid (60% unit / 30% integration / 10% E2E) with coverage targets up to 90%. The CI/CD Pipeline Spec (`CICD-PIPELINE-SPEC.md`) documents a "Gate 4: Test" step with `npm run test:ci` and coverage reporting.

**Gate 4 was never implemented.** The spec describes aspiration, not reality.

---

## Root Cause: Compounding System Failure

The testing breakdown isn't a single issue — it's five failures reinforcing each other:

```
1. jest.config.js: testEnvironment: 'jsdom'
   → Misclassifies server-side tests
   → Integration tests can't reach Supabase
   → Unit tests run in wrong environment (masked by mocking)

2. ci.yml: no test step
   → Nobody knows if tests pass
   → Broken tests accumulate silently
   → No feedback loop on test quality

3. package.json test:ci: excludes integration patterns
   → Even if CI ran tests, integration tests would be skipped
   → Creates false confidence ("test:ci passes!")

4. No branch protection on main
   → CI results are advisory, not blocking
   → Direct push bypasses everything

5. Route handler test pattern: mock everything
   → 67 tests that check function existence
   → Coverage metrics inflate without safety
   → Creates illusion of well-tested codebase
```

Each failure makes the others harder to detect. The jsdom default is masked by mocking. The CI gap is masked by the misleading `test:ci` script. The branch protection gap makes even the working gates optional.

---

## Revised Blast Radius

### Original Plan's Assessment (Integration Only)

The remediation plan scoped the problem as 39 integration test files needing environment fixes, with a phased recovery from canary to CI enforcement.

### Actual Blast Radius

| Category | Affected Files | Nature of Problem |
|----------|---------------|-------------------|
| Integration tests (environment) | 41 | jsdom kills fetch — tests can't run |
| Service unit tests (environment) | 63 | jsdom for server code — wrong but masked by mocks |
| Lib unit tests (environment) | 18 | jsdom for server code — wrong but masked by mocks |
| Route handler tests (depth) | 67 | Correct env, but tests are shallow theatre |
| Hook tests (broken) | 16 | Observable failures in async patterns |
| E2E tests (enforcement) | 16 | Well-written but never run in CI |
| Cypress tests (dead) | 3 | Obsolete selectors, abandoned |
| CI pipeline (missing gate) | ALL | No test step, no branch protection |
| Coverage thresholds (unenforced) | 2 modules | Defined but never evaluated |
| Time-dependent tests (flaky) | ~2,400 refs | 3 proper fake timer setups across entire codebase |

**Total files with some form of compromise: ~224 out of ~2,688 test files**

But the CI enforcement gap affects **all 2,688** — even tests that are correctly written provide zero merge safety because nothing runs them.

---

## Recommendations

### Immediate (This Week)

1. **Enable branch protection on `main`** — Require ci.yml to pass, require PR review
2. **Add `npm run test:ci` to ci.yml** — Even without integration tests, running unit tests catches observable failures (hook tests, import errors)
3. **Delete 3 dead Cypress tests** — They provide no value and mislead about coverage

### Short-Term (Phase 0 Expanded)

4. **Create `jest.integration.config.ts`** — As specified in original remediation plan
5. **Add `@jest-environment node` to 81 service/lib unit tests** — Or better: create a separate `jest.unit-server.config.ts` with `testEnvironment: 'node'`
6. **Triage route handler test depth** — Decide: deepen them or acknowledge they're smoke tests
7. **Fix hook test failures** — These are real bugs in test code

### Medium-Term (Phase 1-3)

8. **Integration test canary** — Per original plan (validated by investigation)
9. **Add Playwright smoke test to CI** — Even 2-3 critical path specs would catch UI regressions
10. **Address time-dependent test flakiness** — Introduce `jest.useFakeTimers()` pattern for Date-heavy tests
11. **Reduce `as any` count** — 864 casts undermine type safety in tests

### Disposition of Original Remediation Plan

The original 7-phase plan (Phase 0-6) remains valid for integration tests. This assessment expands the scope:

| Original Phase | Status | Expansion Needed |
|----------------|--------|-----------------|
| Phase 0 (taxonomy) | Valid | Add unit test environment classification |
| Phase 1 (canary) | Valid | No change |
| Phase 2 (shared infra) | Valid, scope reduced | Schema drift is minimal (0.6/10) |
| Phase 3 (bounded context) | Valid | No change |
| Phase 4 (canary suite) | Valid | No change |
| Phase 5 (CI enforcement) | Valid | Expand: add unit tests + branch protection |
| Phase 6 (broaden) | Valid | Add E2E smoke tests, route handler depth |

---

## Cross-References

| Document | Relevance |
|----------|-----------|
| INTEGRATION-TEST-REMEDIATION-PLAN.md | Original plan — validated, scope expanded |
| INVESTIGATION-REPORT.md | First investigation — integration-focused findings |
| QA-001-service-testing-strategy.md | Aspirational testing pyramid — not enforced |
| CICD-PIPELINE-SPEC.md | Documents "Gate 4: Test" — never implemented |
| ADR-002-test-file-organization.md | `__tests__/` standard — some violations found |
| jest.config.js | Root cause — `testEnvironment: 'jsdom'` |
| .github/workflows/ci.yml | Root cause — no test step |
