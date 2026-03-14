# Testing Governance Remediation

**Issue**: ISSUE-C4D2AA48
**Date**: 2026-03-13
**Prerequisites**: INVESTIGATION-REPORT.md, FULL-SYSTEM-TEST-POSTURE.md, ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Status**: Proposed — pending local truth restoration
**Profile**: Solo-Repo Transitional (per TESTING_GOVERNANCE_STANDARD.md §1)

---

## Purpose

This document is the remediation plan for restoring honest test execution in the repository.

It does not define standing testing law. It defines the ordered implementation work required to achieve truthful local verification first, then promote enforcement incrementally.

> Where this document references trusted-local, advisory, required, or green semantics, the normative definitions live in `TESTING_GOVERNANCE_STANDARD.md` v2.0.0.

### Governing Remediation Principle

> **Restore truthful local verification first. Promote enforcement later.**

The investigation confirmed real technical defects (wrong runtimes, silent exclusions, theatre tests, zero functional CI gates). Those defects require remediation. What they do not require is immediate enterprise-style branch protection and mandatory peer review as prerequisites. The correct first move is to fix the harness, not to erect ceremony around a broken one.

---

## 1. Test Layer Registry

| Layer | File Count | Required Env | What It Proves | CI Status | Current Condition |
|-------|-----------|-------------|----------------|-----------|---------|
| Unit: components | 22 | jsdom | Render logic, user interaction | NOT RUN | OK — correct env |
| Unit: hooks | 16 | jsdom | Hook contracts, state transitions | NOT RUN | BROKEN — observable failures |
| Unit: services/lib | ~99 | **node** | Business logic, data transforms | NOT RUN | COMPROMISED — 81/99 run under jsdom, masks fetch/crypto/Buffer bugs |
| Unit: route handlers | 67 | node | Request→Response contracts | NOT RUN | THEATRE — mocks everything, asserts function existence only |
| Integration | 41 | node + Supabase | Service↔DB round-trips, RLS enforcement | NOT RUN, excluded by `test:ci` | DEAD — jsdom kills native fetch, `test:ci` pattern excludes them |
| E2E: Playwright | 16 | browser + running app | User flows, multi-page state | NOT RUN | DEGRADED — well-authored, not wired to CI |
| E2E: Cypress | 3 | browser + running app | (nothing) | NOT RUN | DEAD — obsolete selectors, abandoned framework |
| Security SQL gates | 9 | pgTAP / psql | RLS policy correctness, migration safety | **RUN** (migration PRs) | HEALTHY |
| Pre-commit hooks | 7 | local shell | Naming, lint, structural rules | Local only | BYPASSABLE — `--no-verify` skips all |

**Environment verification** (grep-confirmed): 67 route handler tests have `@jest-environment node`. 18 service tests have it (all `http-contract.test.ts`). 0 lib tests have it. Remaining 63 service + 18 lib = **81 server-side tests default to jsdom**.

**Summary**: 1 of 8 test layers runs in CI. Coverage thresholds are defined in `jest.config.js` but never evaluated because no CI job invokes Jest.

---

## 2. Conformance Targets

This section describes the target state for each remediation phase. Permanent governance definitions are owned by `TESTING_GOVERNANCE_STANDARD.md`.

### Target A — Trusted-local verification (Phase 1 exit)

Split unit execution (node + jsdom), truthful test scripts, and one bounded-context exemplar running correctly on the developer's machine. No CI or branch protection required at this stage.

> Fix the harness before wiring it to enforcement.

### Target B — Expanded bounded-context coverage (Phase 2 exit)

Multiple bounded contexts restored to trusted-local status. Broken hook tests triaged. Route-handler theatre reclassified honestly. Cypress dead wood removed.

### Target C — CI visibility (Phase 3 exit)

Unit tests running in CI on every PR (advisory first — `continue-on-error: true`). Playwright and integration tests wired to CI as advisory. CI provides signal without yet blocking merge.

