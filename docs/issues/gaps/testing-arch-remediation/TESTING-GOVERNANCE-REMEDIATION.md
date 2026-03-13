# Testing Governance Remediation

**Issue**: ISSUE-C4D2AA48
**Date**: 2026-03-12
**Prerequisites**: INVESTIGATION-REPORT.md, FULL-SYSTEM-TEST-POSTURE.md, ADR-044, TESTING_GOVERNANCE_STANDARD.md
**Status**: Proposed — pending branch protection activation

---

## Purpose

This document is the remediation plan for bringing the repository into conformance with ADR-044 and `TESTING_GOVERNANCE_STANDARD.md`.

It does not define standing testing law. It defines the ordered implementation work required to restore honest test execution, CI enforcement, and branch-protected merge gates.

> Where this document references required, advisory, branch-protected, or green-CI semantics, the normative definitions live in `TESTING_GOVERNANCE_STANDARD.md`.

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

## 2. Initial Conformance Targets

This section describes the initial target state for remediation sequencing. Permanent governance definitions are owned by `TESTING_GOVERNANCE_STANDARD.md`.

### Target A — Required checks in the first conformance phase

Split unit execution (node + jsdom), lint, type-check, build, and coverage evaluation. These run fast (<90s), catch real regressions, and require no external services. Integration and E2E are promoted to required once infrastructure exists (Moves 5–7).

> Gate what you can enforce today. A broken gate is worse than no gate.

### Target B — Advisory layers during initial phase

Integration tests and Playwright E2E remain advisory until their CI infrastructure exists. Pre-commit hooks stay local-only and are not a substitute for CI gates. Governance meaning of "advisory" is defined in `TESTING_GOVERNANCE_STANDARD.md`.

### Target C — Branch protection milestone

`main` is protected before newly-added CI test jobs are treated as effective merge gates. Branch protection requiring 1 approval + all CI checks passing. Direct push to `main` is blocked.

> Without branch protection, every other gate is decorative. This is the single highest-leverage change.

### Target D — Initial CI verification target

During this remediation phase, the initial required CI target is lint + type-check + build + split unit test execution with coverage evaluation. Semantic meaning of "Green CI" is governed by `TESTING_GOVERNANCE_STANDARD.md`.

### Target E — Incremental replacement strategy

During remediation, test honesty is restored incrementally in the services being actively touched. No centralized rewrite sprint is assumed. Route-handler remediation follows the shallow-test policy defined in `TESTING_GOVERNANCE_STANDARD.md`: freeze net-new shallow tests, retain honest smoke where useful, quarantine only misleading outliers, and replace incrementally with behavioral exemplars.

---

## 3. Remediation Rollout

Ordered by dependency. Each move unblocks the next. Branch protection is scheduled first so subsequent CI changes become effective merge gates upon introduction.

### Move 1: Enable branch protection on `main` ← START HERE
Require: status checks (CI `checks` + `test` jobs), 1 approving review, up-to-date branch. Block direct push. Block force push. **Unblocks**: governance has teeth — all subsequent CI additions are automatically enforced. **Effort**: 0.5h.

### Move 2: Split Jest config by environment
Add `jest.node.config.js` for `services/`, `lib/`, `app/api/` (testEnvironment: `'node'`). Keep `jest.jsdom.config.js` for `components/`, `hooks/`. Root `jest.config.js` becomes a multi-project config using `projects: []`. **Unblocks**: correct test execution for 81 misclassified files. **Effort**: 2-3h.

### Move 3: Add unit test step to `ci.yml` and mark as required
Add a `test` job after `checks` that runs `npx jest --ci --projects jest.node.config.js jest.jsdom.config.js --maxWorkers=2`. Remove the integration/e2e exclusion patterns from `test:ci` (they are now handled by project-scoped `testMatch`). Wire coverage threshold evaluation into this step. Mark as required status check (enabled by Move 1). **Unblocks**: tests actually run on every PR and block merge on failure. **Effort**: 1-2h.

