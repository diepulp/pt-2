# Remaining Services Remediation Plan

**Issue**: ISSUE-C4D2AA48
**Date**: 2026-04-01
**Status**: Plan — pending execution
**Trigger**: Runtime FetchError on `/admin/settings/valuation` (camelCase/snake_case serialization mismatch in loyalty HTTP client)
**Template**: `CONTEXT-ROLLOUT-TEMPLATE.md` (Steps 1-8)
**Governance**: ADR-044, `TESTING_GOVERNANCE_STANDARD.md` v2.0.0
**Exemplar**: Casino (Slice One), Rating-Slip Mode C rewrite (commit `b81aae14`)

---

## 1. Why This Plan Exists

On 2026-04-01, the valuation settings admin page halted with:

```
FetchError — Validation Failed:
  cents_per_point: Invalid input: expected number, received undefined;
  effective_date: Invalid input: expected string, received undefined;
  version_identifier: Invalid input: expected string, received undefined
```

**Root cause**: `services/loyalty/http.ts:updateValuationRate()` passed a camelCase DTO directly to `mutateJSON()`, but the route handler's Zod schema (`updateValuationPolicySchema`) expects snake_case keys. `mutateJSON` does `JSON.stringify(data)` with no key transformation. All three fields arrived as `undefined`.

**Why no test caught it**: The loyalty bounded context has not been rolled out per the `CONTEXT-ROLLOUT-TEMPLATE.md`. No test exercises the HTTP client → route handler serialization boundary. The route unit test (`route.test.ts`) constructs snake_case bodies by hand. The service roundtrip test (`valuation-policy-roundtrip.int.test.ts`) calls `crud.updateValuationPolicy()` directly. Neither crosses the contract seam where the bug lives.

**The structural argument**: This is not a one-off bug. It is a symptom of an untested contract boundary that the rollout template's integration canary (Step 4) and route-handler exemplar (Step 5) are specifically designed to close. Every un-rolled-out bounded context carries the same class of risk.

---

## 2. Current Rollout Landscape

### Completed (Trusted-Local achieved)

| Slice | Context | Tests | Integration Status | Date |
|-------|---------|-------|--------------------|------|
| 1 | Casino | 451 | Canary green, 6 integration files | 2026-03-14 |
| 2 | Player | 143 | Canary green, 3 integration files | 2026-03-14 |
| 2 | Visit | 162 | Canary green, 3 integration files | 2026-03-14 |
| 3 | RatingSlip | 196 | Mode C rewrite done (`b81aae14`), 54/54 green | 2026-03-31 |

### Partially inventoried (Slice 3 kickoff, not executed)

| Context | Unit Files | Int Files | Directive Coverage | Gate Coverage | Status |
|---------|-----------|-----------|-------------------|---------------|--------|
| TableContext | 25 | 6 | 7/31 (23%) | 5/6 gated | Kickoff only |
| Loyalty | 12 | 9 | 8/19 (42%) | 0/9 gated | Kickoff only |
| MTL | 2 | 0 | 0/2 (0%) | N/A | Kickoff only |

### Not inventoried (no rollout work started)

| Context | Unit Files | Int Files | Directive Coverage | Notes |
|---------|-----------|-----------|-------------------|-------|
| FloorLayout | 1 | 0 | 1/1 (100%) | Minimal surface |
| Measurement | 3 | 0 | 1/3 (33%) | Cross-cutting read models (ADR-039) |
| Player360Dashboard | 1 | 0 | 0/1 (0%) | Analytics mappers only |
| PlayerFinancial | 4 | 0 | 1/4 (25%) | Finance context |
| PlayerImport | 5 | 4 | 1/9 (11%) | Onboarding, active dev |
| PlayerTimeline | 1 | 1 | 0/2 (0%) | Analytics, PLANNED status in SRM |
| RatingSlipModal | 5 | 0 | 5/5 (100%) | Frontend service, directives added `e8f562a` |
| Recognition | 2 | 0 | 2/2 (100%) | Small surface |
| Security | 1 | 1 | 0/2 (0%) | RLS context tests |
| ShiftIntelligence | 3 | 0 | 4/7 (57%) | Operational context |

### Infrastructure test surfaces (not service-scoped)

