---
name: e2e-testing
description: Write and execute Playwright E2E tests for PT-2 casino pit management system with Supabase/RLS integration, governed by QA-006 E2E Testing Standard. This skill should be used when implementing new E2E tests, creating test fixtures, scaffolding test files, debugging flaky tests, or closing documented coverage gaps. Governs auth mode selection (Mode A/B/C), verification taxonomy (E2E vs System Verification vs Local Verification), fixture design, test isolation, and CI promotion. For running existing tests and producing quality reports, use qa-specialist instead. (project)
---

# E2E Testing Skill

Write Playwright E2E tests for PT-2, governed by **QA-006 E2E Testing Standard** (`docs/40-quality/QA-006-e2e-testing-standard.md`).

PT-2 uses real Supabase with RLS policies — mocked tests pass while the real middleware-to-DB path is broken. Only E2E tests running against a live Supabase instance catch these seam failures. The exclusion feature incident proved this: unit tests with mocked Supabase passed while the production write path was broken.

## When to Use This Skill

- Writing new E2E tests for critical workflows
- Creating test fixtures and data factories
- Scaffolding new test files
- Debugging flaky or failing E2E tests
- Closing gaps documented in the E2E workflow gap analysis

**Use `qa-specialist` instead for:** running existing test suites, pre-release validation, quality gate orchestration, coverage reporting.

## Progressive Disclosure

1. **Level 1 (Always loaded)**: Core patterns in this SKILL.md
2. **Level 2 (On demand)**: `references/qa006-compliance.md` — Full RPC→Mode table, CI promotion YAML, shared auth extraction plan, env config details, infrastructure gap tracker
3. **Level 3 (On demand)**: `references/pt2-testing-standards.md` — Coverage targets, service testing patterns, PRD traceability
4. **Level 4 (On demand)**: `references/anthropic-best-practices.md` — Multi-agent verification, TDD prompts
5. **Level 5 (On demand)**: `references/playwright-patterns.md` — Page Object Model, network mocking, visual regression, accessibility

---

## Setup Prerequisites

Before writing or running E2E tests:

1. Start local Supabase: `npx supabase start`
2. Copy `.env.local.example` to `.env.local` and fill in keys from `npx supabase status --output json`
3. Start dev server: `npm run dev`

> **`.env.test` is deprecated.** The canonical env file is `.env.local` (QA-006 §2). Playwright config must load `.env.local` with override precedence matching Next.js.

Full setup instructions: `e2e/README.md`

---

## Auth Mode Decision Matrix (QA-006 §1)

PT-2 has three auth modes. Choosing the wrong one produces false failures (RPCs reject service_role) or false passes (bypassing the auth chain under test).

### The Three Modes

| Mode | Mechanism | Works For | Fails For |
|------|-----------|-----------|-----------|
| **A — Dev Bypass** | `ENABLE_DEV_AUTH=true` + service_role client | GET endpoints reading tables directly | Any SECURITY DEFINER RPC (`auth.uid()` = NULL) |
| **B — Browser Login** | Playwright navigates to `/auth/login`, real JWT via cookies | Page navigation, role gating, UI workflows, full-stack | API-only tests, direct RPC testing |
| **C — Authenticated Client** | `signInWithPassword()` → Bearer token | SECURITY DEFINER RPCs, RLS-scoped queries, role-gated ops | Testing Next.js route handler + middleware layer |

### Selection Rule

Choose the **layer you are verifying**, then choose the auth mode:

1. **Full browser/app surface** (navigation, session cookies, route protection, UI workflow) → **Mode B** (canonical E2E)
2. **API/RPC path with real JWT and RLS** (not browser/session layer) → **Mode C** (system verification)
3. **Read-only, local-only, cheap regression** (auth fidelity not under test) → **Mode A** (local verification)
4. **Full stack** (browser → route handler → API/RPC → DB) → **Mode B**, assert downstream from browser context

All SECURITY DEFINER RPCs require **minimum Mode C** for direct verification. See `references/qa006-compliance.md` for the full RPC→Mode table.

---

## Verification Taxonomy (QA-006 §1)

Every test must declare both its **auth mode** and **verification class**. This prevents cheaper verification layers from being misreported as canonical browser E2E coverage.

| Class | Meaning | Auth Mode |
|-------|---------|-----------|
| `E2E` | Real browser/app surface under test | Mode B |
| `System Verification` | Real JWT/RPC/RLS path, bypasses browser surface | Mode C |
| `Local Verification` | Dev-bypass or cheap local-only regression | Mode A |

### Describe Block Labeling (mandatory)

```typescript
// Mode B — canonical E2E
test.describe('Shift Dashboard — E2E — Mode B (browser login)', () => {
  // ...
});

// Mode C — system/API verification
test.describe('Table Fill API — System Verification — Mode C (authenticated client)', () => {
  // ...
});

// Mode A — local verification only
test.describe('Floor Layouts List — Local Verification — Mode A (dev bypass)', () => {
  // ...
});
```

---

## Running Tests

