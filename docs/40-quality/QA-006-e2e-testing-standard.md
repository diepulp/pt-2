---
id: QA-006
title: End-to-End (E2E) Testing Standard
owner: QA
status: Proposed
affects: [QA-001, QA-002, QA-005, ADR-044, ADR-024, ADR-015]
created: 2026-03-29
last_review: 2026-03-29
precis: docs/e2e-standard/E2E-TESTING-STANDARD-PRECIS.md
---

## Purpose

Codify the rules, patterns, and infrastructure requirements for Playwright E2E tests in PT-2. This standard governs auth mode selection, environment configuration, test isolation, fixture design, and CI promotion — filling the gap identified by the E2E Testing Standard Precis (2026-03-29) and completing the canonical test taxonomy defined in TESTING_GOVERNANCE_STANDARD.md §3.6.

## Problem Statement

The E2E layer is active and substantial (17 spec files, 124 tests, 7 fixture files) but grew organically without a governing standard. The first structured E2E effort on Wedge C (PRD-055/056) exposed five structural gaps:

1. Three auth modes exist with no documented selection criteria
2. Playwright env loading diverges from Next.js precedence
3. SECURITY DEFINER RPCs are untestable via dev auth bypass
4. Shared seed data causes parallel test conflicts
5. Auth fixture code is duplicated across 4+ files

Developers currently discover these constraints through trial and error. This standard eliminates that discovery tax.

## Scope

This standard covers:

- Auth mode selection for E2E tests
- Playwright configuration and environment contracts
- Test fixture architecture and shared helpers
- Test isolation (serial vs. parallel, cleanup scoping)
- SECURITY DEFINER RPC testing patterns
- File organization and naming conventions
- Pre-requisite checklist for local and CI execution
- CI promotion path (local → advisory → required gate)

It does **not** cover unit test patterns (QA-003), route handler testing (QA-005), or the governance framework itself (TESTING_GOVERNANCE_STANDARD.md). It implements the E2E layer within that framework.

---

## §1 Auth Mode Decision Matrix

PT-2 has three auth contexts for E2E tests. Choosing the wrong one produces false failures (RPCs reject service_role) or false passes (bypassing the auth chain under test).

### The Three Modes

**Mode A — Dev Auth Bypass**

| Aspect | Detail |
|---|---|
| Mechanism | `ENABLE_DEV_AUTH=true` + `NODE_ENV=development` |
| What happens | Route handler injects `DEV_RLS_CONTEXT`, swaps to service_role client |
| Works for | GET endpoints that read tables directly (RLS policies scope by casino) |
| Fails for | Any route calling a SECURITY DEFINER RPC — `auth.uid()` returns NULL |
| Implementation | `lib/supabase/dev-context.ts` → `lib/server-actions/middleware/auth.ts` |

**Mode B — Browser Login**

| Aspect | Detail |
|---|---|
| Mechanism | Playwright navigates to `/auth/login`, fills form, Supabase sets session cookies |
| What happens | Real JWT issued, middleware validates session, cookies carry auth on subsequent requests |
| Works for | Page navigation, role gating, UI workflows, API calls from browser context |
| Fails for | API-only tests (no browser context), direct RPC testing |
| Implementation | `components/login-form.tsx` → `lib/supabase/middleware.ts` |

**Mode C — Authenticated Supabase Client**

| Aspect | Detail |
|---|---|
| Mechanism | Sign in via `supabase.auth.signInWithPassword()`, get JWT, create client with Bearer token |
| What happens | Real JWT with `auth.uid()`, RPCs can call `set_rls_context_from_staff()` |
| Works for | SECURITY DEFINER RPCs, RLS-scoped queries, role-gated operations |
| Fails for | Testing the Next.js route handler + middleware layer (bypasses it) |
| Implementation | Pattern in `e2e/fixtures/test-data.ts` (lines 119–127) |

### Verification Taxonomy Guardrail

Auth mode selection is not only a transport choice; it defines **what layer is actually being verified**.

