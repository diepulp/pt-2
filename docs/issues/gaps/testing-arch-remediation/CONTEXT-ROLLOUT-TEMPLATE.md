# Bounded Context Testing Rollout Template

**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md (§ references below)
**Exemplar:** Casino (Slice One, commit `065c2c4`)
**Purpose:** Reusable checklist to promote any bounded context to Trusted-Local verification tier

---

## Prerequisites

Before starting a context rollout:

- [ ] Jest runtime split is in place (`jest.node.config.js`, `jest.integration.config.js`) — §4
- [ ] At least one prior context has achieved Trusted-Local (Casino = baseline)
- [ ] SRM consulted for owned tables and route surface of target context

---

## Step 1: Inventory (read-only audit)

Classify every test file in `services/{context}/__tests__/` against the §3 canonical taxonomy.

- [ ] List all test files in the context
- [ ] Classify each file into exactly one canonical layer:

| File | Canonical Layer (§3) | Current Runtime | Correct Runtime | Status |
|------|----------------------|-----------------|-----------------|--------|
| `mappers.test.ts` | Server-Unit (§3.3) | jsdom (legacy) | node | Needs migration |
| `http-contract.test.ts` | Route-Handler (§3.4) | jsdom (legacy) | node | Assess: behaviour or shallow? |
| `*.int.test.ts` | Integration (§3.5) | node | node + Supabase | Verify gate pattern |

- [ ] Identify all route handlers owned by this context (`app/api/v1/{routes}/route.ts`)
- [ ] Note pre-existing failures (run under `jest.node.config.js` to discover)

**Output:** Completed inventory table. No code changes yet.

---

## Step 2: Shallow Test Reclassification (§9.2)

Audit existing tests for the shallow/theatre anti-pattern before claiming any verification status.

- [ ] Identify tests that only assert exports exist, mock everything, or verify no behaviour
- [ ] Reclassify as **Smoke (§3.7)** — they verify import resolution, nothing more
- [ ] Do NOT count reclassified smoke tests toward Trusted-Local status
- [ ] Do NOT delete or skip them — they remain as-is but are honestly labeled
- [ ] Record reclassification in the posture doc (Step 7)

**Anti-pattern markers** (from §9 and Slice One findings):
- Test mocks the entire service layer and asserts only that the handler function exists
- Test creates a mock request/response but never asserts on status code, body shape, or error path
- Test imports a module and asserts `typeof handler === 'function'`

---

## Step 3: Runtime Verification (§4)

Migrate all server-side unit tests to the correct node runtime.

- [ ] Verify all server-unit and route-handler tests have `/** @jest-environment node */` directive
- [ ] Run: `npm run test:unit:node -- --testPathPatterns='services/{context}/'`
- [ ] For pre-existing failures, apply §11-compliant skip annotation:

```typescript
// SKIP: Pre-existing failure — [specific reason: e.g., "stale mock after RPC signature change"].
// Scope: [describe block or file name].
// Exit criteria: [concrete fix condition, e.g., "update mock to match v2 RPC args" or "deprecate by YYYY-MM-DD"].
// Ref: TESTING_GOVERNANCE_STANDARD §11
describe.skip('...', () => { ... });
```

- [ ] Confirm zero NEW failures introduced by runtime migration
- [ ] Verify integration test files (`.int.test.ts` / `.integration.test.ts`) have `RUN_INTEGRATION_TESTS` gate pattern:

```typescript
const describeIntegration = process.env.RUN_INTEGRATION_TESTS
  ? describe
  : describe.skip;
```

---

## Step 4: Integration Canary (§3.5 — Integration Test layer)

Create or verify one representative integration canary for the context's RPC/contract surface.

**What it proves:** Schema validation, type contracts, enum drift prevention, algorithm determinism — same pattern as `setup-wizard-rpc.int.test.ts`.

- [ ] Pick ONE representative RPC or contract surface for canary
- [ ] Ensure `/** @jest-environment node */` directive
- [ ] Ensure `RUN_INTEGRATION_TESTS` gate (describe.skip when env var unset)
- [ ] Test structure follows Casino exemplar:
  - Type contracts (compile-time): RPC args/returns, enum sync, no spoofable params
  - Schema validation (runtime): Zod schema parsing
  - Behavioural assertions: algorithm correctness, state transitions
- [ ] Run: `npm run test:integration:canary -- services/{context}/`
- [ ] Confirm canary passes

**File naming:** `services/{context}/__tests__/{rpc-name}.int.test.ts`

---

## Step 5: Route-Handler Test (§3.4 — Route-Handler layer)

Create one exemplar route-handler test following the Casino boundary test pattern.

**What it proves:** HTTP boundary contract — request validation, response status, body shape, error paths, casino_id scoping.

**What it does NOT prove:** RLS enforcement, tenant isolation, database behaviour. Those require Integration tests (§3.5) against a live Supabase instance. Do not conflate the two.

- [ ] Pick ONE route handler (prefer GET — simplest contract, cleanest exemplar)
- [ ] Follow Casino exemplar pattern (`settings-route-boundary.test.ts`):
  - Mock `withServerAction` → inject controlled `MiddlewareContext` (supabase, correlationId, rlsContext)
  - Mock `createClient` → avoid `next/headers` cookies() unavailability in Jest
  - Chainable Supabase query mock with spy tracking for `.eq()` scoping assertions
- [ ] Required test cases (minimum 3):
  1. **Happy path**: 200 status + response body shape assertion
  2. **Scoping assertion**: Confirm `casino_id` from RLS context passes through to query filter
  3. **Error path**: Appropriate status code + error code when resource not found
