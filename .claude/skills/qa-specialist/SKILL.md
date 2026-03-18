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

## Testing Governance (ADR-044)

All QA activities are governed by the **Testing Governance Standard**, established by ADR-044.

**Source documents:**
- **ADR-044** — `docs/80-adrs/ADR-044-testing-governance-posture.md` (durable decision record)
- **TESTING_GOVERNANCE_STANDARD** — `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` (operational rulebook, v2.0.0)

Key rules for QA:

- **§2 Governing Principle — Two-Tier Verification**: Verification is earned in two stages. **Tier 1 (Trusted-Local)**: runs in correct environment, invoked by truthful command, produces behaviorally meaningful assertions. **Tier 2 (Governance-Grade Merge Protection)**: additionally executes automatically in CI and is enforced via required branch-protection checks. Tier 1 is required before promotion to Tier 2.
- **§3 Canonical Taxonomy**: 7 layers — static, unit-browser, server-unit, route-handler, integration, E2E, smoke. Every test file must declare one primary canonical layer.
- **§4 Environment Contract**: E2E requires real browser + app + Supabase. Server-unit/route-handler require `node`. Unit-browser requires `jsdom`. Integration requires `node` + running Supabase. Misclassification is a governance defect (durable rule — applies immediately).
- **§5 Verification Tiers**: **Trusted-Local** (honest local verification, correct runtime, does not block merge), **Required** (promotion target — all trusted-local conditions plus CI execution and branch-protection enforcement, blocks merge), **Advisory** (exists but not yet honest enough to be trusted), **Quarantined** (known degraded, documented owner + exit criteria + non-governing statement), **Deprecated** (scheduled for removal).
- **§6 Green Semantics**: "Local green" = trusted-local layers pass in correct runtime. "CI green" = all required checks passed in CI. "Compile green" = lint + type-check + build only. No silent conflation of these categories.
- **§9 Route-Handler and Shallow Test Policy (QA-005)**: Net-new mock-everything/existence-only tests are prohibited. Existing shallow tests reclassified as smoke coverage. Replace incrementally as routes are touched. At least one exemplar test demonstrating correct pattern required.
- **§10 Script Truthfulness**: All test scripts, configs, and CI jobs must truthfully describe what they run. No silent exclusions. Durable rule — applies immediately.
- **§11 Skip/Quarantine Policy**: Every skip must have a written reason, scope, and resolution plan. Quarantines need owner, exit criteria, and explicit non-governing statement. Hidden exclusions are prohibited.
- **§12 Test Change-Control**: Any change affecting testing posture (configs, scripts, CI workflows, exclusion patterns, tier changes) must disclose what changed, why, and confidence impact.

**Note**: QA-001 defines aspirational coverage targets. The governance standard defines what "verified" means. They serve different purposes.

---

## Critical Workflows (QA-001)

Per `docs/40-quality/QA-001-service-testing-strategy.md`, E2E tests cover **10% of total tests** focused on these critical flows:

### 1. Player Management Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Search | Fuzzy player name search | TODO: `e2e/workflows/player-management.spec.ts` (not yet implemented) |
| Create | Register new player profile | TODO: `e2e/workflows/player-management.spec.ts` (not yet implemented) |
| Enroll | Casino-specific enrollment | TODO: `e2e/workflows/player-management.spec.ts` (not yet implemented) |
| Update | Modify player information | TODO: `e2e/workflows/player-management.spec.ts` (not yet implemented) |

> **Note**: Player management E2E tests do not exist yet. Related coverage exists in `e2e/workflows/player-360-panels.spec.ts` (PRD-023) and `e2e/workflows/player-360-navigation.spec.ts` (PRD-022), which cover player search/navigation but not CRUD operations.

### 2. Visit Lifecycle Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Check-in | Start player visit (idempotent) | `e2e/workflows/visit-continuation.spec.ts` |
| Active session | Verify single active visit constraint | `e2e/workflows/visit-continuation.spec.ts` |
| Check-out | End visit with timestamp | `e2e/workflows/visit-continuation.spec.ts` |
| Ghost visit | Unidentified player gaming session | `e2e/workflows/visit-continuation.spec.ts` |

> **Note**: `visit-continuation.spec.ts` covers PRD-017 (Start From Previous Session) — recent sessions API, visit continuation, `visit_group_id` tracking, and max-1-open-visit constraint. General check-in/check-out/ghost-visit E2E tests are not yet separated into a dedicated file.

### 3. Rating Slip Workflow

> **Coverage gap**: A dedicated `rating-slip-lifecycle.spec.ts` does not exist. State machine operations (start/pause/resume/close), update operations, and constraint tests are partially covered by `rating-slip-modal.spec.ts` (PRD-008 modal integration) and `move-player.spec.ts` (PRD-020). A standalone lifecycle spec should be created to close this gap.