### Target D — Governance-grade enforcement (Phase 4 exit)

Branch protection enabled on `main`. At least one functional test layer promoted to required status check. CI jobs earn merge-blocking authority after demonstrating stable signal.

### Target E — Incremental replacement strategy (ongoing)

Test honesty is restored incrementally in the services being actively touched. No centralized rewrite sprint. Route-handler remediation follows `TESTING_GOVERNANCE_STANDARD.md` §9: freeze net-new shallow tests, retain honest smoke where useful, quarantine only misleading outliers, and replace incrementally with behavioral exemplars.

---

## 3. Remediation Rollout

Ordered by dependency. Each phase unblocks the next. Local truth is established before CI is wired, and CI is wired before enforcement is activated.

---

### Phase 1 — Restore Local Truth ← START HERE

The first-order correction. No CI changes. No branch protection. Just make the tests honest on the developer's machine.

#### Move 1: Split Jest config by environment

Add `jest.node.config.js` for `services/`, `lib/`, `app/api/` (testEnvironment: `'node'`). Keep `jest.jsdom.config.js` for `components/`, `hooks/`. Root `jest.config.js` becomes a multi-project config using `projects: []`. **Unblocks**: correct test execution for 81 misclassified files. **Effort**: 2-3h.

#### Move 2: Fix test script truthfulness

Remove or rename the misleading `test:ci` script. Replace with scripts that truthfully reflect what they run:
- `test:unit` — runs both node and jsdom project configs
- `test:integration` — runs integration config (requires Supabase)
- `test:all` — runs everything that can run locally

Remove silent exclusion patterns. If a test class is excluded, the script name and documentation must say so. **Unblocks**: no more commands that lie about their scope. **Effort**: 1h.

#### Move 3: Route handler test exemplar

Write one exemplar route handler test that uses real request/response objects (no full `NextRequest` mock), calls the handler, and asserts status + body + error paths. Document the pattern. Freeze the old pattern via an ESLint rule or PR review checklist. **Unblocks**: a template for replacing theatre tests. **Effort**: 2-3h.

#### Move 4: Bounded-context exemplar

Pick one bounded context (e.g., `services/loyalty/` — it has existing coverage thresholds). Restore its server-unit tests to the correct runtime. Confirm they produce meaningful assertions. Run locally until the slice is trusted.

**Exit condition**: one bounded context has a truthful, locally green test slice in the correct runtime, with at least one real behavioral canary.

**Effort**: 2-3h.

**Phase 1 total effort**: 7-10h.

---

### Phase 2 — Expand by Bounded Context

Extend trusted-local status to additional bounded contexts. No rush. One context at a time.

#### Move 5: Triage the 16 broken hook tests

Run them under jsdom, capture failures, file issues or fix. These are likely stale mocks or missing providers. **Unblocks**: honest test count — no known-broken tests in the green suite. **Effort**: 3-4h.

#### Move 6: Reclassify route handler tests and burn dead wood

Delete 3 Cypress files and `cypress/` directory. Remove Cypress from `testPathIgnorePatterns`. For the 67 shallow route handler tests:

- **Freeze the anti-pattern**: prohibit creation of new tests in the same shallow style.
- **Relabel honestly**: reclassify existing shallow tests as smoke coverage where they still provide minimal module/wiring assurance.
- **Quarantine worst offenders**: only tests that are actively misleading or noisy get `describe.skip('QUARANTINE:')` — not a blanket skip of the entire class.
- **Replace incrementally**: as the developer touches a service, they replace the shallow test with a behavioral one following the Move 3 exemplar.

**Unblocks**: honest file counts without creating an observability cliff. **Effort**: 2-3h.

#### Incremental context restoration

For each additional bounded context:
1. Restore its server-unit tests to correct environment and honest assertions
2. Restore or wire its integration tests if applicable
3. Replace any shallow route-handler tests for its routes using the Move 3 exemplar
4. Confirm a trusted local green baseline for that context

