---
name: e2e-testing
description: Write and execute Playwright E2E tests following PT-2 quality standards and Anthropic best practices. This skill should be used when implementing E2E tests, creating test fixtures, debugging flaky tests, or validating critical user workflows. Supports TDD workflow with multi-agent verification. (project)
---

# E2E Testing Skill

End-to-end testing specialist for PT-2 casino pit management system using Playwright. Implements Anthropic's recommended TDD workflow with multi-agent verification and PT-2 quality standards.

## When to Use This Skill

- Writing new E2E tests for critical workflows
- Creating test fixtures and data factories
- Debugging flaky or failing E2E tests
- Validating user journeys before release
- Implementing API integration tests
- Setting up test infrastructure

## Progressive Disclosure

This skill uses a three-level loading system:

1. **Level 1 (Always loaded)**: Core workflows in this SKILL.md
2. **Level 2 (On demand)**: `references/pt2-testing-standards.md` - PT-2 patterns
3. **Level 3 (On demand)**: `references/anthropic-best-practices.md` - Advanced techniques

Load references only when the specific context is needed.

---

## Quick Start: TDD Workflow

Follow Anthropic's recommended test-driven development cycle:

### Phase 1: Write Tests First

```bash
# Create test file following ADR-002 naming convention
touch e2e/workflows/[feature-name].spec.ts
```

Write tests based on expected behavior. Be explicit about TDD to avoid mock implementations:

```typescript
// e2e/workflows/player-registration.spec.ts
import { test, expect } from "@playwright/test";
import { createTestScenario } from "./fixtures/test-data";

test.describe("Player Registration Workflow", () => {
  test("registers new player with valid data", async ({ request }) => {
    const scenario = await createTestScenario();

    const response = await request.post("/api/v1/players", {
      data: {
        first_name: "John",
        last_name: "Doe",
        casino_id: scenario.casinoId,
      },
      headers: { Authorization: `Bearer ${scenario.authToken}` },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data.id).toBeDefined();

    await scenario.cleanup();
  });
});
```

### Phase 2: Verify Tests Fail

Run tests to confirm they fail before implementation:

```bash
npx playwright test e2e/workflows/player-registration.spec.ts
```

**Critical**: Do not write implementation code at this stage.

### Phase 3: Implement Until Tests Pass

Iterate on implementation:

```
think hard about implementing [feature] to pass these tests
```

The implementation cycle:
1. Write code
2. Run tests
3. Adjust code
4. Repeat until all tests pass

### Phase 4: Independent Verification

Use multi-agent verification to prevent overfitting:

```
ultrathink: verify this implementation isn't overfitting to the tests
```

Or spawn a subagent for independent review:

```
Have a subagent review the implementation for correctness beyond test cases
```

---

## PT-2 Testing Pyramid

Per QA-001, E2E tests cover **10% of total tests** (critical flows only):

```
              /\
             /  \  E2E Tests (Playwright)
            /    \  • Complete workflows (10%)
           /------\
          /        \  Integration Tests (Jest)
         /          \  • Service + DB (20%)
        /            \  • Action orchestration (10%)
       /--------------\
      /                \  Unit Tests (Jest + RTL)
     /                  \  • Service logic (40%)
    /                    \  • UI components (10%)
   /______________________\
```

### Critical Flows for E2E Coverage

1. **Player CRUD** - Registration, lookup, update
2. **Visit lifecycle** - Check-in, active session, check-out
3. **Rating Slip workflow** - Start, pause, resume, close
4. **Reward issuance** - Mid-session rewards, final comp calculation

---

## Test File Organization (ADR-002)

### Directory Structure

```
e2e/
├── fixtures/
│   ├── test-data.ts          # Test scenario factories
│   ├── auth-helpers.ts       # Authentication utilities
│   └── cleanup-helpers.ts    # Teardown utilities
├── workflows/
│   ├── player-management.spec.ts
│   ├── visit-lifecycle.spec.ts
│   └── rating-slip-lifecycle.spec.ts
└── api/
    ├── health.spec.ts
    └── endpoints/
        ├── players.spec.ts
        └── visits.spec.ts
```