- **Mode B (browser login)** is the **canonical E2E mode** for PT-2 because the request enters through the real browser/app surface, exercises the Next.js route/middleware/session chain, and then reaches the backing data path.
- **Mode C (authenticated Supabase client)** is **system/API verification**, not canonical browser E2E, unless the request is still initiated through the real application surface under test. It verifies real JWT/RPC/RLS behavior, but bypasses the browser session and may bypass the route/middleware layer.
- **Mode A (dev auth bypass)** is **trusted local convenience coverage** only. It is valid for cheap read-path verification, but it is **not evidence** that the production auth/session/middleware surface behaves correctly.

This distinction must be preserved in file naming, describe blocks, CI reporting, and review language. The project must not claim "E2E coverage" for tests that do not traverse the actual application surface under test.

### Selection Rule

First choose the **layer you are verifying**, then choose the auth mode.

Is the goal to verify the real browser/app surface, including navigation, session cookies, route protection, and user-visible workflow behavior?
  → Use **Mode B** (browser login). This is canonical E2E.

Is the goal to verify an API/RPC path with a real JWT and real RLS/RPC behavior, but without relying on the browser/session layer?
  → Use **Mode C** (authenticated client). Classify the test as **system/API verification**, not canonical E2E.

Is the endpoint read-only, local-only, and being exercised for cheap regression coverage where auth-surface fidelity is not the subject under test?
  → **Mode A** (dev bypass) is acceptable for trusted local verification only.

Does the test need the full stack (browser → route handler/middleware → API/RPC → DB)?
  → Use **Mode B**, and perform any downstream API assertions from the browser-authenticated context rather than substituting a direct authenticated client.

### Minimum Auth Mode for Direct RPC/API Verification

All 12 SECURITY DEFINER RPCs call `set_rls_context_from_staff()` internally, which requires `auth.uid()` to be non-NULL. Mode A **always fails** for these.

The table below shows the **minimum mode when exercising the RPC path directly** (system/API verification). When the same RPC is reached downstream through a browser workflow, the test is Mode B (canonical E2E) — the RPC still executes correctly because the browser session carries a real JWT. Mode B is not only permitted but preferred when the test objective is full-stack workflow verification.

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_activate_floor_layout` | `POST /api/v1/floor-layout-activations` | C |
| `rpc_create_floor_layout` | `POST /api/v1/floor-layouts` | C |
| `rpc_close_rating_slip` | Service layer | C |
| `rpc_pause_rating_slip` | Service layer | C |
| `rpc_resume_rating_slip` | Service layer | C |
| `rpc_move_player` | `POST /api/v1/rating-slips/[id]/move` | C |
| `rpc_create_player` | Service layer | C |
| `rpc_log_table_drop` | `POST /api/v1/table-context/drop-events` | C |
| `rpc_request_table_fill` | `POST /api/v1/table-context/fills` | C |
| `rpc_request_table_credit` | `POST /api/v1/table-context/credits` | C |
| `rpc_log_table_inventory_snapshot` | `POST /api/v1/table-context/inventory-snapshots` | C |
| `rpc_update_table_status` | Service layer | C |

**GET routes** reading tables directly (floor layouts list, drop events list, fills list) can use Mode A.

### Documenting Auth Mode and Verification Class in Tests

Every test file must declare both its auth mode **and** its verification class in the top-level describe block:

```typescript
test.describe('Shift Dashboard — E2E — Mode B (browser login)', () => {
  // ...
});

test.describe('Table Fill API — System Verification — Mode C (authenticated client)', () => {
  // ...
});
```

Required verification classes:

- `E2E` — real browser/app surface under test
- `System Verification` — real JWT/RPC/RLS path, but not full browser surface
- `Local Verification` — dev-bypass or other cheap local-only regression checks

This labeling is mandatory so that audits, grep, and CI reporting do not blur honest full-stack E2E with cheaper verification layers.

---

## §2 Environment Configuration

### Playwright Config — Env File Loading

Playwright must load environment files in the same order as Next.js to prevent the env mismatch discovered in the precis (§3).

**Required configuration in `playwright.config.ts`:**

```typescript
import dotenv from 'dotenv';
import path from 'path';