### Move 4: Triage the 16 broken hook tests
Run them under jsdom, capture failures, file issues or fix. These are likely stale mocks or missing providers. **Unblocks**: honest test count — no known-broken tests in the green suite. **Effort**: 3-4h.

### Move 5: Wire Playwright into CI (advisory, then required)
Add a `playwright` job that starts the app with `npm run build && npx next start` and runs `npx playwright test`. Initially `continue-on-error: true` (advisory). Promote to required after 2 weeks of green runs. **Unblocks**: E2E regression detection. **Effort**: 3-4h.

### Move 6: Fix the `test:ci` integration exclusion
Create a dedicated `jest.integration.config.js` with `testMatch` targeting `*.int.test.*` and `*.integration.test.*`, `testEnvironment: 'node'`. Add a CI job that runs integration tests against a Supabase container (`supabase start` in CI or use the existing `supabase/config.toml`). Initially advisory. **Unblocks**: 41 dead integration tests. **Effort**: 4-6h.

### Move 7: Reclassify route handler tests and burn dead wood
Delete 3 Cypress files and `cypress/` directory. Remove Cypress from `testPathIgnorePatterns`. For the 67 shallow route handler tests:

- **Freeze the anti-pattern**: prohibit creation of new tests in the same shallow style.
- **Relabel honestly**: reclassify existing shallow tests as smoke coverage where they still provide minimal module/wiring assurance.
- **Quarantine worst offenders**: only tests that are actively misleading or noisy get `describe.skip('QUARANTINE:')` — not a blanket skip of the entire class.
- **Replace incrementally**: as developers touch a service, they replace the shallow test with a behavioral one following the exemplar from Move 8.

**Unblocks**: honest file counts without creating an observability cliff. **Effort**: 2-3h.

### Move 8: Route handler test exemplar
Write one exemplar route handler test that uses real request/response objects (no `NextRequest` mock), calls the handler, and asserts status + body + error paths. Document the pattern. Freeze the old pattern via an ESLint rule or PR review checklist. **Unblocks**: new route tests that prove something. **Effort**: 2-3h.

**Total estimated effort**: 19-27 hours across moves 1-8.

### Execution Segmentation

Remediation work splits into two phases with different scoping rules.

**Phase A — Shared infrastructure (global, repo-wide)**
Moves 1–3 affect shared configuration and CI plumbing. These are executed once, globally:
- Branch protection (Move 1)
- Split Jest config (Move 2)
- CI test step (Move 3)

After Phase A, the shared harness is correct and trusted.

**Phase B — Domain restoration (bounded-context slices)**
Moves 4–8 touch runtime test content — server-unit fixes, integration wiring, route-handler replacement, hook triage. This work proceeds **one bounded context at a time**, not as a repo-wide big-bang rewrite.

Execution rule for Phase B:
1. Pick one bounded context (e.g., `services/player/`, `services/visit/`)
2. Restore its server-unit tests to correct environment and honest assertions
3. Restore or wire its integration tests if applicable
4. Replace any shallow route-handler tests for its routes using the Move 8 exemplar
5. Confirm a trusted local green baseline for that context
6. Promote the restored slice into the CI-enforced baseline
7. Move to the next bounded context

Do not attempt to restore the entire test posture as one undifferentiated blob. Each slice must produce a trusted green baseline before expansion. This prevents partial restoration from creating a new form of ambiguity — where some contexts are honest and others are still theatre, but CI treats them identically.

---

## 4. Move 1 Reference: Branch Protection CLI Steps

Steps for executing Move 1 (branch protection activation).

