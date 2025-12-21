---
name: qa-specialist
description: Conduct comprehensive E2E testing of PT-2 critical workflows, validate quality gates, and produce test coverage reports. This skill should be used when validating critical user journeys (player management, visit lifecycle, rating slip operations, loyalty rewards), executing pre-release quality gates, investigating test failures, or validating route handler test coverage (QA-005). Orchestrates Playwright and Jest test execution and provides actionable quality assessments. (project)
allowed-tools: Read, Write, Edit, Glob, Bash, Grep, TodoWrite, Task
---

# QA Specialist

End-to-end testing specialist for PT-2 casino pit management system. Orchestrates comprehensive testing of critical workflows, validates quality gates, and produces actionable quality assessments.

## When to Use This Skill

- **Pre-release validation**: Validate all critical workflows before deployment
- **Quality gate execution**: Run full E2E test suite and report pass/fail status
- **Regression detection**: Investigate test failures and identify root causes
- **Coverage analysis**: Assess E2E coverage of critical user journeys
- **Workflow validation**: Verify specific user flows work end-to-end
- **Flaky test investigation**: Debug intermittent test failures

## Critical Workflows (QA-001)

Per `docs/40-quality/QA-001-service-testing-strategy.md`, E2E tests cover **10% of total tests** focused on these critical flows:

### 1. Player Management Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Search | Fuzzy player name search | `e2e/workflows/player-management.spec.ts` |
| Create | Register new player profile | `e2e/workflows/player-management.spec.ts` |
| Enroll | Casino-specific enrollment | `e2e/workflows/player-management.spec.ts` |
| Update | Modify player information | `e2e/workflows/player-management.spec.ts` |

### 2. Visit Lifecycle Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Check-in | Start player visit (idempotent) | `e2e/workflows/visit-lifecycle.spec.ts` |
| Active session | Verify single active visit constraint | `e2e/workflows/visit-lifecycle.spec.ts` |
| Check-out | End visit with timestamp | `e2e/workflows/visit-lifecycle.spec.ts` |
| Ghost visit | Unidentified player gaming session | `e2e/workflows/visit-lifecycle.spec.ts` |

### 3. Rating Slip Workflow

#### 3.1 State Machine Operations
| Step | Description | Test File |
|------|-------------|-----------|
| Start | Begin rating slip at table/seat | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Pause | Pause session timer (open → paused) | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Resume | Resume paused session (paused → open) | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Close | End session with duration calculation | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Duration | Verify pause intervals excluded | `e2e/workflows/rating-slip-lifecycle.spec.ts` |

#### 3.2 Move Player Operation (PRD-008)
| Step | Description | Test File |
|------|-------------|-----------|
| Move to new table | Close current slip + start new at destination | `e2e/workflows/rating-slip-move.spec.ts` |
| Move to new seat | Same table, different seat | `e2e/workflows/rating-slip-move.spec.ts` |
| Preserve visit | Verify visit_id continuity after move | `e2e/workflows/rating-slip-move.spec.ts` |
| Move with avg bet | Transfer average bet to new slip | `e2e/workflows/rating-slip-move.spec.ts` |

#### 3.3 Update Operations
| Step | Description | Test File |
|------|-------------|-----------|
| Update average bet | Modify bet amount on open/paused slip | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Multiple bet updates | Verify multiple updates before close | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Close with financial | Record chips-taken on close (player exists) | `e2e/workflows/rating-slip-lifecycle.spec.ts` |

#### 3.4 Constraints & Invariants
| Step | Description | Test File |
|------|-------------|-----------|
| Seat uniqueness | Only one active slip per seat | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| State transitions | Invalid transitions rejected (422) | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Idempotency | All mutations require Idempotency-Key | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Ghost visit slips | Rating slips for unidentified players | `e2e/workflows/rating-slip-lifecycle.spec.ts` |

#### 3.5 Cross-Context Queries
| Step | Description | Test File |
|------|-------------|-----------|
| Block table close | Cannot close table with open slips | `e2e/workflows/rating-slip-lifecycle.spec.ts` |
| Modal data | BFF aggregates 5 contexts (slip, visit, player, loyalty, financial) | `e2e/workflows/rating-slip-modal.spec.ts` |

### 4. Loyalty Rewards Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Balance query | Get current loyalty points | `e2e/workflows/loyalty-rewards.spec.ts` |
| Mid-session reward | Issue reward during active visit | `e2e/workflows/loyalty-rewards.spec.ts` |
| Accrual on close | Points earned at slip close | `e2e/workflows/loyalty-rewards.spec.ts` |
| Redemption | Spend loyalty points | `e2e/workflows/loyalty-rewards.spec.ts` |
| Idempotency | Verify no duplicate rewards | `e2e/workflows/loyalty-rewards.spec.ts` |