// Match Next.js env precedence: .env.local overrides .env
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });
dotenv.config({ path: path.resolve(__dirname, '.env') });
```

**Rationale:** `.env.local` contains local Supabase credentials (gitignored). `.env` may point to remote. If Playwright loads only `.env`, tests create data in remote while the app reads from local.

**Status:** This fix is documented in the precis but **not yet applied** to `playwright.config.ts`. It is a P1 remediation item.

### Supabase Key Format

Supabase CLI v2.70+ issues new-style keys. The legacy HS256 JWTs are rejected by GoTrue.

| Variable | Value Source | Format |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `npx supabase status` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npx supabase status` → PUBLISHABLE_KEY | `sb_publishable_*` or legacy JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | `npx supabase status` → SECRET_KEY | `sb_secret_*` or legacy JWT |

**Source of truth:** `npx supabase status --output json`

### .env.local.example Template

A `.env.local.example` file must exist at root with the variables required for E2E execution:

```bash
# E2E Testing — Local Supabase
# Copy to .env.local and fill from: npx supabase status --output json
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status: PUBLISHABLE_KEY or anon key>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status: SECRET_KEY or service_role key>

# Dev auth bypass (Mode A only — not needed for Mode B/C)
ENABLE_DEV_AUTH=true
```

**Status:** This file does not yet exist. It is a P1 remediation item.

### API Route Middleware Boundary

The middleware (`lib/supabase/middleware.ts`) redirects unauthenticated requests to `/signin` with a 307, which can return HTML instead of a JSON error to API clients if API routes are accidentally captured by browser-oriented auth handling.

API routes are expected to enforce auth through the `withServerAction` → `withAuth` → `withRLS` middleware chain, which returns proper HTTP error codes (401, 403) for API consumers.

**Policy requirement:** the project must explicitly verify that `/api` routes are not subject to browser redirect behavior. Until that verification is completed, the middleware boundary must be treated as an **open risk**, not an assumed invariant.

**Remediation path:**
1. Verify current behavior with an explicit regression test for unauthenticated API access.
2. If browser redirect behavior can reach `/api`, add `/api` handling to the appropriate middleware exclusion or branching logic.
3. Record the verified behavior in this standard once confirmed.

**Current status:** unverified; tracked as a remediation item, not a settled guarantee.

---

## §3 Shared Test Fixtures

### Current Fixture Architecture

All fixtures live in `e2e/fixtures/`:

| File | Factory | Purpose |
|---|---|---|
| `test-data.ts` | `createTestScenario()` | Base: company → casino → staff → player → table → visit |
| `rating-slip-fixtures.ts` | `createRatingSlipTestScenario()` | + 2 tables, loyalty account, open slip |
| `admin-helpers.ts` | `createAdminTestScenario(role)` | Role-configurable staff scenario |
| `mtl-fixtures.ts` | `createMtlTestScenario()` | + MTL thresholds and entries |
| `import-test-data.ts` | `createImportTestScenario()` | Minimal (no tables/players, setup_status=ready) |
| `setup-wizard-fixtures.ts` | `createSetupWizardScenario()` | Empty casino for wizard flow |
| `shift-dashboard-helpers.ts` | `createShiftDashboardScenario()` | Minimal admin scenario |

### Factory Pattern (required for new fixtures)

Every fixture factory must:

1. **Create a service-role client** for setup/teardown (bypasses RLS)
2. **Create a company** (required by ADR-043 dual-boundary tenancy)
3. **Use collision-resistant identifiers** for test isolation: UUIDs, worker-index-qualified prefixes, or equivalent unique suffixes. Timestamp-only prefixes such as `e2e_${Date.now()}` are insufficient as a standard isolation strategy for parallel workers and retries.
4. **Return a cleanup function** that deletes in reverse FK order
5. **Return an authToken** obtained via `supabase.auth.signInWithPassword()`
6. **Stamp `app_metadata`** on the auth user with `casino_id`, `staff_role`, and `staff_id`