| Surface | Total Files | Int Files | Directive Coverage | Notes |
|---------|------------|-----------|-------------------|-------|
| lib/supabase | 10 | 6 | 1/10 (10%) | RLS core — highest-risk infra |
| lib/server-actions | 10 | 3 | 0/10 (0%) | Middleware chain — auth pipeline |
| workers/csv-ingestion | 9+142 | 4 | 9/9 (100%) | Already compliant |
| root __tests__ | 15 | 5 | 3/15 (20%) | Dashboard/navigation |

---

## 3. Two-Phase Remediation Model

The rating-slip experience (Slice 3 + commit `b81aae14`) established that remediation has **two distinct phases** per context with fundamentally different automation profiles:

### Phase A: Rollout Template (Steps 1-8) — FULLY AUTOMATABLE

Environment correctness, directive compliance, integration gating, route-handler exemplar, slice script, posture documentation. This is the CONTEXT-ROLLOUT-TEMPLATE.md checklist.

**Agent execution profile**: Phase A is mechanical and deterministic. Every operation has an explicit file list, a concrete code pattern to insert, and a verifiable exit condition. An agent can execute Phase A without judgment calls:

| Operation | Input | Pattern | Verification |
|-----------|-------|---------|-------------|
| Add directive | File list per tier | Insert `/** @jest-environment node */` as line 1 | `grep -c '@jest-environment node' {file}` returns 1 |
| Add gate | File list per tier | Wrap top-level `describe` with `RUN_INTEGRATION_TESTS` conditional | `grep -c 'RUN_INTEGRATION_TESTS' {file}` returns 1 |
| Route boundary exemplar | One per context | Clone Casino exemplar pattern from `services/casino/__tests__/settings-route-boundary.test.ts`, adapt to context's route handler | `npm run test:slice:{context}` passes with new file |
| Slice script | One per context | Add `"test:slice:{context}"` to `package.json` | `npm run test:slice:{context} -- --listTests` shows only intended files |
| Posture doc | One per context | Follow `SLICE-ONE-POSTURE.md` structure | File exists with layer health table |
| Shallow reclassification | `http-contract.test.ts` files | Document in posture doc as Smoke (§9.2) | Noted in posture doc, no code change |

**Agent dispatch**: `/build` with this plan as intake. No Supabase instance required. No human decisions required. Agent should commit per-context (not batched) with §12 disclosure format.

### Phase B: Mode C Auth Rewrite — REQUIRES JUDGMENT + RUNNING SUPABASE

Integration tests that predate ADR-024 use legacy service-role auth or spoofable `set_rls_context()`. These must be rewritten to Mode C (authenticated anon client with JWT `staff_id` claim for RPCs, service-role `setupClient` for fixture creation/teardown). This is substantial — the rating-slip rewrite was 973 insertions, 621 deletions across 4 files.

**Agent execution profile**: Phase B is not fully automatable. Each integration test has unique fixture setup, RPC call patterns, and constraint assumptions that require understanding the test's intent before rewriting auth patterns. The rating-slip Mode C rewrite (`b81aae14`) surfaced two SEC-007 issues that required human judgment to classify as log-vs-fix.

**Agent constraints for Phase B**:

| Constraint | Rationale |
|-----------|-----------|
| **Running Supabase required** | Integration tests execute real RPCs against real DB. Agent must verify `npx supabase status` shows healthy before proceeding. |
| **Scope: one context per agent invocation** | Each context's integration tests have different fixture dependencies. Batching risks cascading failures that obscure root causes. |
| **Blocker protocol: log, don't force** | When an integration test fails for reasons beyond auth (schema drift, constraint violations, SEC-007 grant conflicts), the agent must: (1) classify the failure, (2) log it as an issue file in `docs/issues/`, (3) skip the test with §11-compliant annotation, (4) continue with remaining tests. Do not force tests green by weakening assertions. |
| **Exemplar reference required** | Agent must read commit `b81aae14` diff (`git show b81aae14`) before starting any Phase B context, to internalize the Mode C pattern and known pitfalls. |
| **Verification gate** | After rewriting, run `RUN_INTEGRATION_TESTS=1 npm run test:integration -- --testPathPatterns='services/{context}/'` and report pass/fail/skip counts. Do not claim green without evidence. |

