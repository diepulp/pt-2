# Feature Intake Brief

## A. Feature identity
- **Feature name:** E2E Test Validation Gap Remediation
- **Feature ID / shorthand:** FIB-H-E2E-001
- **Related wedge / phase / slice:** Production readiness — Quality gate hardening
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-04-09
- **Priority:** P1 — Beta blocker
- **Target decision horizon:** Pilot
- **Supporting artifact:** `docs/issues/production-readiness/e2e/FIB-S-E2E-001-e2e-test-validation-gap-remediation.json`
- **Triage evidence:** `docs/issues/production-readiness/e2e/e2e-triage-report.md`

## B. Operator problem statement
22 Playwright E2E spec files (153 test cases, ~7,839 lines) exist but have never been validated against a running application. A Phase 1 triage run against local Supabase + dev server shows 22 passing, 50 failing, 68 blocked by cascade, and 13 stubs. Core operator workflows — rating slip open/close/move, visit start/continuation, player 360 navigation, setup wizard onboarding, CSV import — have zero browser-level validation. Regressions in routing, component wiring, or server actions go undetected.

## C. Pilot-fit / current-slice justification
E2E tests are the only layer that validates the full stack from browser to database through RLS. Unit tests with mocked Supabase have already masked production failures (the exclusion feature incident). Without validated E2E coverage, the pilot ships with no confidence that operator workflows actually work end-to-end. This is a quality gate, not a feature.

## D. Primary actor and operator moment
- **Primary actor:** Builder / QA engineer
- **When does this happen?** During development, CI pipeline execution, and pre-release validation
- **Primary surface:** Playwright test harness, CI pipeline, local dev environment
- **Trigger event:** A code change is proposed that could affect operator workflows; the test suite must validate it works

## E. Feature Containment Loop
1. Builder modifies code touching a critical operator workflow → test suite must catch regressions.
2. Builder runs `npm run e2e:playwright` locally → Playwright executes against live dev server + local Supabase.
3. Each spec creates its own test data via fixture factories → tests are isolated and deterministic.
4. Browser tests authenticate via the real login form (Mode B) or JWT (Mode C) → auth fidelity matches production.
5. Tests verify page rendering, form interactions, API responses, and database state → full-stack validation.
6. Tests clean up their own data in reverse FK order → no cross-test contamination.
7. CI pipeline runs E2E suite on PR → merge is blocked if E2E tests fail.

## F. Required outcomes
- All 140 implemented test cases pass against local dev server + local Supabase (excluding 13 `test.fixme` stubs).
- `npx playwright test` exits 0 consistently on a clean environment.
- Fixture factories create deterministic, isolated test data with proper cleanup.
- No test depends on remote Supabase, manual data setup, or seed data state — except `shift-intelligence.spec.ts`, `loyalty-accrual.spec.ts`, and `loyalty-accrual-lifecycle.spec.ts` which retain seed-data dependencies for this remediation pass (refactoring them to self-contained fixtures is out of scope).
- CI `e2e` job in `ci.yml` runs the full suite and is blocking on PR merge, after a 3-run advisory stabilization period.

## G. Explicit exclusions
- Writing new E2E tests for uncovered workflows.
- Implementing stub tests (`test.fixme` in cashier-workflow and table-activation-drawer).
- Redesigning the E2E fixture architecture or introducing Page Object Model.
- Visual regression testing or screenshot comparisons.
- Performance benchmarking of Playwright execution.
- Cross-browser testing (currently Desktop Chrome only).
- E2E tests against remote/staging Supabase.
- Playwright upgrade or migration.
- Refactoring `shift-intelligence.spec.ts`, `loyalty-accrual.spec.ts`, and `loyalty-accrual-lifecycle.spec.ts` to eliminate seed-data dependencies (these use hardcoded seed IDs and credentials; remediating them requires creating self-contained fixtures beyond the "fix existing tests" scope).

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Rewrite all specs from scratch | Some specs have deep drift | Most specs are structurally sound; only selectors and fixtures need updates |
| Page Object Model refactor | Would reduce selector duplication | Scope creep — current tests work fine without POM once selectors are fixed |
| Parallel fixture consolidation | Multiple fixture files duplicate `createServiceClient` | Existing duplication is annoying but not blocking; fix in a separate cleanup pass |
| Add visual regression snapshots | Would catch UI drift automatically | Adds CI complexity and brittle baselines; not needed for pilot quality gate |
| Run against Vercel preview deploys | Would catch deploy-specific issues | Requires Vercel preview env setup which is a separate workstream |

## I. Dependencies and assumptions
- Local Supabase runs with all migrations applied (`npx supabase start`).
- Dev server starts successfully at `http://localhost:3000`.
- Playwright browsers are installable on the CI runner (`npx playwright install chromium`).
- `.env.local` contains valid local Supabase credentials (URL, anon key, service role key).
- Auth login form at `/auth/login` uses `#email` and `#password` selectors. A duplicate login page exists at `/signin` — specs must use `/auth/login` (canonical).
- Service-role client can create auth users via `admin.createUser()`.
- GitHub Actions runners have Docker support for `supabase start`.
- `shift-intelligence.spec.ts` requires `ENABLE_DEV_AUTH=true` on the dev server; this must be set in CI env vars.
- `admin-settings.spec.ts` uses a non-canonical auth pattern (`localStorage.setItem` instead of form login) — must be migrated to `authenticateAndNavigate` from `e2e/fixtures/auth.ts`.

## J. Out-of-scope but likely next
- Implementing the 13 `test.fixme` stubs (cashier-workflow, table-activation-drawer).
- Writing E2E tests for newly delivered features not yet covered.
- Promoting E2E from CI advisory to CI required (blocking) after stabilization.
- Fixture consolidation to eliminate `createServiceClient` duplication.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes writing new test scenarios, redesigning the fixture architecture, adding visual regression, introducing cross-browser testing, or expanding scope beyond fixing the existing 140 implemented test cases. Additionally, if more than 10 cascade-unblocked tests reveal new independent failures not covered by the 6 workstreams, trigger an amendment to account for the expanded scope.

## L. Scope authority block
- **Intake version:** v1 (DA-reviewed, 9 patches applied)
- **DA review date:** 2026-04-09
- **Frozen for downstream design:** Yes
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:** Exact `data-testid` selector names on pit page, exact API route paths for shift-intelligence alerts, exact UI text for CSV import row detection
- **Human approval / sign-off:** Vladimir Ivanov / 2026-04-09