```typescript
interface TestScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  authToken: string;
  cleanup: () => Promise<void>;
  // ... domain-specific fields
}
```

### Fixture Minimalism Rule

Fixture architecture must not become a second application hidden under `e2e/fixtures/`.

Required posture:

- Prefer the **smallest scenario factory** that can honestly exercise the target behavior.
- Use **domain-specific fixture extensions** only when the behavior under test truly requires additional domain state.
- Permit **seed-based read verification** where disposable full-world setup would add cost without adding truth.
- Do not require every new test file to create a full company → casino → staff → player → table universe if the behavior under test does not depend on all of it.

The purpose of fixture design is to preserve honesty and isolation, not to maximize abstraction or build an internal test framework for its own sake.

### Shared Auth Helper (required — not yet extracted)

The following auth patterns are duplicated across fixtures:

- `authenticateAndNavigate()` in `setup-wizard-fixtures.ts` and `import-test-data.ts`
- `authenticateViaLogin()` in `shift-dashboard-helpers.ts`
- `authenticateAdmin()` in `admin-helpers.ts`
- `authenticateUser()` used in multiple spec files
- `getDevAuthToken()` in `loyalty-accrual.spec.ts`

**Mandate:** A single shared auth module must be extracted to `e2e/fixtures/auth.ts` exporting:

```typescript
// Browser-based auth (Mode B)
export async function authenticateViaLogin(
  page: Page,
  email: string,
  password: string,
  targetUrl?: string,
): Promise<void>;

// JWT-based auth (Mode C)
export async function getAuthenticatedClient(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; token: string }>;

// Service-role client for setup/teardown
export function createServiceClient(): SupabaseClient;
```

**Status:** This extraction is a P1 remediation item.

---

## §4 Test Isolation

### Serial vs. Parallel

Playwright is configured with `fullyParallel: true`. Tests that share seed data entities **must** opt into serial execution.

**Rule:** Use `test.describe.configure({ mode: 'serial' })` when:

- Tests within the describe block share state created in `beforeAll`
- Tests depend on cumulative side effects from previous tests (e.g., multi-step wizard)
- Seed data uses fixed identifiers that would conflict across parallel workers

**Rule:** Prefer parallel execution when:

- Each test creates its own isolated scenario via a factory
- Tests are read-only (no mutations, no cleanup conflicts)
- Tests use unique identifiers (timestamp-suffixed or UUID-generated)

### Cleanup Scoping

**Prohibited:** Broad casino-level sweeps that destroy data created by parallel tests.

```typescript
// BAD — deletes ALL alerts for the casino, including other tests' data
await supabase.from('anomaly_alerts').delete().eq('casino_id', SEED_CASINO_ID);

// GOOD — deletes only data this test created, by specific IDs
await supabase.from('anomaly_alerts').delete().in('id', createdAlertIds);
```

**Required cleanup pattern:**

- `afterAll` for serial groups sharing cumulative state
- `afterEach` for independent tests that each create their own data
- `finally` blocks inside individual tests for critical cleanup that must run on assertion failure
- Cleanup functions must delete in **reverse FK order** to avoid constraint violations

### Seed Data Constants

Tests using dev seed data (Casino 1, Marcus Thompson, etc.) must reference constants, not magic strings:

```typescript
const SEED_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';
const SEED_STAFF_ID = '5a000000-0000-0000-0000-000000000001';
const DEV_USER_EMAIL = 'pitboss@dev.local';
const DEV_USER_PASSWORD = 'devpass123';
```

These constants should live in a shared file (`e2e/fixtures/seed-constants.ts`) rather than being redeclared per spec.

### Parallel Uniqueness Requirement

When a test may run in parallel, uniqueness must not rely solely on wall-clock time.

Approved strategies:

- `crypto.randomUUID()`
- Playwright worker-index-qualified prefixes
- deterministic per-test unique suffixes provided by shared helpers