**Agent dispatch**: `/build` per-context with explicit Phase B scope. Requires `npx supabase start` before invocation. Expect agent to surface blockers that need human review before merging.

### Phase dependency

**Phase A is prerequisite for Phase B.** You cannot rewrite auth patterns in integration tests that don't even have the correct runtime directive or gating.

**Not all contexts need Phase B.** Contexts with no integration tests, or whose integration tests already use Mode C, skip Phase B. Contexts where integration tests reference `set_rls_context` (the dropped RPC) are Phase B mandatory.

---

## 4. Remediation Tiers

### Tier 1 — Slice 3 Completion (Immediate)

Complete the three contexts already inventoried in `SLICE-THREE-KICKOFF.md`. RatingSlip is done; TableContext, Loyalty, MTL need execution.

| Context | Phase A Work | Phase B Work | Est. Effort |
|---------|-------------|-------------|-------------|
| **TableContext** | 24 directives, 1 gate, route boundary exemplar, slice script | 6 integration files — audit for ADR-024 auth patterns | 3h (A) + 2-4h (B) |
| **Loyalty** | 3 directives, 9 gates, route boundary exemplar, slice script | 9 integration files — audit for ADR-024 auth patterns; HTTP contract test needed (valuation bug class) | 2h (A) + 3-5h (B) |
| **MTL** | 2 directives, route boundary exemplar, slice script | No integration tests | 1h (A) |

**Priority rationale**: Loyalty is elevated to first within the tier because the valuation bug proves its HTTP contract boundary is actively broken. The serialization mismatch was fixed manually, but no test prevents regression.

#### Loyalty HTTP Contract Canary (New — not in original template)

The valuation bug exposed a gap the rollout template doesn't explicitly cover: **the HTTP client → route handler serialization contract**. The template's integration canary (Step 4) tests service → RPC. The route-handler exemplar (Step 5) tests request → handler. Neither exercises the `http.ts` → route path where key naming must agree.

For loyalty, the integration canary must include a test that:

1. Calls `updateValuationRate()` from `services/loyalty/http.ts`
2. Asserts the serialized body contains snake_case keys matching `updateValuationPolicySchema`
3. Or: invokes the route handler with the body produced by the HTTP function

This pattern should be adopted for any context where DTO key convention (camelCase) diverges from API schema convention (snake_case). The serialization audit (performed alongside this investigation) found that **loyalty is the only service with a confirmed divergence** — all other services use consistent key naming. However, any new service endpoint should include this contract test by default.

#### Tier 1 Execution Order

```
1. Loyalty Phase A (directives, gates, exemplar, slice script)
   └── Loyalty HTTP contract canary (valuation serialization test)
   └── Loyalty Phase B (9 integration files, Mode C audit)

2. MTL Phase A (directives, exemplar, slice script)
   └── No Phase B needed

3. TableContext Phase A (24 directives, 1 gate, exemplar, slice script)
   └── TableContext Phase B (6 integration files, Mode C audit)
```

**Estimated total: 11-15 hours**

---

### Tier 2 — Remaining Service Contexts (Slice 4)

Contexts not yet inventoried. Apply the rollout template from Step 1 (inventory).

| Context | Unit Files | Int Files | Directive Gap | Phase B Needed? | Est. Effort |
|---------|-----------|-----------|---------------|-----------------|-------------|
| **PlayerImport** | 5 | 4 | 8/9 missing | **Yes** — 4 int files, active dev context | 2h (A) + 2-3h (B) |
| **PlayerFinancial** | 4 | 0 | 3/4 missing | No int tests | 1h (A) |
| **ShiftIntelligence** | 7 | 0 | 3/7 missing | No int tests | 1h (A) |
| **Security** | 1 | 1 | 2/2 missing | **Yes** — references `set_rls_context` (confirmed in original remediation plan) | 0.5h (A) + 1-2h (B) |
| **Measurement** | 3 | 0 | 2/3 missing | No int tests | 0.5h (A) |
| **PlayerTimeline** | 1 | 1 | 2/2 missing | **Maybe** — SRM says PLANNED, assess int test | 0.5h (A) + 0-1h (B) |
| **Player360Dashboard** | 1 | 0 | 1/1 missing | No int tests | 0.5h (A) |
| **FloorLayout** | 1 | 0 | 0 (compliant) | No int tests | 0.5h (A) — exemplar + script only |
| **RatingSlipModal** | 5 | 0 | 0 (compliant) | No int tests | 0.5h (A) — exemplar + script only |
| **Recognition** | 2 | 0 | 0 (compliant) | No int tests | 0.5h (A) — exemplar + script only |