#### 3.1 State Machine Operations
| Step | Description | Test File |
|------|-------------|-----------|
| Start | Begin rating slip at table/seat | `e2e/workflows/rating-slip-modal.spec.ts` |
| Pause | Pause session timer (open → paused) | `e2e/workflows/rating-slip-modal.spec.ts` |
| Resume | Resume paused session (paused → open) | `e2e/workflows/rating-slip-modal.spec.ts` |
| Close | End session with duration calculation | `e2e/workflows/rating-slip-modal.spec.ts` |
| Duration | Verify pause intervals excluded | `e2e/workflows/rating-slip-modal.spec.ts` |

#### 3.2 Move Player Operation (PRD-008)
| Step | Description | Test File |
|------|-------------|-----------|
| Move to new table | Close current slip + start new at destination | `e2e/workflows/move-player.spec.ts` |
| Move to new seat | Same table, different seat | `e2e/workflows/move-player.spec.ts` |
| Preserve visit | Verify visit_id continuity after move | `e2e/workflows/move-player.spec.ts` |
| Move with avg bet | Transfer average bet to new slip | `e2e/workflows/move-player.spec.ts` |

#### 3.3 Update Operations
| Step | Description | Test File |
|------|-------------|-----------|
| Update average bet | Modify bet amount on open/paused slip | `e2e/workflows/rating-slip-modal.spec.ts` |
| Multiple bet updates | Verify multiple updates before close | `e2e/workflows/rating-slip-modal.spec.ts` |
| Close with financial | Record chips-taken on close (player exists) | `e2e/workflows/rating-slip-modal.spec.ts` |

#### 3.4 Constraints & Invariants
| Step | Description | Test File |
|------|-------------|-----------|
| Seat uniqueness | Only one active slip per seat | `e2e/workflows/rating-slip-modal.spec.ts` |
| State transitions | Invalid transitions rejected (422) | `e2e/workflows/rating-slip-modal.spec.ts` |
| Idempotency | All mutations require Idempotency-Key | `e2e/workflows/rating-slip-modal.spec.ts` |
| Ghost visit slips | Rating slips for unidentified players | `e2e/workflows/rating-slip-modal.spec.ts` |

#### 3.5 Cross-Context Queries
| Step | Description | Test File |
|------|-------------|-----------|
| Block table close | Cannot close table with open slips | `e2e/workflows/rating-slip-modal.spec.ts` |
| Modal data | BFF aggregates 5 contexts (slip, visit, player, loyalty, financial) | `e2e/workflows/rating-slip-modal.spec.ts` |

### 4. Loyalty Rewards Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Balance query | Get current loyalty points | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Mid-session reward | Issue reward during active visit | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Accrual on close | Points earned at slip close | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Redemption | Spend loyalty points | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Idempotency | Verify no duplicate rewards | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |

---

## Route Handler Testing (QA-005 / ADR-044 §9)

Route handler tests are a canonical test layer (ADR-044 §3.4) that verify the HTTP boundary layer: request validation, parameter handling, response status codes, response body shape, and error paths. They require `node` environment (ADR-044 §4).

**Governance**: ADR-044 §9 prohibits net-new shallow mock-everything tests. Existing shallow tests are reclassified as smoke coverage. New route-handler tests must assert on observable HTTP behavior with minimal mocking.

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

1. **Jest Environment Directive** (Required per ADR-044 §4)
   ```typescript
   /** @jest-environment node */
   ```
   Route-handler tests MUST run under `node` environment. A global `jsdom` default silently misclassifies server-side tests — this is a governance defect per ADR-044 §4.

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
- [ ] All route-handler tests use `/** @jest-environment node */` directive (ADR-044 §4)
- [ ] No net-new shallow/existence-only tests — must assert on HTTP behavior (ADR-044 §9)

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
# Rating slip modal (BFF aggregation, state machine via UI)
npx playwright test e2e/workflows/rating-slip-modal.spec.ts

# Move player operation (PRD-020)
npx playwright test e2e/workflows/move-player.spec.ts

# Visit continuation (PRD-017)
npx playwright test e2e/workflows/visit-continuation.spec.ts

# Loyalty accrual lifecycle
npx playwright test e2e/workflows/loyalty-accrual-lifecycle.spec.ts

# Player 360 panels (PRD-023) and navigation (PRD-022)
npx playwright test e2e/workflows/player-360-panels.spec.ts
npx playwright test e2e/workflows/player-360-navigation.spec.ts

# All rating slip tests (modal + move)
npx playwright test e2e/workflows/rating-slip-modal.spec.ts e2e/workflows/move-player.spec.ts
```

### Debug Mode

Investigate failures interactively:

```bash
# Run with UI for debugging
npx playwright test --ui

# Run headed to see browser
npx playwright test --headed