Timestamp-only uniqueness is permitted only for strictly serial execution where no retry/parallel collision can occur.

---

## §5 SECURITY DEFINER RPC Testing

### Why Dev Bypass Fails for RPCs

All mutation RPCs (§1 table) are SECURITY DEFINER functions that call `set_rls_context_from_staff()` internally. This function:

1. Reads `auth.uid()` from the JWT
2. Looks up `staff` by `user_id = auth.uid()`
3. Validates `staff.status = 'active'` and `staff.casino_id IS NOT NULL`
4. Sets `app.actor_id`, `app.casino_id`, `app.staff_role` via `SET LOCAL`

With the dev bypass (service_role client), `auth.uid()` returns NULL, and the function raises `EXCEPTION 'UNAUTHORIZED: staff identity not found'`.

This is **by design** (ADR-024 defense-in-depth). It is not a bug and must not be worked around.

### Testing Pattern for RPCs

Use Mode C — sign in as a real user, get a JWT, and call the RPC with the authenticated client:

```typescript
test.describe('Table Fill — Mode C (authenticated client)', () => {
  let scenario: TestScenario;

  test.beforeAll(async () => {
    scenario = await createTestScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('should create table fill via RPC', async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/v1/table-context/fills`,
      {
        headers: {
          Authorization: `Bearer ${scenario.authToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `fill-${Date.now()}`,
        },
        data: {
          table_id: scenario.tableId,
          chipset: 'standard',
          amount_cents: 50000,
        },
      },
    );

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
```

### Role Gating Tests

To verify that a dealer cannot perform pit_boss operations, create two scenarios with different roles and assert the RPC rejects the unauthorized caller:

```typescript
test('dealer cannot activate floor layout', async ({ request }) => {
  const dealerScenario = await createAdminTestScenario('dealer');

  const response = await request.post(
    `${BASE_URL}/api/v1/floor-layout-activations`,
    {
      headers: { Authorization: `Bearer ${dealerScenario.authToken}` },
      data: { /* ... */ },
    },
  );

  expect(response.status()).toBe(403);
  await dealerScenario.cleanup();
});
```

---

## §6 File Organization

### Directory Structure

```
e2e/
├── fixtures/
│   ├── auth.ts                    # Shared auth helpers (Mode B + C)
│   ├── seed-constants.ts          # Seed data IDs and dev credentials
│   ├── test-data.ts               # Base scenario factory
│   ├── rating-slip-fixtures.ts    # Rating slip domain factory
│   ├── admin-helpers.ts           # Admin/role-specific factory
│   ├── mtl-fixtures.ts            # MTL domain factory
│   ├── import-test-data.ts        # CSV import domain factory
│   ├── setup-wizard-fixtures.ts   # Setup wizard factory
│   └── shift-dashboard-helpers.ts # Shift dashboard factory
├── workflows/
│   ├── [feature-name].spec.ts     # Page-level workflow tests (Mode B)
│   └── ...
├── api/
│   ├── [domain].spec.ts           # API-level tests (Mode A or C)
│   └── ...
├── sample-csvs/                   # Test data files
│   └── ...
└── README.md                      # Setup instructions
```

### Naming Conventions

- **Spec files:** `[feature-or-domain].spec.ts` — e.g., `rating-slip-modal.spec.ts`
- **Fixture files:** `[domain]-fixtures.ts` or `[domain]-helpers.ts`
- **Describe blocks:** Include verification class and auth mode per §1 — `'Feature Name — E2E — Mode B (browser login)'` or `'Feature Name — System Verification — Mode C (authenticated client)'`
- **Test names:** `'should [specific observable behavior]'`

### New Test File Checklist

Before submitting a new E2E test file:

- [ ] Verification class and auth mode chosen per §1 decision matrix and both declared in describe block
- [ ] Shared auth helper used (not a copy-paste of login logic)
- [ ] Scenario factory returns cleanup function
- [ ] Cleanup deletes in reverse FK order
- [ ] Cleanup scoped to created IDs (no broad casino sweeps)
- [ ] Serial mode declared if tests share state
- [ ] Idempotency key included for POST/mutation requests
- [ ] Environment variables sourced from Playwright config (not hardcoded URLs)

---

## §7 Playwright Configuration Contract

### Required Settings

| Setting | Value | Rationale |
|---|---|---|
| `testDir` | `./e2e` | All E2E tests live under e2e/ |
| `fullyParallel` | `true` | Default parallel; serial opted-in per §4 |
| `baseURL` | `process.env.BASE_URL \|\| 'http://localhost:3000'` | Configurable for CI |
| `webServer.command` | `npm run dev` | Starts Next.js for tests |
| `webServer.reuseExistingServer` | `!process.env.CI` | Reuse locally, fresh in CI |
| `trace` | `'on-first-retry'` | Capture traces for debugging flaky tests |
| `retries` | `process.env.CI ? 2 : 0` | Retries in CI only |
| `workers` | `process.env.CI ? 1 : undefined` | Single worker in CI for stability |

### Projects

Currently a single `api` project on Desktop Chrome. As the E2E suite grows, consider splitting into:

- `api` — API-level tests (Mode A/C), headless
- `workflows` — Page-level tests (Mode B), Desktop Chrome
- `smoke` — Critical-path subset for CI gate, headless

Project/report naming must preserve the verification taxonomy defined in §1. CI output, reports, and dashboards must distinguish:

- canonical browser E2E
- system/API verification
- local verification

The project must not aggregate these into a single undifferentiated "E2E" bucket.

---

## §8 CI Promotion Path

### Current State (2026-03-29)

Per TESTING_GOVERNANCE_STANDARD.md §2, the E2E layer is at **Tier 1 — Trusted Local Verification**:

- Runs in correct environment (real browser + real app + real Supabase)
- Invoked by truthful command (`npm run e2e:playwright`)
- Produces behaviorally meaningful assertions (124 tests, real auth, real DB)
- Does **not** run in CI
- Does **not** block merge

### Promotion to CI Advisory

**Prerequisites:**

1. [ ] `.env.local` override applied in `playwright.config.ts` (§2)
2. [ ] Shared auth helper extracted to `e2e/fixtures/auth.ts` (§3)
3. [ ] `.env.local.example` created (§2)
4. [ ] Critical-path smoke subset identified (5–10 tests, < 3 min)
5. [ ] GitHub Actions workflow created:
   - Start local Supabase (`npx supabase start`)
   - Apply migrations (`npx supabase migration up`)
   - Start Next.js dev server
   - Run smoke subset with Playwright
   - Upload HTML report as artifact

**CI workflow structure:**

```yaml
  e2e-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true  # Advisory phase
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm install
      - uses: supabase/setup-cli@v1
      - run: npx supabase start
      - run: npx playwright install chromium --with-deps
      - run: npx playwright test --project=smoke
        env:
          BASE_URL: http://localhost:3000
          # Supabase env from supabase start output
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Promotion to CI Required

**Prerequisites** (per TESTING_GOVERNANCE_STANDARD.md §7):

1. [ ] Smoke suite demonstrates stability under advisory conditions for a defined threshold, e.g. one of:
   - 20 consecutive advisory runs with zero test-attributed flakes requiring rerun triage, or
   - 14 consecutive calendar days of successful advisory runs on active PR/main traffic without unresolved flaky failures.
2. [ ] No flaky failures that would block legitimate merges
3. [ ] Branch protection enabled on `main`
4. [ ] `continue-on-error` removed from e2e-smoke job
5. [ ] E2E job added to required status checks

The exact threshold may be tuned, but it must be **explicit, measurable, and recorded**. "Reasonable observation period" is not sufficient governance language for promotion into a required blocking gate.

---

## §9 Known Gaps and Blockers

### Infrastructure Gaps

| Gap | Severity | Status |
|---|---|---|
| `.env.local` override in playwright.config.ts | P1 | Not applied |
| `.env.local.example` template | P1 | Not created |
| Shared auth helper extraction | P1 | Not extracted |
| Seed constants file | P2 | Not extracted |
| E2E smoke suite in CI | P2 | Not wired |

### Uncovered Workflows (from gap analysis)

**Tier 1 — Critical Write Paths:**

| Workflow | Blocked By |
|---|---|
| Player Exclusion Lifecycle | Active bug + no E2E coverage |
| Table Session Lifecycle | No E2E coverage |
| Chip Custody (fill/credit/drop) | No E2E coverage (routes exist, Mode C required) |
| Player Enrollment | No E2E coverage |
| Visit Start/End | Partial (visit-continuation covers API) |

**Tier 2 — Read-Heavy UI:**

Compliance dashboard, staff management, pit floor overview, loyalty redemption, floor layout

**Tier 3 — Edge Cases:**

Auth session expiry, shift checkpoints, rundown reports

### RPC Bugs Blocking Tests

Two migration bugs were discovered during the Wedge C E2E effort and block the mutation test path:

1. `rpc_compute_rolling_baseline` — ambiguous `gaming_day` column reference (PG 42702)
2. `rpc_persist_anomaly_alerts` → `rpc_get_anomaly_alerts` — `column ts.table_id does not exist` (PG 42703)

See `docs/issues/ISSUE-RPC-COMPUTE-BASELINE-AMBIGUOUS-COLUMN.md` and `docs/issues/ISSUE-RPC-PERSIST-ALERTS-MISSING-COLUMN.md`.

### Coverage Maturity Guardrail

Raw test count is non-authoritative. E2E maturity must be judged primarily by **critical-path behavioral coverage**, especially mutation paths that matter operationally (session lifecycle, chip custody, player enrollment, exclusion lifecycle, role-gated actions), not by the absolute number of specs/tests present in the suite.

---

## §10 Pre-Requisite Checklist

### Local Execution

Before running `npm run e2e:playwright`:

- [ ] Local Supabase running: `npx supabase start`
- [ ] Migrations applied: `npx supabase migration up`
- [ ] Seed data populated (if using seed-dependent tests)
- [ ] `.env.local` configured with keys from `npx supabase status --output json`
- [ ] Playwright browsers installed: `npx playwright install chromium`
- [ ] Next.js dev server running: `npm run dev` (or let Playwright start it)

### CI Execution (future)

- [ ] Supabase CLI available in runner (`supabase/setup-cli@v1`)
- [ ] `npx supabase start` completes within job timeout
- [ ] Environment variables set from Supabase status output
- [ ] Playwright browsers installed via `npx playwright install chromium --with-deps`
- [ ] HTML report uploaded as artifact on all outcomes

---

## §11 Relationship to Other Standards

| Standard | Relationship |
|---|---|
| QA-001 (Testing Strategy) | QA-006 implements the E2E layer (10% of pyramid) defined in QA-001 |
| QA-002 (Quality Gates) | QA-006 defines the E2E gate that QA-002 will enforce after promotion |
| QA-003 (Service Testing) | Service patterns (unit/integration) complement E2E; no overlap |
| QA-005 (Route Handler Testing) | Route handler tests verify HTTP contracts; E2E tests verify full-stack flows. QA-005 is not a substitute for E2E |
| TESTING_GOVERNANCE_STANDARD | QA-006 operates within the verification tier framework (§2), environment contract (§4), and promotion path (§7–8). The §1 verification taxonomy guardrail extends the governance standard's honesty principle to E2E reporting — preventing Mode A/C from being misreported as canonical browser E2E coverage |
| ADR-024 (Authoritative Context) | Explains why Mode A fails for RPCs and why Mode C is required |
| ADR-044 (Testing Governance) | Architectural decision that mandates this standard's existence |

---

## §12 Review Triggers

A review of this standard is required when:

- New SECURITY DEFINER RPC added (update §1 RPC table)
- Auth middleware changes (publicPaths, withServerAction chain)
- Supabase CLI key format changes
- New Playwright project added
- E2E promoted from advisory to required in CI
- New bounded context ships without E2E coverage