**Priority within Tier 2** (risk-ordered):

1. **PlayerImport** — 4 integration files, active development (EXEC-037), highest risk of drift
2. **Security** — RLS context tests reference dropped `set_rls_context`, directly affects auth pipeline
3. **PlayerFinancial** — Finance context, correctness matters
4. **ShiftIntelligence** — Operational context, 7 test files
5. **Measurement** — Cross-cutting read models, lower change frequency
6. **PlayerTimeline** — PLANNED status, assess before investing
7. **FloorLayout, RatingSlipModal, Recognition, Player360Dashboard** — Already compliant on directives or minimal surface; just need exemplar + script

**Estimated total: 8-13 hours**

---

### Tier 3 — Infrastructure Surfaces (Slice 5)

Infrastructure test files are not bounded-context services but carry the highest security risk.

| Surface | Files | Int Files | Directive Gap | Phase B Needed? | Est. Effort |
|---------|-------|-----------|---------------|-----------------|-------------|
| **lib/supabase** | 10 | 6 | 9/10 missing | **Yes** — RLS core, references `set_rls_context` | 1h (A) + 3-4h (B) |
| **lib/server-actions** | 10 | 3 | 10/10 missing | **Yes** — middleware chain, auth pipeline | 1h (A) + 2-3h (B) |
| **root __tests__** | 15 | 5 | 12/15 missing | **Maybe** — assess dashboard/navigation tests | 1h (A) + 1-2h (B) |

**Note**: `workers/csv-ingestion` is already 100% compliant (9/9 directives). No work needed.

**Priority rationale**: `lib/supabase` is first because it contains the RLS policy enforcement tests — the security foundation. `lib/server-actions` is second because it contains the middleware chain tests — the auth pipeline that ADR-024/ADR-030 hardened.

**Estimated total: 9-13 hours**

---

## 5. Aggregate Remediation Summary

| Tier | Scope | Files Affected | Phase A | Phase B | Total Effort |
|------|-------|---------------|---------|---------|-------------|
| 1 | Slice 3 completion (TableContext, Loyalty, MTL) | 53 | 30 directives, 10 gates, 3 exemplars, 3 scripts | 15 int files audit + rewrite | 11-15h |
| 2 | Remaining services (Slice 4) | 30 | 21 directives, 10 exemplars, 10 scripts | 6 int files audit + rewrite | 8-13h |
| 3 | Infrastructure (Slice 5) | 35 | 31 directives | 14 int files audit + rewrite | 9-13h |
| **Total** | **All remaining** | **118** | **82 directives, 10 gates, 13 exemplars, 13 scripts** | **35 int files** | **28-41h** |

---

## 6. Mode C Auth Rewrite Reference

Commit `b81aae14` establishes the canonical Mode C rewrite pattern. Key changes:

### Before (Legacy)

```typescript
// Service-role client for everything — spoofable, violates ADR-024
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
await supabase.rpc('set_rls_context', { p_casino_id: CASINO_ID });
```

### After (Mode C — ADR-024)

```typescript
// Authenticated anon client with JWT staff_id claim for RPCs
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${staffJWT}` } },
});
// RPC derives context from JWT via set_rls_context_from_staff()