Do not attempt to restore the entire test posture as one undifferentiated blob. Each slice must produce a trusted green baseline before expansion.

**Phase 2 effort**: 5-7h (Moves 5-6) + ongoing incremental work.

---

### Phase 3 — Add Lightweight CI Automation

Only after local trust exists. CI provides signal first, enforcement later.

#### Move 7: Add unit test step to CI (advisory)

Add a `test` job to `ci.yml` that runs `npx jest --ci --projects jest.node.config.js jest.jsdom.config.js --maxWorkers=2`. Wire coverage threshold evaluation into this step. Initially run as `continue-on-error: true` (advisory). The job provides visibility into test health on every PR without blocking merge.

**Unblocks**: tests run automatically, regressions become visible. **Effort**: 1-2h.

#### Move 8: Wire Playwright and integration tests into CI (advisory)

Add a `playwright` job that starts the app and runs `npx playwright test`. Add an `integration` job with a dedicated `jest.integration.config.js` against a Supabase container. Both run as `continue-on-error: true` (advisory).

**Unblocks**: E2E and integration regression detection. **Effort**: 6-8h combined.

**Phase 3 effort**: 7-10h.

---

### Phase 4 — Promote Enforcement

Only when the CI signal is stable and trusted. Enforcement is earned, not imposed.

#### Move 9: Enable branch protection on `main`

**Promotion criteria** (all must be met before activation):

1. Jest environments are correctly split (Phase 1 complete)
2. At least one bounded context is trusted-local (Phase 1 complete)
3. Unit tests run in CI advisory mode with stable green signal
4. No systematic false positives or flaky failures in CI test jobs

When criteria are met:

