---
name: e2e-testing
description: Write and execute Playwright E2E tests for PT-2 casino pit management system with Supabase/RLS integration. This skill should be used when implementing new E2E tests, creating test fixtures, scaffolding test files, debugging flaky tests, or closing documented coverage gaps (E2E-WORKFLOW-GAP-ANALYSIS.md). For running existing tests and producing quality reports, use qa-specialist instead. (project)
---

# E2E Testing Skill

Write Playwright E2E tests for the PT-2 casino pit management system.

PT-2 uses API-level E2E tests that exercise real Supabase RLS policies. This is where bugs actually hide — the exclusion feature incident proved that unit tests with mocked Supabase pass while the real middleware-to-DB write path is broken. Only E2E tests running against a live Supabase instance catch these seam failures.

## When to Use This Skill

- Writing new E2E tests for critical workflows
- Creating test fixtures and data factories
- Scaffolding new test files
- Debugging flaky or failing E2E tests
- Closing gaps documented in the E2E workflow gap analysis

**Use `qa-specialist` instead for:** running existing test suites, pre-release validation, quality gate orchestration, coverage reporting.

## Progressive Disclosure

1. **Level 1 (Always loaded)**: Core patterns in this SKILL.md
2. **Level 2 (On demand)**: `references/pt2-testing-standards.md` — Coverage targets, fixture factory, service testing
3. **Level 3 (On demand)**: `references/anthropic-best-practices.md` — Multi-agent verification, TDD prompts
4. **Level 4 (On demand)**: `references/playwright-patterns.md` — Page Object Model, network mocking, visual regression, accessibility

---

## Setup Prerequisites

Before writing or running E2E tests, ensure the environment is ready:

1. Start local Supabase: `npx supabase start`
2. Copy `.env.test.example` to `.env.test` and fill in keys from `npx supabase status`
3. Start dev server: `npm run dev`

Full setup instructions: `e2e/README.md`

---

## Running Tests

Use project npm scripts:

```bash
npm run e2e:playwright          # Run all E2E tests
npm run e2e:playwright:ui       # UI mode (recommended for development)
npm run e2e:playwright:debug    # Debug mode with inspector
npx playwright test e2e/player-360-navigation.spec.ts  # Single file
npx playwright show-report      # View HTML report
```

---

## CI Status (ADR-044 S5)

E2E tests are currently **advisory** — they do not block merge. Playwright is not yet wired to the CI pipeline. Do not cite E2E coverage as governance-grade proof until promoted to Required tier. See ADR-044 and `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` for the promotion path.

---

## Coverage Gaps

Before writing new tests, check the gap analysis:
`docs/issues/gaps/testing-arch-remediation/playwright-gate-e2e/E2E-WORKFLOW-GAP-ANALYSIS.md`

14 uncovered workflows are documented with priority tiers:
- **Tier 1 (P0):** Player Exclusion, Table Session, Chip Custody, Player Enrollment, Visit Start/End, Promo Programs
- **Tier 2 (P1):** Read-heavy UI paths (5 workflows)
- **Tier 3 (P2):** Edge cases and regression (3 workflows)

When writing new E2E tests, target the highest-priority uncovered workflow first.

---

## Test File Organization

### Actual Directory Structure

```
e2e/
├── fixtures/
│   ├── test-data.ts              # Core scenario factory (createTestScenario)
│   ├── admin-helpers.ts          # Admin-specific utilities
│   ├── rating-slip-fixtures.ts   # Rating slip lifecycle fixtures
│   ├── mtl-fixtures.ts           # MTL threshold scenarios
│   ├── shift-dashboard-helpers.ts
│   ├── setup-wizard-fixtures.ts
│   └── import-test-data.ts       # CSV import test data
├── workflows/
│   └── *.spec.ts                 # Workflow test specs (15 files)
├── api/
│   └── loyalty-accrual.spec.ts   # API-level tests
├── sample-csvs/                  # Test CSV data files
├── *.spec.ts                     # Standalone specs (measurement-reports, mtl-threshold)
└── README.md
```

### Naming Conventions

