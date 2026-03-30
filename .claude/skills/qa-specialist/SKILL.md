---
name: qa-specialist
description: Run existing E2E and unit test suites, execute pre-release quality gates, produce quality gate reports, validate route handler coverage (QA-005), and enforce QA-006 E2E testing standard for PT-2. This skill should be used when running test suites before deployment, executing quality gate checklists, producing quality reports with verification tier semantics, validating route handler test coverage, or auditing E2E verification taxonomy compliance (Mode A/B/C, E2E vs System Verification vs Local Verification). For writing new E2E tests or debugging flaky tests, use e2e-testing instead. (project)
---

# QA Specialist

Orchestrates test execution, quality gate validation, and reporting for PT-2 casino pit management system. Produces actionable quality assessments with ADR-044 verification tier semantics and QA-006 E2E testing standard compliance.

## When to Use This Skill

- **Pre-release validation**: Run full test suite and report pass/fail status
- **Quality gate execution**: Execute the quality gate checklist before deployment
- **Quality reporting**: Produce quality gate reports with correct green semantics
- **Route handler validation**: Verify QA-005 route handler test coverage
- **E2E taxonomy audit**: Verify QA-006 verification class and auth mode compliance
- **Regression detection**: Identify which tests fail after code changes

**Use `e2e-testing` instead for:** writing new E2E tests, creating fixtures, scaffolding test files, debugging flaky tests, closing coverage gaps.

## Progressive Disclosure

1. **Level 1 (Always loaded)**: Quality gate workflow in this SKILL.md
2. **Level 2 (On demand)**: `references/critical-workflows.md` — Detailed workflow specs with acceptance criteria
3. **Level 3 (On demand)**: `references/test-patterns.md` — PT-2 testing patterns and ADR-044 environment rules

---

## Testing Governance (ADR-044)

All QA activities are governed by the **Testing Governance Standard**, established by ADR-044.

**Source documents:**
- **ADR-044** — `docs/80-adrs/ADR-044-testing-governance-posture.md` (durable decision record)
- **TESTING_GOVERNANCE_STANDARD** — `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` (operational rulebook, v2.0.0)

Key rules for QA:

- **S2 Governing Principle**: Verification is earned in two stages. **Tier 1 (Trusted-Local)**: correct environment, truthful command, meaningful assertions. **Tier 2 (Governance-Grade)**: additionally CI-executed and branch-protection-enforced.
- **S3 Canonical Taxonomy**: 7 layers — static, unit-browser, server-unit, route-handler, integration, E2E, smoke.
- **S4 Environment Contract**: E2E requires real browser + app + Supabase. Server-unit/route-handler require `node`. Unit-browser requires `jsdom`. Misclassification is a governance defect.
- **S5 Verification Tiers**: Trusted-Local, Required, Advisory, Quarantined, Deprecated.
- **S6 Green Semantics**: "Local green" = trusted-local pass. "CI green" = all required checks pass. "Compile green" = lint + type-check + build only. No silent conflation.
- **S9 Route-Handler Policy (QA-005)**: Net-new shallow mock-everything tests prohibited. Replace incrementally as routes are touched.
- **S10 Script Truthfulness**: All test scripts must truthfully describe what they run. No silent exclusions.
- **S11 Skip/Quarantine Policy**: Every skip needs written reason, scope, and resolution plan.

**Note**: QA-001 defines aspirational coverage targets. The governance standard defines what "verified" means. They serve different purposes.

---

## E2E Verification Taxonomy (QA-006)

When reporting E2E coverage, every spec must be classified by its **verification class** and **auth mode**. This prevents cheaper verification layers from inflating coverage claims.

| Class | Auth Mode | What It Proves |
|-------|-----------|---------------|
| `E2E` | Mode B (browser login) | Real browser/app surface works end-to-end |
| `System Verification` | Mode C (authenticated client) | Real JWT/RPC/RLS path works, bypasses browser |
| `Local Verification` | Mode A (dev bypass) | Read-only regression, no auth fidelity |

### Reporting Rules