---

## Route Handler Testing (QA-005)

Route handler unit tests fill the gap between service layer unit tests (business logic) and E2E tests (full user flows). They verify the HTTP boundary layer: route exports exist, request/response shapes match contracts, and error responses are properly formatted.

**Reference**: `docs/40-quality/QA-005-route-handler-testing.md`

### Test Infrastructure

**Location**: `lib/testing/route-test-helpers.ts`

```typescript
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

// Create mock NextRequest
const request = createMockRequest('POST', '/api/v1/rating-slips', {
  headers: { 'Idempotency-Key': 'test-key', 'Content-Type': 'application/json' },
  body: { player_id: 'uuid', table_id: 'uuid', seat_number: 1 },
});

// Create mock route params (Next.js 15 async params)
const routeParams = createMockRouteParams({ id: '123e4567-e89b-12d3-a456-426614174000' });
```

### Rating Slip Route Tests (9 Test Files)

| Endpoint | Method | Test File |
|----------|--------|-----------|
| `/api/v1/rating-slips` | GET, POST | `app/api/v1/rating-slips/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]` | GET | `app/api/v1/rating-slips/[id]/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/pause` | POST | `app/api/v1/rating-slips/[id]/pause/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/resume` | POST | `app/api/v1/rating-slips/[id]/resume/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/close` | POST | `app/api/v1/rating-slips/[id]/close/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/duration` | GET | `app/api/v1/rating-slips/[id]/duration/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/average-bet` | PATCH | `app/api/v1/rating-slips/[id]/average-bet/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/move` | POST | `app/api/v1/rating-slips/[id]/move/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/modal-data` | GET | `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts` |

### HTTP Contract Tests

Prevent client → route mismatches by validating every `http.ts` function maps to an existing route export.

**Location**: `services/rating-slip/__tests__/http-contract.test.ts`

```bash
# Run contract tests
npm test -- services/rating-slip/__tests__/http-contract.test.ts
```

### Running Route Handler Tests

```bash
# Run all rating-slip route tests (38 tests across 10 suites)
npm test -- app/api/v1/rating-slips

# Run specific action tests
npm test -- app/api/v1/rating-slips/[id]/pause/__tests__/route.test.ts

# Run with verbose output
npm test -- app/api/v1/rating-slips --verbose

# Run contract tests
npm test -- services/rating-slip/__tests__/http-contract
```

### Key Testing Patterns

1. **Jest Environment Directive** (Required)
   ```typescript
   /** @jest-environment node */
   ```

2. **Mock withServerAction Middleware**
   ```typescript
   jest.mock('@/lib/server-actions/middleware', () => ({
     withServerAction: jest.fn((_, handler) =>
       handler({
         supabase: {},
         correlationId: 'test-correlation-id',
         rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
       }),
     ),
   }));
   ```

3. **UUID Validation** - Route params use Zod validation
   ```typescript
   // Valid UUID format required
   const slipId = '123e4567-e89b-12d3-a456-426614174000';
   ```

4. **Idempotency-Key Header** (Required for mutations)
   ```typescript
   const request = createMockRequest('POST', url, {
     headers: { 'Idempotency-Key': 'unique-key' },
   });
   ```

5. **ServiceHttpResult Envelope Validation**
   ```typescript
   expect(body).toMatchObject({
     ok: true,
     code: 'OK',
     data: expect.any(Object),
     requestId: expect.any(String),
   });
   ```

### Route Handler Test Quality Gate

- [ ] Route handler tests exist for all API endpoints
- [ ] HTTP contract tests validate http.ts ↔ route.ts parity
- [ ] All tests pass: `npm test -- app/api/v1/rating-slips`
- [ ] No missing route exports (ISSUE-607F9CCB regression prevention)

---

## Quick Start: Quality Gate Execution

### Full Quality Gate (Pre-Release)

Run complete E2E validation before deployment:

```bash
# Run all critical workflow tests
npx playwright test e2e/workflows/ --reporter=html

# Generate coverage report
npx playwright show-report
```

### Workflow-Specific Validation

Target specific workflow for faster feedback:

```bash
# Player management only
npx playwright test e2e/workflows/player-management.spec.ts

# Rating slip lifecycle (state machine, updates, constraints)
npx playwright test e2e/workflows/rating-slip-lifecycle.spec.ts

# Rating slip move player operation
npx playwright test e2e/workflows/rating-slip-move.spec.ts

# Rating slip modal (BFF aggregation)
npx playwright test e2e/workflows/rating-slip-modal.spec.ts

# Visit lifecycle only
npx playwright test e2e/workflows/visit-lifecycle.spec.ts

# Loyalty rewards only
npx playwright test e2e/workflows/loyalty-rewards.spec.ts

# All rating slip tests
npx playwright test e2e/workflows/rating-slip*.spec.ts
```