// Service-role client ONLY for fixture creation/teardown
const setupClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
```

### Common pitfalls from the rating-slip rewrite

1. **Unique seats**: Tests that create rating slips must use unique `seat_number` per test to avoid constraint violations
2. **`player_loyalty` provisioning**: Tests that touch loyalty must provision a `player_loyalty` row
3. **SEC-007 grant conflicts**: Some RPCs are `SECURITY DEFINER` but call other RPCs that are `INVOKER` — test fidelity gaps documented as issues
4. **`policy_version`**: Tests that touch valuation policy must match current schema version

---

## 7. HTTP Contract Test Pattern (New)

The valuation bug introduced a new test pattern not in the original rollout template. For any service where DTO keys (camelCase) diverge from API schema keys (snake_case):

```typescript
describe('HTTP → Route serialization contract', () => {
  it('updateValuationRate body matches route schema', () => {
    const input: UpdateValuationPolicyInput = {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    };

    // Simulate what http.ts does before calling mutateJSON
    const body = {
      cents_per_point: input.centsPerPoint,
      effective_date: input.effectiveDate,
      version_identifier: input.versionIdentifier,
    };

    // Validate against the same schema the route handler uses
    const result = updateValuationPolicySchema.safeParse(body);
    expect(result.success).toBe(true);
  });
});
```

**When to apply**: Any `http.ts` function that transforms keys before calling `mutateJSON` or `fetchJSON`. The test proves the transformation produces output the route schema accepts.

**Current audit result**: Only `services/loyalty/http.ts:updateValuationRate()` has this pattern. All other services use consistent key naming (either all camelCase or all snake_case from DTO through schema). New endpoints should include this test by default if key transformation is needed.

---

## 8. Exit Criteria

### Per-context (apply to each context in Tiers 1-3)

- [ ] Step 1 inventory complete (all files classified)
- [ ] Step 2 shallow tests reclassified as Smoke (§9.2)
- [ ] Step 3 all server-side test files have `/** @jest-environment node */`
- [ ] Step 4 integration canary green (where integration tests exist)
- [ ] Step 5 route-handler exemplar passes
- [ ] Step 6 slice script runs intended files only
- [ ] Step 7 posture doc written with layer health table
- [ ] Step 8 commit message follows §12 disclosure format

### Phase B (where applicable)

- [ ] All integration tests use Mode C auth (ADR-024)
- [ ] No references to dropped `set_rls_context` RPC
- [ ] `RUN_INTEGRATION_TESTS` gate on all integration test files
- [ ] All integration tests green with `RUN_INTEGRATION_TESTS=1` and running Supabase

### Plan-level

- [ ] All 118 files remediated
- [ ] All 13 route-handler exemplars authored
- [ ] All 13 slice scripts added
- [ ] INDEX.md updated with Tiers 1-3 references
- [ ] FULL-SYSTEM-TEST-POSTURE.md updated to reflect new landscape
- [ ] Promotion checkpoint (§7) evaluated — branch protection criteria reassessed

---

## 9. Relationship to Existing Documents

| Document | Relationship |
|----------|-------------|
| `CONTEXT-ROLLOUT-TEMPLATE.md` | **Normative** — this plan executes the template across remaining contexts |
| `SLICE-THREE-KICKOFF.md` | **Superseded for TableContext/Loyalty/MTL** — this plan incorporates and extends with Phase B and HTTP contract test |
| `INTEGRATION-TEST-REMEDIATION-PLAN.md` | **Superseded** — this plan covers its Phase 6 (broaden coverage) scope |
| `FULL-SYSTEM-TEST-POSTURE.md` | **Input** — system posture informs prioritization; will be updated on completion |
| `TESTING_GOVERNANCE_STANDARD.md` | **Normative** — all work must comply with §3-§12 |
| `rating-slip-rollout/SESSION-HANDOFF-INTEGRATION-TESTS.md` | **Exemplar** — Mode C rewrite pattern for Phase B |
| Commit `b81aae14` | **Exemplar** — canonical Mode C rewrite (rating-slip, 54/54 green) |

---

## 10. Agent Execution Playbook

### Why team dispatch, not build pipeline

The build pipeline (`/build`) is designed for spec-to-production feature delivery with phased gates, checkpoint approvals, and workstream orchestration. That ceremony is counterproductive here because:

1. **No cross-context dependencies** — each context is an independent unit of work with no shared state
2. **No gate approvals needed** — the operations are mechanical and the exit criteria are self-verifiable (directive present? gate present? tests pass?)
3. **Parallelism is the natural shape** — 13 contexts can be remediated simultaneously, not sequentially through pipeline stages

A team of parallel agents in isolated worktrees, each owning one context, executing the same template, and committing independently is the correct execution model.

### Phase A — Parallel team dispatch (no Supabase required)

Each agent runs in an isolated git worktree. All agents execute the same operation set against their assigned context. No coordination between agents is needed.

**Agent brief (common to all Phase A agents)**:

```
You are remediating bounded context "{context}" per the testing rollout
template (CONTEXT-ROLLOUT-TEMPLATE.md). This is Phase A — mechanical
compliance work. No Supabase required.