- **Coverage counts**: Report E2E (Mode B) tests separately from System/Local verification. Raw test count across all modes is a supporting metric, not the primary coverage signal.
- **SECURITY DEFINER RPCs**: All mutation RPCs are SECURITY DEFINER (ADR-024). Tests calling them directly must use **minimum Mode C**. Mode A tests hitting these RPCs will get `UNAUTHORIZED` — this is correct behavior, not a flake.
- **Describe block compliance**: Each spec's top-level describe must follow `'Feature — Class — Mode X (description)'` format. Zero of 17 specs are currently compliant (QA-006 infrastructure gap).
- **E2E tier status**: E2E tests are currently **advisory** (Trusted-Local only). They do not run in CI and do not block merge. Quality reports must state this tier clearly.

For the full auth mode decision matrix and RPC→Mode table, refer to the `e2e-testing` skill's `references/qa006-compliance.md`.

---

## Critical Workflows (QA-001)

Per `docs/40-quality/QA-001-service-testing-strategy.md`, E2E tests cover **10% of total tests** focused on these critical flows:

### 1. Player Management Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Search | Fuzzy player name search | TODO: not yet implemented |
| Create | Register new player profile | TODO: not yet implemented |
| Enroll | Casino-specific enrollment | TODO: not yet implemented |
| Update | Modify player information | TODO: not yet implemented |

> **Note**: Player management E2E tests do not exist yet. Related coverage exists in `e2e/workflows/player-360-panels.spec.ts` (PRD-023) and `e2e/workflows/player-360-navigation.spec.ts` (PRD-022), which cover search/navigation but not CRUD operations.

### 2. Visit Lifecycle Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Check-in | Start player visit (idempotent) | `e2e/workflows/visit-continuation.spec.ts` |
| Active session | Verify single active visit constraint | `e2e/workflows/visit-continuation.spec.ts` |
| Check-out | End visit with timestamp | `e2e/workflows/visit-continuation.spec.ts` |
| Ghost visit | Unidentified player gaming session | `e2e/workflows/visit-continuation.spec.ts` |

### 3. Rating Slip Workflow

#### 3.1 State Machine Operations
| Step | Description | Test File |
|------|-------------|-----------|
| Start | Begin rating slip at table/seat | `e2e/workflows/rating-slip-modal.spec.ts` |
| Pause | Pause session timer | `e2e/workflows/rating-slip-modal.spec.ts` |
| Resume | Resume paused session | `e2e/workflows/rating-slip-modal.spec.ts` |
| Close | End session with duration calculation | `e2e/workflows/rating-slip-modal.spec.ts` |

#### 3.2 Move Player (PRD-008)
| Step | Description | Test File |
|------|-------------|-----------|
| Move to new table | Close current slip + start new | `e2e/workflows/move-player.spec.ts` |
| Move to new seat | Same table, different seat | `e2e/workflows/move-player.spec.ts` |
| Preserve visit | visit_id continuity after move | `e2e/workflows/move-player.spec.ts` |

#### 3.3 Constraints & Invariants
| Step | Description | Test File |
|------|-------------|-----------|
| Seat uniqueness | Only one active slip per seat | `e2e/workflows/rating-slip-modal.spec.ts` |
| State transitions | Invalid transitions rejected (422) | `e2e/workflows/rating-slip-modal.spec.ts` |
| Idempotency | All mutations require Idempotency-Key | `e2e/workflows/rating-slip-modal.spec.ts` |

### 4. Loyalty Rewards Workflow
| Step | Description | Test File |
|------|-------------|-----------|
| Balance query | Get current loyalty points | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Mid-session reward | Issue reward during active visit | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Accrual on close | Points earned at slip close | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Redemption | Spend loyalty points | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |
| Idempotency | Verify no duplicate rewards | `e2e/workflows/loyalty-accrual-lifecycle.spec.ts` |

---

## Route Handler Testing (QA-005 / ADR-044 S9)

Route handler tests verify the HTTP boundary layer: request validation, parameter handling, response status codes, response body shape, and error paths. They require `node` environment (ADR-044 S4).