```bash
# Require CI checks to pass and 1 approval before merge to main.
# Block direct pushes and force pushes.
#
# NOTE: The contexts list below is provisional. It names only the
# existing "checks" job. After Move 3 adds the "test" job, update
# this rule to include it:
#   "contexts":["checks","test"]
# Until then, the test job will run but will not block merge.
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["checks"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

Replace `{owner}/{repo}` with the actual values (e.g., `diepulp/pt-2`).

After branch protection is active, Move 3 (add test step to CI) becomes the natural next action — once it exists, it is automatically enforced.

---

## 5. Anti-Patterns to Kill

| Anti-Pattern | Where | What to Do |
|-------------|-------|------------|
| **Global jsdom for everything** | `jest.config.js` line 12 | Split into project configs (Move 2). Server-side code must never run under jsdom. |
| **`test:ci` that excludes integration tests** | `package.json` `test:ci` script | Remove. Use project-scoped configs to separate concerns, not ignore patterns that silently skip test categories. |
| **Route handler tests that mock everything** | 67 files in `app/api/**/` | Freeze the pattern. No new tests that mock the service, mock the request, mock the response, and then assert the function was called. That tests the mocking framework, not the code. |
| **"Tests run locally" as documented policy** | `ci.yml` line 10 comment | Delete the comment. If tests don't run in CI, they don't run. Local-only testing is a gentleman's agreement, not governance. |
| **Coverage thresholds that are never evaluated** | `jest.config.js` lines 50-64 | Either wire them into CI (Move 3) or delete them. Defined-but-unenforced thresholds are worse than no thresholds — they signal false rigor. |
| **QA-001/CICD-PIPELINE-SPEC "Gate 4: Test"** | `docs/` | Annotate as NOT IMPLEMENTED. Documented gates that don't exist are the most dangerous kind of lie — they make stakeholders believe testing is enforced. |
| **Cypress tests in the repo** | `cypress/` directory, 3 files | Delete. Dead test frameworks that remain in the repo signal ambiguity about what the real test stack is. |
| **Pre-commit hooks as a security boundary** | 7 hooks, all local | They are developer conveniences, not controls. Stop listing them as governance in any security or compliance context. |

---

## 6. What This Does NOT Cover

- **Test content quality**: This document addresses whether tests run and where, not whether individual test assertions are meaningful. The 99 service/lib unit tests may have shallow assertions — that is a separate review.
- **Fixture factories and test data management**: No shared Supabase client factory, cleanup utilities, or transaction-based isolation exists. Building that infrastructure is prerequisite to scaling integration tests but is out of scope here.
- **Coverage target calibration**: The existing thresholds (80% loyalty/business, 75% loyalty/crud) are inherited. Whether they are correct, and what thresholds other services need, requires per-service analysis.
- **Performance testing**: No load, stress, or benchmark testing exists or is proposed.
- **Visual regression testing**: Component screenshot comparison is not addressed.
- **Test data seeding for E2E**: Playwright tests need stable seed data. The mechanism (API seeding, SQL fixtures, Supabase snapshots) is not specified here.
- **Rewriting the 67 route handler theatre tests**: They are frozen, not fixed. Rewriting them is a separate backlog item gated by the exemplar pattern from Move 8.
- **RPC/schema drift monitoring**: Current drift risk is 0.6/10. A future concern, not a current one.

---

## 7. Success Criteria

This remediation stream is successful when:

- Split Jest environments are active (node + jsdom projects)
- Unit tests run in CI on every PR
- Branch protection is enabled on `main` with required status checks
- At least one functional test layer blocks merge beyond static checks
- Route-handler tests are no longer misrepresented as strong verification
- Integration and E2E layers have explicit advisory status and a visible promotion path
- Broken hook tests are triaged (fixed or filed)
- Cypress dead wood is removed

---

## 8. References

- `docs/80-adrs/ADR-044-testing-governance-posture.md` — durable decision record
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — operational rulebook (source of truth for all governance definitions)
- `docs/issues/gaps/testing-arch-remediation/INVESTIGATION-REPORT.md` — deep audit findings
- `docs/issues/gaps/testing-arch-remediation/FULL-SYSTEM-TEST-POSTURE.md` — full posture assessment
- `docs/40-quality/QA-001-service-testing-strategy.md` — aspirational testing pyramid (not enforced)
- `docs/deployments/CICD-PIPELINE-SPEC.md` — pipeline spec (Gate 4 not implemented)