Read these documents first:
  - docs/issues/gaps/testing-arch-remediation/CONTEXT-ROLLOUT-TEMPLATE.md
  - docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-POSTURE.md
  - services/casino/__tests__/settings-route-boundary.test.ts (exemplar)

Operations:
  1. Inventory: classify all test files in services/{context}/__tests__/
  2. Add `/** @jest-environment node */` to all server-side test files
     that lack it
  3. Add RUN_INTEGRATION_TESTS gate to all integration test files
     (*.int.test.ts, *.integration.test.ts) that lack it
  4. Author route-handler exemplar: clone Casino pattern from
     settings-route-boundary.test.ts, adapt to one GET route handler
     in this context
  5. Add slice script to package.json:
     "test:slice:{context}": "jest --config jest.node.config.js
       --testPathPatterns='services/{context}/__tests__/.*\\.test\\.ts$'"
  6. Write posture doc: {CONTEXT}-POSTURE.md in
     docs/issues/gaps/testing-arch-remediation/ following
     SLICE-ONE-POSTURE.md structure
  7. Reclassify any http-contract.test.ts as Smoke (§9.2) in posture doc

Verification:
  - npm run test:slice:{context} — all non-skipped tests green
  - grep confirms directives and gates present in all target files

Commit with §12 disclosure format.
```

**Tier 1 team** (3 agents in parallel worktrees):

| Agent | Context | Key Files | Extra Work |
|-------|---------|-----------|------------|
| agent-loyalty | Loyalty | 3 unit + 9 integration | HTTP contract canary per §7 (valuation serialization test) |
| agent-mtl | MTL | 2 unit | Smallest surface, no integration tests |
| agent-table-context | TableContext | 24 unit + 6 integration | Largest surface, bulk directive adds |

**Tier 2 team** (up to 10 agents in parallel worktrees):

| Agent | Context | Key Files | Notes |
|-------|---------|-----------|-------|
| agent-player-import | PlayerImport | 5 unit + 4 integration | Active dev, highest drift risk |
| agent-security | Security | 1 unit + 1 integration | Small but high-risk |
| agent-player-financial | PlayerFinancial | 4 unit | No integration tests |
| agent-shift-intelligence | ShiftIntelligence | 7 unit | No integration tests |
| agent-measurement | Measurement | 3 unit | Cross-cutting read models |
| agent-player-timeline | PlayerTimeline | 1 unit + 1 integration | Assess before investing |
| agent-player360 | Player360Dashboard | 1 unit | Minimal surface |
| agent-floor-layout | FloorLayout | 1 unit | Already directive-compliant, exemplar + script only |
| agent-rating-slip-modal | RatingSlipModal | 5 unit | Already directive-compliant, exemplar + script only |
| agent-recognition | Recognition | 2 unit | Already directive-compliant, exemplar + script only |

**Tier 3 team** (3 agents in parallel worktrees):

| Agent | Surface | Key Files | Notes |
|-------|---------|-----------|-------|
| agent-lib-supabase | lib/supabase | 10 files | Directives only (no route exemplar for infra) |
| agent-lib-middleware | lib/server-actions | 10 files | Directives only |
| agent-root-tests | root __tests__ | 15 files | Directives only |

**Merge protocol**: Each agent commits to its worktree branch. After all agents in a tier complete, branches are merged to main sequentially (no merge conflicts expected — each agent touches only its own context's files). The one conflict point is `package.json` (slice scripts) — merge in agent order, resolve trivially.

**Tier sequencing**: Tiers 1-3 can run in parallel if worktree capacity allows. There is no dependency between tiers. However, if `package.json` conflicts are a concern, run Tier 1 first, merge, then Tier 2+3.

### Phase B — Sequential per-context dispatch (running Supabase required)

Phase B cannot be parallelized the same way as Phase A because all agents would share the same Supabase instance and test data. Concurrent integration test runs against the same DB cause fixture collisions and nondeterministic failures.

**Dispatch model**: One agent at a time, each in a worktree, with the Supabase instance dedicated to that agent.

**Pre-flight**:
```bash
npx supabase status  # must show healthy
npx supabase db reset # clean state before each context
```

**Agent brief (common to all Phase B agents)**:

```
You are rewriting integration tests for "{context}" from legacy auth
to Mode C (ADR-024). Supabase must be running.