**Reference**: `docs/40-quality/QA-005-route-handler-testing.md`

### Test Infrastructure

**Location**: `lib/testing/route-test-helpers.ts`

```typescript
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

const request = createMockRequest('POST', '/api/v1/rating-slips', {
  headers: { 'Idempotency-Key': 'test-key', 'Content-Type': 'application/json' },
  body: { player_id: 'uuid', table_id: 'uuid', seat_number: 1 },
});

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

### Key Testing Patterns

1. **Jest Environment Directive** (Required per ADR-044 S4)
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

3. **ServiceHttpResult Envelope Validation**
   ```typescript
   expect(body).toMatchObject({
     ok: true,
     code: 'OK',
     data: expect.any(Object),
     requestId: expect.any(String),
   });
   ```

### Running Route Handler Tests

```bash
# All rating-slip route tests (38 tests across 10 suites)
npm test -- app/api/v1/rating-slips

# Specific action tests
npm test -- app/api/v1/rating-slips/[id]/pause/__tests__/route.test.ts

# HTTP contract tests
npm test -- services/rating-slip/__tests__/http-contract
```

---

## Quick Start: Quality Gate Execution

### Full Quality Gate (Pre-Release)

```bash
# Step 1: Verify environment
npx supabase status          # Verify Supabase is running
curl -s http://localhost:3000/api/health | jq .  # Verify dev server

# Step 2: Run unit tests (node environment)
npm run test:unit:node > /tmp/unit-test-output.log 2>&1

# Step 3: Run route handler tests
npm test -- app/api/v1/rating-slips > /tmp/route-test-output.log 2>&1

# Step 4: Run E2E workflow tests
npm run e2e:playwright > /tmp/e2e-output.log 2>&1

# Step 5: View E2E report
npx playwright show-report
```

### Workflow-Specific Validation

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
```

### Debug Mode

```bash
npm run e2e:playwright:ui       # UI mode for debugging
npm run e2e:playwright:debug    # Debug with inspector
```

---

## Quality Gate Checklist

Before approving a release, verify all gates pass. Per ADR-044, report each gate's verification tier honestly.

### GATE-0: Verification Posture Check (ADR-044 S5/S8)
- [ ] All test layers have a declared verification tier
- [ ] Local verification floor met: static checks pass + at least one trusted-local functional layer
- [ ] "Green" claims use correct semantics (ADR-044 S6)

### GATE-0.5: E2E Verification Taxonomy (QA-006)
- [ ] E2E test count broken down by verification class (E2E / System / Local)
- [ ] SECURITY DEFINER mutation paths tested at minimum Mode C
- [ ] No Mode A tests misreported as canonical E2E coverage
- [ ] Describe blocks follow `'Feature — Class — Mode X'` format
- [ ] E2E advisory tier status stated in report (not governance-grade until CI Required)

### GATE-1: Critical Workflow Coverage
- [ ] Visit lifecycle: check-in, active constraint, check-out, ghost visits
- [ ] Rating slip state machine: start, pause, resume, close, duration
- [ ] Rating slip move player: table move, seat move, visit continuity
- [ ] Rating slip constraints: seat uniqueness, idempotency, state transitions
- [ ] Loyalty rewards: balance, mid-session, accrual, redeem

### GATE-2: Performance Thresholds
- [ ] Dashboard LCP <= 2.5s (p95)
- [ ] API response times <= 500ms (p95)

### GATE-3: Security Validation
- [ ] RLS policies enforce casino scoping
- [ ] Cross-casino data access denied
- [ ] Authentication required for protected routes

### GATE-4: Error Handling
- [ ] No Postgres error codes leak to UI
- [ ] Graceful degradation on network failure
- [ ] Idempotency prevents duplicate mutations

### GATE-5: Route Handler Tests (QA-005 / ADR-044 S9)
- [ ] Route handler tests pass: `npm test -- app/api/v1/rating-slips`
- [ ] HTTP contract tests pass: `npm test -- services/rating-slip/__tests__/http-contract`
- [ ] All route-handler tests use `/** @jest-environment node */` directive
- [ ] No net-new shallow mock-everything tests

