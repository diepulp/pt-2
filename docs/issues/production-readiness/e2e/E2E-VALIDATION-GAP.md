# E2E Test Validation Gap — Next Effort

**Date:** 2026-04-09
**Priority:** P1 — Beta blocker
**Predecessor:** Mode C Runtime Validation (`RUNTIME-VALIDATION-REPORT.md`)

---

## Current State

22 Playwright E2E spec files exist (7,839 lines, ~153 test cases) but have **never been validated against a running application**. They fail universally under Jest because they require the Playwright test runner and a live dev server.

### Spec Inventory

| Category | File | Tests | Status |
|----------|------|-------|--------|
| **Workflows** | `rating-slip-modal.spec.ts` | 13 | Implemented |
| | `shift-dashboard-v3-layout.spec.ts` | 17 | Implemented |
| | `visit-continuation.spec.ts` | 17 | Partially implemented |
| | `player-360-panels.spec.ts` | 23 | Implemented (1 fixme) |
| | `player-360-navigation.spec.ts` | 13 | Implemented (1 fixme) |
| | `move-player.spec.ts` | 9 | Implemented |
| | `loyalty-accrual-lifecycle.spec.ts` | 7 | Implemented |
| | `player-exclusion.spec.ts` | 6 | Implemented (1 fixme) |
| | `company-registration.spec.ts` | 5 | Implemented |
| | `admin-settings.spec.ts` | 5 | Implemented |
| | `setup-wizard.spec.ts` | 5 | Implemented (1 fixme) |
| | `admin-alerts.spec.ts` | 4 | Implemented |
| | `csv-player-import.spec.ts` | 3 | Implemented |
| | `csv-server-import.spec.ts` | 3 | Implemented |
| | `loyalty-admin-catalog.spec.ts` | 1 | Implemented |
| | `cashier-workflow.spec.ts` | 8 | **Stub only** (`test.fixme`) |
| **API** | `shift-intelligence.spec.ts` | 7 | Implemented |
| | `player-exclusion-enforcement.spec.ts` | 1 | Implemented |
| | `loyalty-accrual.spec.ts` | 1 | Implemented |
| **Standalone** | `mtl-threshold-notifications.spec.ts` | 11 | Implemented |
| | `measurement-reports.spec.ts` | 2 | Implemented |
| | `table-activation-drawer.spec.ts` | 5 | **Stub only** (`test.fixme`) |

**Totals:** 153 test cases across 22 files. 13 stubs (`test.fixme`), ~140 implemented.

---

## Why This Blocks Beta

1. **No browser-level validation.** Unit and integration tests verify service logic and DB behavior. E2E tests verify that a user can actually complete workflows through the UI. Without them, regressions in routing, component wiring, or server actions go undetected.

2. **Core workflows untested at UI layer:**
   - Rating slip open/close/move
   - Visit start/continuation/close
   - Player 360 dashboard navigation
   - Setup wizard onboarding
   - CSV import flows

3. **No CI integration.** The `ci.yml` pipeline has an `e2e` job but it's advisory (not blocking). E2E failures don't prevent merge.

---

## Prerequisites

```bash
# Playwright browsers must be installed
npx playwright install

# Dev server must be running
npm run dev

# Local Supabase must be running
npx supabase start

# .env.local must point at local Supabase (playwright.config.ts loads .env.local first)
```

### Playwright Config

- `playwright.config.ts` at project root
- `testDir: './e2e'`
- `baseURL: process.env.BASE_URL || 'http://localhost:3000'`
- Loads `.env.local` with override, then `.env`
- HTML reporter

---

## Execution Plan

### Phase 1: Triage Run (1 session)

Run all specs and classify results:

```bash
npx playwright test --reporter=list 2>&1 | tee /tmp/e2e-triage.log
```

Expected outcome categories:
- **Green:** Tests that pass as-is
- **Env failures:** Tests that fail due to missing seed data, auth setup, or env config
- **Route failures:** Tests that hit 404s (routes not yet implemented or renamed)
- **Assertion drift:** Tests that reach the page but assertions don't match current UI
- **Stub:** `test.fixme` tests (skip for now)

### Phase 2: Fix Env + Auth (1-2 sessions)

- Create E2E seed script (`e2e/fixtures/seed.ts`) for deterministic test data
- Create E2E auth helper for Mode C sessions (reuse `createModeCSession` pattern)
- Ensure `.env.local` has local Supabase credentials
- Fix route paths that have changed since spec creation

### Phase 3: Fix Assertion Drift (2-3 sessions)

Priority order (by user-facing criticality):
1. `rating-slip-modal` — core pit boss workflow
2. `visit-continuation` — session management
3. `player-360-panels` + `player-360-navigation` — player lookup
4. `setup-wizard` + `company-registration` — onboarding
5. `shift-dashboard-v3-layout` — shift overview
6. API specs (`shift-intelligence`, `loyalty-accrual`, `player-exclusion-enforcement`)
7. Remaining workflow specs

### Phase 4: CI Integration

- Make `e2e` job in `ci.yml` blocking (not advisory)
- Add Playwright to GitHub Actions with browser caching
- Run against preview deployment URL (requires Vercel preview env vars)

---

## Definition of Done

- [ ] `npx playwright test` exits 0 (excluding `test.fixme` stubs)
- [ ] All 140 implemented test cases pass against local dev server + local Supabase
- [ ] E2E job in `ci.yml` is blocking on PR merge
- [ ] Seed script creates deterministic test fixtures
- [ ] No test depends on remote Supabase or manual data setup