Prerequisite: Phase A complete for this context (directives + gates in place).

Read these documents first:
  - git show b81aae14 (canonical Mode C rewrite — rating-slip, 54/54 green)
  - docs/issues/gaps/testing-arch-remediation/rating-slip-rollout/
      SESSION-HANDOFF-INTEGRATION-TESTS.md

For each integration test file in services/{context}/__tests__/:
  1. Identify current auth pattern:
     - service-role for everything → rewrite to Mode C
     - set_rls_context (dropped RPC) → rewrite to Mode C
     - Mode C already → verify gate + directive, no rewrite
  2. If rewriting:
     a. Create authenticated anon client with JWT staff_id claim for RPCs
     b. Use service-role setupClient ONLY for fixture creation/teardown
     c. Use unique identifiers per test (seats, IDs) to avoid constraint
        violations
  3. Run the file:
     RUN_INTEGRATION_TESTS=1 npx jest --config jest.integration.config.js {file}
  4. If failure is auth-related: fix per Mode C pattern
  5. If failure is NOT auth-related (schema drift, constraint violation,
     SEC-007 grant conflict):
     a. Classify the failure
     b. Log issue file in docs/issues/ (follow SEC007-*.md pattern)
     c. Skip test with §11-compliant annotation
     d. Continue with remaining tests
  6. NEVER weaken assertions to force green

Final verification:
  RUN_INTEGRATION_TESTS=1 npm run test:integration --
    --testPathPatterns='services/{context}/'
  Report: pass/fail/skip counts with evidence.

Commit with §12 disclosure format.
```

**Phase B dispatch order** (by risk):

| Order | Context | Int Files | Known Risk |
|-------|---------|-----------|------------|
| 1 | Loyalty | 9 | Valuation bug class, highest business impact |
| 2 | TableContext | 6 | Largest operational surface |
| 3 | PlayerImport | 4 | Active development, fixture drift risk |
| 4 | Security | 1 | References dropped `set_rls_context` |
| 5 | PlayerTimeline | 1 | Assess before investing (SRM: PLANNED) |
| 6 | lib/supabase | 6 | RLS core, references `set_rls_context` |
| 7 | lib/server-actions | 3 | Middleware chain, auth pipeline |
| 8 | root __tests__ | 5 | Dashboard/navigation, assess scope |

**Contexts with no Phase B** (no integration tests or already compliant):
MTL, FloorLayout, Measurement, Player360Dashboard, PlayerFinancial,
RatingSlipModal, Recognition, ShiftIntelligence, workers/csv-ingestion.

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Integration tests fail for reasons beyond auth (schema drift, constraint changes) | Medium | Hours lost per file | Phase B blocker protocol: classify, log issue, skip per §11, continue. Do not force green. |
| New endpoints added during remediation introduce new untested contract seams | High | New bugs ship | Rollout template Step 4 canary must be part of any new endpoint PR |
| Phase B rewrites surface SEC-007 grant conflicts (as rating-slip did) | Medium | Blocks test green | Log as issues in `docs/issues/` (established pattern), don't block rollout |
| Effort estimates exceed bounds (41h+) | Medium | Timeline slip | Execute in priority order — Tier 1 alone closes the highest-risk gaps |
| Key transformation bugs exist in services not yet audited | Low | Runtime errors | Serialization audit found loyalty-only divergence; pattern is contained |
| Phase B agent produces false green (weakened assertions) | Low | Silent regression | Verification gate: agent must report pass/fail/skip counts with evidence. Review skipped tests before merge. |
| Supabase not running during Phase B dispatch | High | Wasted agent time | Pre-flight check (`npx supabase status`) is mandatory. Agent must abort if unhealthy. |