- [ ] Ensure `/** @jest-environment node */` directive

**File naming:** `services/{context}/__tests__/{route-name}-route-handler.test.ts`

---

## Step 6: Slice Script (§10 — Script Truthfulness)

Add a focused test script for this context.

- [ ] Add to `package.json`:

```json
"test:slice:{context}": "jest --config jest.node.config.js --testPathPatterns='services/{context}/__tests__/.*\\.test\\.ts$'"
```

- [ ] Verify it runs only the intended files: `npm run test:slice:{context} -- --listTests`
- [ ] Verify it passes: `npm run test:slice:{context}`

---

## Step 7: Posture Documentation (§5 + §12)

Update the testing posture with layer health states and a §12-compliant change disclosure.

### 7a: Layer Health Table (§5)

Add to posture doc or create `SLICE-{N}-POSTURE.md`:

```markdown
## {Context} Bounded Context

**Verification Tier:** Trusted-Local (§5)
**Achieved:** YYYY-MM-DD

### Layer Health

| Layer (§3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (schemas, mappers) | Trusted-Local | Healthy | `npm run test:slice:{context}` |
| Route-Handler ({route}) | Trusted-Local | Healthy | `{file}-route-handler.test.ts` |
| Integration ({rpc} canary) | Trusted-Local | Healthy | `{file}.int.test.ts` |
| Existing shallow tests | Advisory | Compromised | Reclassified as smoke (§9.2) |

### Tenancy Verification Gap
Route-handler tests verify handler contracts with mocked middleware context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
verification requires integration tests against a running Supabase instance.

### Theatre Freeze (§9.1)
- No new shallow/mock-everything tests in this context
- New route-handler tests must follow the exemplar pattern
- Existing shallow tests are reclassified as smoke, not removed
```

### 7b: Skip Registry (§11)

If any tests were skipped in Step 3, list them:

```markdown
### Skipped Tests

| Test | Reason | Exit Criteria |
|------|--------|---------------|
| `{file}:{describe}` | {reason} | {fix condition or deprecation date} |
```

---

## Step 8: Change-Control Disclosure (§12)

The commit message for this rollout MUST include:

```
{Context} bounded context: Trusted-Local verification achieved

1. What changed: {context} tests migrated to node runtime, integration
   canary and route-handler exemplar added, shallow tests reclassified
2. Why: Testing governance remediation per ADR-044 / ISSUE-C4D2AA48
3. Layers gained: Server-Unit, Route-Handler, Integration (canary) →
   Trusted-Local. Shallow tests → Advisory/Smoke reclassification.
4. Confidence: Increased — {context} now has honest local verification
   under correct runtime with behavioural assertions
5. Compensating controls: N/A (confidence increased)
6. Exit criteria for advisory layers: Shallow tests replaced incrementally
   as routes are touched (§9.5)
```

---

## Gate: Pass Criteria

All must be true before the context is declared Trusted-Local:

- [ ] `npm run test:slice:{context}` — all non-skipped tests green under node runtime
- [ ] `npm run test:integration:canary -- services/{context}/` — canary green
- [ ] Zero overlap between node and integration configs for this context's files
- [ ] All skipped tests documented per §11
- [ ] Existing shallow tests reclassified per §9.2 (not counted as verification)
- [ ] Layer health table written per §5
- [ ] Commit message follows §12 disclosure format
- [ ] Posture doc updated with Trusted-Local status

---

## Promotion Checkpoint (§7 — evaluate after 2+ contexts)

After two or more bounded contexts achieve Trusted-Local, evaluate branch protection promotion:

| §7 Criterion | Status |
|---------------|--------|
| 1. Jest environments correctly split | Met (Slice One) |
| 2. At least one context Trusted-Local | Met (Casino) |
| 3. Unit test execution in CI (advisory) | **Not yet — add CI test job** |
| 4. Stable signal observation period | **Not yet — observe after CI job added** |

When all four are met, enable branch protection and promote CI test job to required status check. This converts Trusted-Local layers to governance-grade merge protection (Tier 2, §2).

---

## Suggested Rollout Order

Based on surface size, existing test coverage, business criticality, and dependency structure:

| Order | Context | Rationale |
|-------|---------|-----------|
| 1 | **Casino** | Done (Slice One) |
| 2 | **Player** | Foundational identity context, small test surface (6 unit, 0 integration), 8 route handlers — clean starting point |
| 3 | **Visit** | Core operational context, 2 existing integration tests to adopt, 6 route handlers |
| 4 | **RatingSlip** | Core telemetry, 3 existing integration tests, 11 route handlers — largest operational surface |
| 5 | **TableContext** | Largest test surface (18 unit, 1 integration), 15 route handlers — bulk migration |
| 6+ | Loyalty, MTL, FloorLayout, PlayerImport, etc. | Lower priority, smaller surfaces |

---

## Reference: Casino Exemplar Files

These are the source-of-truth patterns to replicate:

| Artifact | Path |
|----------|------|
| Integration canary | `services/casino/__tests__/setup-wizard-rpc.int.test.ts` |
| Route-handler test | `services/casino/__tests__/settings-route-boundary.test.ts` |
| Node Jest config | `jest.node.config.js` |
| Integration Jest config | `jest.integration.config.js` |
| Node setup | `jest.setup.node.ts` |
| Posture doc | `docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-POSTURE.md` |
| Runbook | `docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-RUNBOOK.md` |