| Test Type | Location | Pattern |
|-----------|----------|---------|
| Workflow E2E | `e2e/workflows/` | `*.spec.ts` |
| API E2E | `e2e/api/` | `*.spec.ts` |
| Standalone E2E | `e2e/` root | `*.spec.ts` (rare) |

All E2E test files use the `.spec.ts` extension.

### Scaffold Script

Generate a new test file with PT-2 standard structure:

```bash
python .claude/skills/e2e-testing/scripts/scaffold-e2e-test.py player-exclusion --type workflow
python .claude/skills/e2e-testing/scripts/scaffold-e2e-test.py visits --type api
```

---

## Test Fixture Patterns

### Service Client Factory

Create a service-role client for test setup (bypasses RLS):

```typescript
// e2e/fixtures/test-data.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### Test Scenario Factory

Each test creates its own isolated scenario with cleanup:

```typescript
export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_${timestamp}`;

  // Creates: casino -> auth user -> staff -> player -> gaming_table -> visit
  // Returns: all IDs + authToken + cleanup()
  // See references/pt2-testing-standards.md for full implementation
}
```

### Test Isolation Rules

- Each test runs independently with its own data via `createTestScenario()`
- Use `test.beforeEach` for setup, `test.afterEach` for cleanup
- Never share state between tests
- Use timestamp prefixes for unique test data
- Delete in reverse dependency order during cleanup

---

## Writing Tests

### TDD Workflow

Follow the `superpowers:test-driven-development` skill for the full TDD cycle. The key phases:

1. **Write tests first** based on expected behavior
2. **Verify they fail** before writing implementation
3. **Implement** until tests pass
4. **Verify independently** that implementation is not overfitting

### Example: API-Level Workflow Test

```typescript
import { test, expect } from "@playwright/test";
import { createTestScenario } from "./fixtures/test-data";
import type { TestScenario } from "./fixtures/test-data";

test.describe("Player Registration Workflow", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    await scenario.cleanup();
  });

  test("registers new player with valid data", async ({ request }) => {
    const response = await request.post("/api/v1/players", {
      data: {
        first_name: "John",
        last_name: "Doe",
        casino_id: scenario.casinoId,
      },
      headers: {
        Authorization: `Bearer ${scenario.authToken}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data.id).toBeDefined();
  });
});
```

---

## Debugging Flaky Tests

### Common Causes and Fixes

1. **Race conditions** — Use Playwright's auto-waiting, not hard waits
   ```typescript
   // Bad
   await new Promise(resolve => setTimeout(resolve, 1000));
   // Good
   await expect(response).toHaveStatus(200);
   ```

2. **Shared state** — Ensure complete test isolation
   ```typescript
   test.beforeEach(async () => {
     scenario = await createTestScenario(); // Fresh data each test
   });
   ```

3. **Timing issues** — Use explicit waits for async operations
   ```typescript
   await page.waitForResponse(resp =>
     resp.url().includes('/api/v1/rating-slip') &&
     resp.status() === 200
   );
   ```

4. **Database cleanup order** — Delete in reverse dependency order
   ```typescript
   await supabase.from('rating_slip').delete().eq('casino_id', id);
   await supabase.from('visit').delete().eq('casino_id', id);
   // ... cascade through dependencies
   ```

### Trace Analysis

```bash
npx playwright show-trace trace.zip
```

For advanced patterns (Page Object Model, network mocking, visual regression, accessibility testing), load `references/playwright-patterns.md`.

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

### Critical Flows for E2E Coverage

1. **Player CRUD** — Registration, lookup, update
2. **Visit lifecycle** — Check-in, active session, check-out
3. **Rating Slip workflow** — Start, pause, resume, close
4. **Reward issuance** — Mid-session rewards, final comp calculation

---

## Checklist: Before Committing E2E Tests

- [ ] Test files use `*.spec.ts` naming in correct location (`e2e/` or `e2e/api/`)
- [ ] Fixtures create isolated test data with cleanup via `createTestScenario()`
- [ ] No hard waits — uses Playwright auto-waiting
- [ ] Tests pass locally: `npm run e2e:playwright`
- [ ] Gap analysis doc updated if closing a documented gap