```bash
npm run e2e:playwright          # Run all E2E tests
npm run e2e:playwright:ui       # UI mode (recommended for development)
npm run e2e:playwright:debug    # Debug mode with inspector
npx playwright test e2e/workflows/player-360-navigation.spec.ts  # Single file
npx playwright show-report      # View HTML report
```

---

## CI Status

E2E tests are **advisory** — they do not block merge. Playwright is not yet wired to CI. Do not cite E2E coverage as governance-grade proof until promoted to Required tier.

**Promotion path:** Local → CI Advisory → CI Required. See `references/qa006-compliance.md` for prerequisites and CI workflow YAML.

---

## Coverage Gaps

Check gap analysis before writing new tests:
`docs/issues/gaps/testing-arch-remediation/playwright-gate-e2e/E2E-WORKFLOW-GAP-ANALYSIS.md`

**Tier 1 (P0):** Player Exclusion, Table Session, Chip Custody, Player Enrollment, Visit Start/End, Promo Programs
**Tier 2 (P1):** Read-heavy UI paths (5 workflows)
**Tier 3 (P2):** Edge cases and regression (3 workflows)

Target the highest-priority uncovered workflow first. Raw test count is non-authoritative — maturity is judged by **critical-path behavioral coverage**, especially mutation paths that matter operationally (QA-006 §9).

---

## Test File Organization (QA-006 §6)

```
e2e/
├── fixtures/
│   ├── auth.ts                    # Shared auth helpers (Mode B + C) [P1 extraction]
│   ├── seed-constants.ts          # Seed data IDs and dev credentials [P2 extraction]
│   ├── test-data.ts               # Base scenario factory (createTestScenario)
│   ├── rating-slip-fixtures.ts    # Rating slip domain factory
│   ├── admin-helpers.ts           # Admin/role-specific factory
│   ├── mtl-fixtures.ts            # MTL domain factory
│   ├── shift-dashboard-helpers.ts # Shift dashboard factory
│   ├── setup-wizard-fixtures.ts   # Setup wizard factory
│   └── import-test-data.ts        # CSV import domain factory
├── workflows/
│   └── *.spec.ts                  # Page-level workflow tests (Mode B)
├── api/
│   └── *.spec.ts                  # API-level tests (Mode A or C)
├── sample-csvs/                   # Test CSV data files
└── README.md
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Spec files | `[feature-or-domain].spec.ts` | `rating-slip-modal.spec.ts` |
| Fixture files | `[domain]-fixtures.ts` or `[domain]-helpers.ts` | `mtl-fixtures.ts` |
| Describe blocks | `'Feature — Class — Mode X (description)'` | See §Verification Taxonomy |
| Test names | `'should [specific observable behavior]'` | `'should create table fill via RPC'` |

### Scaffold Script

Generate a new test file with QA-006-compliant structure:

```bash
python .claude/skills/e2e-testing/scripts/scaffold-e2e-test.py player-exclusion --type workflow --mode B
python .claude/skills/e2e-testing/scripts/scaffold-e2e-test.py table-fills --type api --mode C
```

---

## Shared Auth Helper (QA-006 §3)

Auth logic is currently duplicated across 4+ fixture files. A single shared module at `e2e/fixtures/auth.ts` must export:

```typescript
// Browser-based auth (Mode B)
export async function authenticateViaLogin(
  page: Page, email: string, password: string, targetUrl?: string
): Promise<void>;

// JWT-based auth (Mode C)
export async function getAuthenticatedClient(
  email: string, password: string
): Promise<{ client: SupabaseClient; token: string }>;

// Service-role client for setup/teardown
export function createServiceClient(): SupabaseClient;
```

When writing new fixtures, import from `e2e/fixtures/auth.ts` — do not copy-paste auth logic. See `references/qa006-compliance.md` for the full extraction plan.

**Status:** P1 remediation — not yet extracted.

---

## Test Fixture Patterns (QA-006 §3)

### Factory Requirements

Every fixture factory must:

1. Create a **service-role client** for setup/teardown (bypasses RLS)
2. Create a **company** (required by ADR-043 dual-boundary tenancy)
3. Use **collision-resistant identifiers**: `crypto.randomUUID()`, worker-index-qualified prefixes, or equivalent unique suffixes. **Timestamp-only prefixes are insufficient** for parallel workers and retries.
4. Return a **cleanup function** that deletes in reverse FK order
5. Return an **authToken** via `signInWithPassword()`
6. Stamp **`app_metadata`** on the auth user with `casino_id`, `staff_role`, `staff_id`

```typescript
import { randomUUID } from 'crypto';