### Debug Mode

Investigate failures interactively:

```bash
# Run with UI for debugging
npx playwright test --ui

# Run headed to see browser
npx playwright test --headed

# Debug specific test
npx playwright test rating-slip-lifecycle.spec.ts --debug
```

---

## Quality Gate Checklist

Before approving a release, verify all gates pass:

### GATE-1: Critical Workflow Coverage
- [ ] Player management: search, create, enroll, update
- [ ] Visit lifecycle: check-in, active constraint, check-out, ghost visits
- [ ] Rating slip state machine: start, pause, resume, close, duration
- [ ] Rating slip move player: table move, seat move, visit continuity
- [ ] Rating slip updates: average bet, close with financial
- [ ] Rating slip constraints: seat uniqueness, idempotency, state transitions
- [ ] Loyalty rewards: balance, mid-session, accrual, redeem

### GATE-2: Performance Thresholds
- [ ] Dashboard LCP ≤ 2.5s (p95)
- [ ] API response times ≤ 500ms (p95)
- [ ] No memory leaks in 10-minute session

### GATE-3: Security Validation
- [ ] RLS policies enforce casino scoping
- [ ] Cross-casino data access denied
- [ ] Authentication required for protected routes

### GATE-4: Error Handling
- [ ] No Postgres error codes leak to UI
- [ ] Graceful degradation on network failure
- [ ] Idempotency prevents duplicate mutations

### GATE-5: Route Handler Tests (QA-005)
- [ ] Route handler tests pass: `npm test -- app/api/v1/rating-slips`
- [ ] HTTP contract tests pass: `npm test -- services/rating-slip/__tests__/http-contract`
- [ ] All route exports validated (prevents 404 regressions)
- [ ] ServiceHttpResult envelope format verified

---

## Test Execution Workflow

### Step 1: Environment Verification

Ensure test environment is ready:

```bash
# Verify dev server is running
curl -s http://localhost:3000/api/health | jq .

# Verify database connection
npm run db:status

# Verify test data fixtures
ls -la e2e/fixtures/
```

### Step 2: Run Test Suite

Execute tests with appropriate configuration:

```bash
# CI-style execution (single worker, retries)
npx playwright test --workers=1 --retries=2

# Local development (parallel, no retries)
npx playwright test --workers=4 --retries=0
```

### Step 3: Analyze Results

Review test outcomes:

```bash
# View HTML report
npx playwright show-report

# Check for flaky tests
npx playwright test --repeat-each=3

# View trace for failed tests
npx playwright show-trace test-results/*/trace.zip
```

### Step 4: Report Quality Gate Status

Summarize results for stakeholders:

```markdown
## Quality Gate Report - [Date]

### Test Execution Summary
- Total tests: [X]
- Passed: [Y]
- Failed: [Z]
- Flaky: [W]

### Critical Workflow Status
| Workflow | Status | Notes |
|----------|--------|-------|
| Player Management | ✅/❌ | [details] |
| Visit Lifecycle | ✅/❌ | [details] |
| Rating Slip State Machine | ✅/❌ | [details] |
| Rating Slip Move Player | ✅/❌ | [details] |
| Rating Slip Modal/BFF | ✅/❌ | [details] |
| Loyalty Rewards | ✅/❌ | [details] |
| Route Handler Tests | ✅/❌ | [38 tests, 10 suites] |
| HTTP Contract Tests | ✅/❌ | [8 contracts validated] |

### Blockers
[List any blocking issues]

### Recommendation
[PASS/FAIL with rationale]
```

---

## Debugging Flaky Tests

### Common Causes and Solutions

1. **Race conditions**: Use Playwright's auto-waiting
   ```typescript
   // Bad: Fixed timeout
   await page.waitForTimeout(1000);

   // Good: Wait for condition
   await expect(page.getByText('Success')).toBeVisible();
   ```

2. **Shared state**: Ensure test isolation
   ```typescript
   test.beforeEach(async () => {
     scenario = await createTestScenario(); // Fresh data
   });

   test.afterEach(async () => {
     await scenario.cleanup(); // Clean teardown
   });
   ```