# Debug specific test
npx playwright test rating-slip-modal.spec.ts --debug
```

---

## Quality Gate Checklist

Before approving a release, verify all gates pass. Per ADR-044, distinguish between verification tiers: gates relying on **trusted-local** layers are honest developer verification but not governance-grade. Gates relying on **required** layers (CI + branch protection enforced) are governance-grade merge evidence. Report each gate's verification tier honestly (ADR-044 §6 green semantics).

### GATE-0: Verification Posture Check (ADR-044 §5/§8)
- [ ] All test layers have a declared verification tier (trusted-local, required, advisory, quarantined, or deprecated)
- [ ] No layers exist in an ambiguous or undeclared state
- [ ] Local verification floor met: static checks pass + at least one trusted-local functional layer in correct runtime
- [ ] "Green" claims use correct semantics: "local green" vs "CI green" vs "compile green" (ADR-044 §6)

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

### GATE-6: Temporal Integrity (TEMP-003 §7, PRD-027)
- [ ] Gaming day boundary tests pass: 05:50 local, 06:10 local, 00:10 UTC
- [ ] DST transition tests pass: spring forward, fall back
- [ ] `rpc_current_gaming_day()` reflects `casino_settings` changes immediately
- [ ] No JS gaming day computation in query paths (`toISOString().slice()`, `new Date()` arithmetic)
- [ ] RSC pages use `getServerGamingDay()` — not JS date math
- [ ] Client components use `useGamingDay()` from `hooks/casino/use-gaming-day`
- [ ] Triggers call `compute_gaming_day()` — no inline boundary logic

### GATE-4: Error Handling
- [ ] No Postgres error codes leak to UI
- [ ] Graceful degradation on network failure
- [ ] Idempotency prevents duplicate mutations

### GATE-5: Route Handler Tests (QA-005 / ADR-044 §9)
- [ ] Route handler tests pass: `npm test -- app/api/v1/rating-slips`
- [ ] HTTP contract tests pass: `npm test -- services/rating-slip/__tests__/http-contract`
- [ ] All route exports validated (prevents 404 regressions)
- [ ] ServiceHttpResult envelope format verified
- [ ] No net-new shallow mock-everything tests (ADR-044 §9 prohibition)
- [ ] Route-handler tests run under `node` environment, not `jsdom` (ADR-044 §4)

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

Summarize results for stakeholders. Per ADR-044 §6, use precise green semantics — distinguish compile green, local functional green, and CI green.

```markdown
## Quality Gate Report - [Date]

### Verification Posture (ADR-044)
- Green type: [compile green | local functional green | CI green]
- Verification floor: [met | not met] (ADR-044 §8)
- Layers at trusted-local: [list]
- Layers at required (CI-enforced): [list]
- Layers at advisory: [list]
- Quarantined layers: [list with exit criteria]

### Test Execution Summary
- Total tests: [X]
- Passed: [Y]
- Failed: [Z]
- Flaky: [W]

### Critical Workflow Status
| Workflow | Status | Verification Tier | Notes |
|----------|--------|-------------------|-------|
| Player Management | PASS/FAIL | trusted-local/required | [details] |
| Visit Lifecycle | PASS/FAIL | trusted-local/required | [details] |
| Rating Slip State Machine | PASS/FAIL | trusted-local/required | [details] |
| Rating Slip Move Player | PASS/FAIL | trusted-local/required | [details] |
| Rating Slip Modal/BFF | PASS/FAIL | trusted-local/required | [details] |
| Loyalty Rewards | PASS/FAIL | trusted-local/required | [details] |
| Route Handler Tests | PASS/FAIL | trusted-local/required | [38 tests, 10 suites] |
| HTTP Contract Tests | PASS/FAIL | trusted-local/required | [8 contracts validated] |

### Blockers
[List any blocking issues]

### Recommendation
[PASS/FAIL with rationale — state which green type this represents]
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

### Governing Documents
- `docs/80-adrs/ADR-044-testing-governance-posture.md` — Testing governance decision record
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — Operational rulebook (v2.0.0)
- `docs/40-quality/QA-001-service-testing-strategy.md` — Aspirational coverage targets (not enforced)
- `docs/40-quality/QA-005-route-handler-testing.md` — Route handler testing policy

### references/
- `critical-workflows.md` - Detailed workflow specifications with acceptance criteria
- `test-patterns.md` - PT-2 specific testing patterns and anti-patterns

### scripts/
- `run-quality-gate.sh` - Automated quality gate execution script

---

## Integration with Other Skills

This skill works alongside:
- **e2e-testing** - For TDD workflow and test writing guidance
- **e2e-testing-patterns** - For Playwright/Cypress patterns and debugging
- **backend-service-builder** - For service-level integration testing
- **devops-pt2** - For CI/CD pipeline integration

Use this skill for **execution and validation**. Use e2e-testing/e2e-testing-patterns for **writing new tests**.