export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const testPrefix = `e2e_${uniqueId}`;
  // ... create company → casino → staff → player → table → visit
  // ... return { casinoId, staffId, authToken, cleanup, ... }
}
```

### Fixture Minimalism

Prefer the **smallest scenario factory** that honestly exercises the target behavior. Don't require every test to create a full company → casino → staff → player → table universe if the behavior under test doesn't depend on all of it.

---

## Test Isolation (QA-006 §4)

### Parallel Uniqueness

Playwright runs with `fullyParallel: true`. Uniqueness must **not** rely solely on wall-clock time.

**Approved strategies:**
- `crypto.randomUUID()`
- Playwright worker-index-qualified prefixes
- Deterministic per-test unique suffixes from shared helpers

Timestamp-only uniqueness is permitted only for strictly serial execution.

### Serial vs. Parallel

Use `test.describe.configure({ mode: 'serial' })` when:
- Tests share state created in `beforeAll`
- Tests depend on cumulative side effects (e.g., multi-step wizard)
- Seed data uses fixed identifiers that conflict across workers

### Cleanup Scoping

**Prohibited:** Broad casino-level sweeps that destroy other tests' data.

```typescript
// BAD — deletes ALL alerts for the casino, including other tests' data
await supabase.from('anomaly_alerts').delete().eq('casino_id', SEED_CASINO_ID);

// GOOD — deletes only this test's data by specific IDs
await supabase.from('anomaly_alerts').delete().in('id', createdAlertIds);
```

**Required patterns:**
- `afterAll` for serial groups sharing cumulative state
- `afterEach` for independent tests creating their own data
- `finally` blocks for critical cleanup that must run on assertion failure
- Delete in **reverse FK order** to avoid constraint violations

---

## SECURITY DEFINER RPC Testing (QA-006 §5)

All mutation RPCs are SECURITY DEFINER and call `set_rls_context_from_staff()`, which reads `auth.uid()` from the JWT. With dev bypass (Mode A), `auth.uid()` returns NULL and the RPC raises `UNAUTHORIZED`. This is by design (ADR-024) — do not work around it.

**Testing pattern:** Use Mode C — sign in as a real user, get a JWT, call the RPC:

```typescript
test.describe('Table Fill — System Verification — Mode C (authenticated client)', () => {
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
          'Idempotency-Key': crypto.randomUUID(),
        },
        data: {
          table_id: scenario.tableId,
          chipset: 'standard',
          amount_cents: 50000,
        },
      },
    );

    expect(response.ok()).toBe(true);
  });
});
```

For the full RPC→Mode table (~40+ RPCs), see `references/qa006-compliance.md`.

---

## Writing Tests

### TDD Workflow

Follow the `superpowers:test-driven-development` skill for the full TDD cycle:

1. **Write tests first** based on expected behavior
2. **Verify they fail** before writing implementation
3. **Implement** until tests pass
4. **Verify independently** that implementation is not overfitting

### Example: Browser Workflow Test (Mode B)

```typescript
import { test, expect } from "@playwright/test";
import { createTestScenario } from "../fixtures/test-data";
import type { TestScenario } from "../fixtures/test-data";

test.describe("Player Registration — E2E — Mode B (browser login)", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    await scenario.cleanup();
  });

  test("should register new player with valid data", async ({ page }) => {
    // Browser login (Mode B)
    await authenticateViaLogin(page, scenario.email, scenario.password);

    // Navigate and interact with real app surface
    await page.goto('/players/new');
    await page.getByLabel('First Name').fill('John');
    await page.getByLabel('Last Name').fill('Doe');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Player created')).toBeVisible();
  });
});
```

---

## Debugging Flaky Tests

1. **Race conditions** — Use Playwright auto-waiting, not hard waits
2. **Shared state** — Each test gets fresh data via `createTestScenario()`
3. **Timing** — Use `page.waitForResponse()` for async operations
4. **Cleanup order** — Delete in reverse FK dependency order
5. **Parallel collisions** — Use UUID-based identifiers, not timestamps

```bash
npx playwright show-trace trace.zip
```

For advanced patterns, load `references/playwright-patterns.md`.

---

## Testing Pyramid (QA-001)

E2E tests cover **10% of total tests** — critical flows only:

```
              /\
             /  \  E2E Tests (Playwright)
            /    \  Complete workflows (10%)
           /------\
          /        \  Integration Tests (Jest)
         /          \  Service + DB (20%)
        /            \  Action orchestration (10%)
       /--------------\
      /                \  Unit Tests (Jest + RTL)
     /                  \  Service logic (40%)
    /                    \  UI components (10%)
   /______________________\
```

---

## Checklist: Before Committing E2E Tests

- [ ] Verification class and auth mode chosen per §1 decision matrix
- [ ] Both declared in describe block: `'Feature — Class — Mode X (description)'`
- [ ] Shared auth helper used (not copy-pasted login logic)
- [ ] Scenario factory uses collision-resistant identifiers (UUID, not timestamp-only)
- [ ] Scenario factory returns cleanup function
- [ ] Cleanup deletes in reverse FK order
- [ ] Cleanup scoped to created IDs (no broad casino sweeps)
- [ ] Serial mode declared if tests share state
- [ ] Idempotency key included for POST/mutation requests
- [ ] Environment variables sourced from Playwright config (not hardcoded URLs)
- [ ] No hard waits — uses Playwright auto-waiting
- [ ] Tests pass locally: `npm run e2e:playwright`
- [ ] Gap analysis doc updated if closing a documented gap