3. **Database cleanup order**: Delete in reverse dependency
   ```typescript
   // Correct order for PT-2 schema
   await supabase.from('rating_slip').delete().eq('casino_id', id);
   await supabase.from('visit').delete().eq('casino_id', id);
   await supabase.from('player_enrollment').delete().eq('casino_id', id);
   await supabase.from('gaming_table').delete().eq('casino_id', id);
   ```

4. **Realtime race conditions**: Wait for subscription
   ```typescript
   await page.waitForResponse(resp =>
     resp.url().includes('/realtime/v1') &&
     resp.status() === 101
   );
   ```

### Trace Analysis

Enable detailed tracing for failure investigation:

```typescript
// playwright.config.ts
use: {
  trace: 'on-first-retry', // or 'on' for always
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
}
```

View traces:
```bash
npx playwright show-trace test-results/path/to/trace.zip
```

---

## Test Data Management

### Fixture Factory Pattern

Create isolated test scenarios:

```typescript
// e2e/fixtures/test-data.ts
export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();

  // Create in dependency order
  const casino = await createTestCasino(supabase, timestamp);
  const staff = await createTestStaff(supabase, casino.id, timestamp);
  const player = await createTestPlayer(supabase, casino.id, timestamp);
  const table = await createTestTable(supabase, casino.id, timestamp);

  return {
    casinoId: casino.id,
    staffId: staff.id,
    playerId: player.id,
    tableId: table.id,
    authToken: await getAuthToken(staff.email),
    cleanup: async () => {
      // Delete in reverse dependency order
      await deleteTestData(supabase, { casino, staff, player, table });
    },
  };
}
```

### RLS Testing Considerations

Per ADR-015/ADR-020, tests must use authenticated clients:

```typescript
// Service role bypasses RLS - only use for setup
const serviceClient = createServiceClient();

// Anon client with JWT - use for actual tests
const testClient = createAuthenticatedClient(authToken);
```

---

## Coverage Analysis

### Critical Path Coverage

Ensure all critical paths have E2E coverage:

```bash
# List all test files
find e2e -name "*.spec.ts" | head -20

# Check coverage of workflows directory
ls -la e2e/workflows/

# Verify test count per workflow
grep -c "test\(" e2e/workflows/*.spec.ts
```

### Missing Coverage Detection

Identify gaps in E2E coverage:

```bash
# Find routes without E2E tests
grep -r "app/api/v1" --include="*.ts" | grep -v "__tests__" | \
  awk -F: '{print $1}' | sort -u | \
  while read route; do
    if ! grep -q "${route##*/}" e2e/**/*.spec.ts 2>/dev/null; then
      echo "Missing E2E: $route"
    fi
  done
```

---

## Memory Recording Protocol

This skill tracks test execution outcomes to build pattern knowledge.

### Record Test Execution

After completing a quality gate validation:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:qa-specialist")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="qa-specialist",
    task="Pre-release quality gate validation",
    outcome="success",  # or "failure", "partial"
    pattern_used="Full workflow E2E suite with parallel execution",
    validation_results={
        "player_management": "passed",
        "visit_lifecycle": "passed",
        "rating_slip": "passed",
        "loyalty_rewards": "passed",
        "total_tests": 45,
        "passed": 45,
        "failed": 0,
        "flaky": 0
    },
    files_created=[],
    issues_encountered=[
        # List any issues found during testing
    ],
    duration_seconds=180,
    lessons_learned=[
        # Key insights for future test runs
    ],
    user_satisfaction="approved"
)
```

### Query Past Test Runs

Before investigating failures, check history:

```python
past_runs = memori.search_learnings(
    query="flaky test rating slip",
    tags=["e2e-testing", "quality-gate"],
    category="skills",
    limit=5
)

if past_runs:
    print(f"\n📚 Previous flaky test investigations:\n")
    for run in past_runs:
        metadata = run.get('metadata', {})
        print(f"  Issues: {metadata.get('issues_encountered', [])}")
        print(f"  Resolution: {metadata.get('lessons_learned', [])}")
```

---

## Resources

### references/
- `critical-workflows.md` - Detailed workflow specifications with acceptance criteria
- `test-patterns.md` - PT-2 specific testing patterns and anti-patterns

### scripts/
- `run-quality-gate.sh` - Automated quality gate execution script
- `generate-coverage-report.py` - Coverage analysis and reporting

---

## Integration with Other Skills

This skill works alongside:
- **e2e-testing** - For TDD workflow and test writing guidance
- **e2e-testing-patterns** - For Playwright/Cypress patterns and debugging
- **backend-service-builder** - For service-level integration testing
- **devops-pt2** - For CI/CD pipeline integration

Use this skill for **execution and validation**. Use e2e-testing/e2e-testing-patterns for **writing new tests**.