### GATE-6: Temporal Integrity (TEMP-003 S7, PRD-027)
- [ ] Gaming day boundary tests pass: 05:50 local, 06:10 local, 00:10 UTC
- [ ] DST transition tests pass: spring forward, fall back
- [ ] No JS gaming day computation in query paths
- [ ] RSC pages use `getServerGamingDay()`, client components use `useGamingDay()`

---

## Quality Gate Report Template

Per ADR-044 S6, use precise green semantics — distinguish compile green, local functional green, and CI green.

```markdown
## Quality Gate Report - [Date]

### Verification Posture (ADR-044)
- Green type: [compile green | local functional green | CI green]
- Verification floor: [met | not met]
- Layers at trusted-local: [list]
- Layers at required (CI-enforced): [list]
- Layers at advisory: [list]
- Quarantined layers: [list with exit criteria]

### E2E Verification Taxonomy (QA-006)
- E2E tier: [advisory (trusted-local only) | CI advisory | CI required]
- Total E2E specs: [X]

| Verification Class | Auth Mode | Spec Count | Test Count |
|-------------------|-----------|------------|------------|
| E2E | Mode B (browser login) | [X] | [Y] |
| System Verification | Mode C (authenticated client) | [X] | [Y] |
| Local Verification | Mode A (dev bypass) | [X] | [Y] |

- Describe block QA-006 compliance: [X of Y specs compliant]
- SECURITY DEFINER mutation paths at Mode C+: [X of Y]

### Test Execution Summary
- Total tests: [X]
- Passed: [Y]
- Failed: [Z]
- Flaky: [W]

### Critical Workflow Status
| Workflow | Status | Verification Tier | Auth Mode | Notes |
|----------|--------|-------------------|-----------|-------|
| Visit Lifecycle | PASS/FAIL | trusted-local/required | B/C | [details] |
| Rating Slip State Machine | PASS/FAIL | trusted-local/required | B/C | [details] |
| Rating Slip Move Player | PASS/FAIL | trusted-local/required | B/C | [details] |
| Loyalty Rewards | PASS/FAIL | trusted-local/required | C | [details] |
| Route Handler Tests | PASS/FAIL | trusted-local/required | n/a (Jest) | [38 tests, 10 suites] |

### Blockers
[List any blocking issues]

### Recommendation
[PASS/FAIL with rationale - state which green type this represents]
[If E2E is advisory: "E2E tests are trusted-local only — not governance-grade until promoted to CI Required"]
```

---

## Coverage Gap Awareness

Before reporting coverage status, check the gap analysis:
`docs/issues/gaps/testing-arch-remediation/playwright-gate-e2e/E2E-WORKFLOW-GAP-ANALYSIS.md`

14 uncovered workflows are documented. Do not report full coverage without acknowledging these gaps.

---

## Resources

### Governing Documents
- `docs/80-adrs/ADR-044-testing-governance-posture.md` — Testing governance decision record
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — Operational rulebook (v2.0.0)
- `docs/40-quality/QA-001-service-testing-strategy.md` — Coverage targets
- `docs/40-quality/QA-005-route-handler-testing.md` — Route handler testing policy
- `docs/40-quality/QA-006-e2e-testing-standard.md` — E2E testing standard (auth modes, verification taxonomy, CI promotion)

### Bundled References
- `references/critical-workflows.md` — Detailed workflow specs with acceptance criteria
- `references/test-patterns.md` — PT-2 testing patterns and ADR-044 environment rules

### Bundled Scripts
- `scripts/run-quality-gate.sh` — Automated quality gate execution

---

## Integration with Other Skills

This skill works alongside:
- **e2e-testing** — For writing new tests, creating fixtures, debugging flaky tests
- **backend-service-builder** — For service-level integration testing
- **devops-pt2** — For CI/CD pipeline integration

Use this skill for **execution, validation, and reporting**. Use e2e-testing for **writing and debugging tests**.