```bash
# Require CI checks to pass before merge to main.
# Block direct pushes and force pushes.
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["checks","test"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

Replace `{owner}/{repo}` with the actual values (e.g., `diepulp/pt-2`).

**Note on PR approvals**: `required_approving_review_count: 1` is included for completeness. In a solo-developer workflow this can be set to `0` or omitted if the repo settings allow it. The meaningful enforcement is the required status checks, not peer review ceremony.

#### Move 10: Promote CI jobs to required

After branch protection is active:
1. Promote the `test` job from advisory to required status check
2. Promote Playwright and integration jobs as they demonstrate stability
3. Expand the required set over time as layers earn trust

**Phase 4 effort**: 1-2h (configuration only — the work is already done).

---

### Effort Summary

| Phase | Moves | Effort |
|-------|-------|--------|
| Phase 1 — Restore Local Truth | 1-4 | 7-10h |
| Phase 2 — Expand by Bounded Context | 5-6 + ongoing | 5-7h + incremental |
| Phase 3 — Add Lightweight CI | 7-8 | 7-10h |
| Phase 4 — Promote Enforcement | 9-10 | 1-2h |
| **Total** | **1-10** | **20-29h** |

---

## 4. Practical Operating Rules

These rules apply immediately, from Phase 1 onward.

1. **Do not claim "green" unless you say what is green.** Distinguish: static green, local functional green, CI green.

2. **No silent exclusions.** If a class of tests is skipped, excluded, or env-gated, state it plainly.

3. **No wrong-runtime execution.** Passing under the wrong environment is false comfort.

4. **No new shallow handler theatre.** Freeze the anti-pattern now.

5. **Prefer one honest slice over broad fake coverage.** A single trusted bounded-context exemplar is worth more than dozens of misleading tests.

6. **Promotion is earned.** Do not make tests merge-blocking before they are stable, truthful, and cheap enough to trust.

---

## 5. Anti-Patterns to Kill

| Anti-Pattern | Where | What to Do |
|-------------|-------|------------|
| **Global jsdom for everything** | `jest.config.js` line 12 | Split into project configs (Move 1). Server-side code must never run under jsdom. |
| **`test:ci` that excludes integration tests** | `package.json` `test:ci` script | Remove. Use project-scoped configs to separate concerns, not ignore patterns that silently skip test categories (Move 2). |
| **Route handler tests that mock everything** | 67 files in `app/api/**/` | Freeze the pattern. No new tests that mock the service, mock the request, mock the response, and then assert the function was called (Move 3). |
| **"Tests run locally" as documented policy** | `ci.yml` line 10 comment | Delete the comment. If tests don't run in CI, they don't run. Local-only testing is a gentleman's agreement, not governance. |
| **Coverage thresholds that are never evaluated** | `jest.config.js` lines 50-64 | Wire them into the local test command and CI (Moves 2, 7) or delete them. Defined-but-unenforced thresholds signal false rigor. |
| **QA-001/CICD-PIPELINE-SPEC "Gate 4: Test"** | `docs/` | Annotate as NOT IMPLEMENTED. Documented gates that don't exist are the most dangerous kind of lie. |
| **Cypress tests in the repo** | `cypress/` directory, 3 files | Delete (Move 6). Dead test frameworks signal ambiguity about what the real test stack is. |
| **Pre-commit hooks as a security boundary** | 7 hooks, all local | Developer conveniences, not controls. Stop listing them as governance. |

---

## 6. What This Does NOT Cover

- **Test content quality**: Whether individual test assertions are meaningful. The 99 service/lib unit tests may have shallow assertions — that is a separate review.
- **Fixture factories and test data management**: No shared Supabase client factory, cleanup utilities, or transaction-based isolation exists. Out of scope here.
- **Coverage target calibration**: The existing thresholds are inherited. Per-service calibration is separate.
- **Performance testing**: Not addressed.
- **Visual regression testing**: Not addressed.
- **Test data seeding for E2E**: Not specified here.
- **Rewriting the 67 route handler theatre tests**: They are frozen, not fixed. Rewriting is a separate backlog item gated by the Move 3 exemplar.
- **RPC/schema drift monitoring**: Future concern, not current.

---

## 7. Success Criteria

### Phase 1 Exit (Restore Local Truth)

- [ ] Split Jest environments are active (node + jsdom projects)
- [ ] Test scripts are truthful (no misleading `test:ci`)
- [ ] One route handler exemplar demonstrates the correct pattern
- [ ] One bounded context has a trusted-local green baseline in the correct runtime

### Phase 2 Exit (Expand)

- [ ] Broken hook tests are triaged (fixed or filed)
- [ ] Route-handler tests are honestly reclassified (smoke, not strong verification)
- [ ] Cypress dead wood is removed
- [ ] At least one additional bounded context has trusted-local status

### Phase 3 Exit (CI Automation)

- [ ] Unit tests run in CI on every PR (advisory)
- [ ] Playwright and integration tests are wired to CI (advisory)
- [ ] CI signal is visible and stable

### Phase 4 Exit (Enforcement)

- [ ] Branch protection is enabled on `main` with required status checks
- [ ] At least one functional test layer blocks merge beyond static checks
- [ ] Integration and E2E layers have explicit advisory or required status with a visible promotion path

---

## 8. References

- `docs/80-adrs/ADR-044-testing-governance-posture.md` — durable decision record
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — operational rulebook v2.0.0 (source of truth for all governance definitions)
- `docs/issues/gaps/testing-arch-remediation/INVESTIGATION-REPORT.md` — deep audit findings
- `docs/issues/gaps/testing-arch-remediation/FULL-SYSTEM-TEST-POSTURE.md` — full posture assessment
- `docs/issues/gaps/testing-arch-remediation/solo-dev-testing-posture-slimmed.md` — source of the transitional overlay (folded into Standard v2.0.0 and this document)
- `docs/40-quality/QA-001-service-testing-strategy.md` — aspirational testing pyramid (not enforced)
- `docs/deployments/CICD-PIPELINE-SPEC.md` — pipeline spec (Gate 4 not implemented)