### Naming Conventions

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Workflow E2E | `*.spec.ts` | `rating-slip-lifecycle.spec.ts` |
| API E2E | `*.spec.ts` in `api/` | `api/players.spec.ts` |
| Component E2E | `*.e2e.test.ts` | `dashboard.e2e.test.ts` |

---

## Test Fixture Patterns

### Service Client Factory

Create service role client for test setup (bypasses RLS):

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

Create complete test scenarios with cleanup:

```typescript
export interface TestScenario {
  casinoId: string;
  staffId: string;
  playerId: string;
  tableId: string;
  visitId: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();

  // Create test data in dependency order
  // ...see references/pt2-testing-standards.md for full pattern

  return {
    casinoId: casino.id,
    cleanup: async () => {
      // Delete in reverse dependency order
    },
  };
}
```

### Test Isolation Rules

Per Playwright best practices:
- Each test runs independently with its own data
- Use `beforeEach` for setup, `afterEach` for cleanup
- Never share state between tests
- Use unique timestamps/prefixes for test data

---

## Running E2E Tests

### Local Development

```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test e2e/workflows/rating-slip-lifecycle.spec.ts

# Run with UI mode for debugging
npx playwright test --ui

# Run with headed browser
npx playwright test --headed

# Generate HTML report
npx playwright show-report
```

### CI Configuration

Tests run in CI with:
- Single worker (`workers: 1`)
- 2 retries on failure
- Trace on first retry
- HTML reporter

---

## Debugging Flaky Tests

### Common Causes and Fixes

1. **Race conditions** - Use Playwright's auto-waiting, not hard waits
   ```typescript
   // Bad
   await new Promise(resolve => setTimeout(resolve, 1000));

   // Good
   await expect(response).toHaveStatus(200);
   ```

2. **Shared state** - Ensure complete test isolation
   ```typescript
   test.beforeEach(async () => {
     scenario = await createTestScenario(); // Fresh data each test
   });
   ```

3. **Timing issues** - Use explicit waits for async operations
   ```typescript
   await page.waitForResponse(resp =>
     resp.url().includes('/api/v1/rating-slip') &&
     resp.status() === 200
   );
   ```

4. **Database cleanup** - Always cleanup in correct order
   ```typescript
   // Delete in reverse dependency order
   await supabase.from('rating_slip').delete().eq('casino_id', id);
   await supabase.from('visit').delete().eq('casino_id', id);
   // ... cascade through dependencies
   ```

### Trace Analysis

Enable traces for debugging:

```typescript
// playwright.config.ts
use: {
  trace: 'on-first-retry', // or 'on' for always
}
```

View traces:
```bash
npx playwright show-trace trace.zip
```

---

## Anthropic Thinking Triggers

Use these phrases for enhanced analysis:

| Phrase | Effect | Use Case |
|--------|--------|----------|
| `think` | Basic extended thinking | Simple test design |
| `think hard` | Moderate thinking budget | Complex workflow tests |
| `think harder` | High thinking budget | Multi-step verification |
| `ultrathink` | Maximum thinking budget | Architecture decisions |

### Example Usage

```
ultrathink about the test coverage for the rating slip lifecycle -
are we covering all edge cases including pause/resume timing,
concurrent modifications, and RLS enforcement?
```

---

## Extended References

For detailed patterns, load these references as needed:

- `references/pt2-testing-standards.md` - Full PT-2 QA standards, coverage targets, service patterns
- `references/anthropic-best-practices.md` - Multi-agent verification, iteration workflows, prompt engineering

### Loading References

```
Read references/pt2-testing-standards.md for the complete fixture factory pattern
```

---

## Checklist: Before Committing E2E Tests

- [ ] Tests follow TDD workflow (written before implementation)
- [ ] Test files use ADR-002 naming conventions
- [ ] Fixtures create isolated test data with cleanup
- [ ] No hard waits - use Playwright's auto-waiting
- [ ] Critical workflow has E2E coverage
- [ ] Tests pass locally and in CI
- [ ] Multi-agent verification performed for complex tests
