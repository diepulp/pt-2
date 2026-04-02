# Tier 3 Phase B — Mode C Auth Rewrite for Infrastructure Surfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite infrastructure integration tests from legacy auth (`set_rls_context_internal` / service-role-for-everything / `skipAuth: true`) to Mode C (ADR-024: authenticated anon client with JWT `staff_id` claim for RPCs, service-role only for fixture setup/teardown).

**Architecture:** Three parallel workstreams targeting the three Tier 3 infrastructure surfaces. Each workstream baselines its files, rewrites auth patterns to Mode C, and verifies green. A fourth workstream handles reclassifications (no Supabase needed).

**Tech Stack:** Jest, Supabase (local), ADR-024 Mode C pattern, `set_rls_context_from_staff` RPC

**Prerequisite:** Supabase must be running (`npx supabase status`). Tier 3 Phase A must be complete (directives + gates on all files — done).

---

## Mode C Pattern Reference

The canonical Mode C rewrite was established in commit `b81aae14` (rating-slip, 54/54 green). Key pattern:

```typescript
// === FIXTURE SETUP (service-role) ===
const setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

// 1. Create auth user WITHOUT staff_id
const { data: userData } = await setupClient.auth.admin.createUser({
  email: `test-pitboss-${Date.now()}@example.com`,
  password: 'test-password',
  email_confirm: true,
  app_metadata: { casino_id: casinoId, staff_role: 'pit_boss' },
});

// 2. Insert staff record → get staff.id
const { data: staff } = await setupClient.from('staff').insert({
  user_id: userData.user.id,
  casino_id: casinoId,
  role: 'pit_boss',
  status: 'active',
}).select().single();

// 3. Stamp staff_id into app_metadata
await setupClient.auth.admin.updateUserById(userData.user.id, {
  app_metadata: { staff_id: staff.id, casino_id: casinoId, staff_role: 'pit_boss' },
});

// 4. Sign in via throwaway client to get JWT
const throwaway = createClient<Database>(supabaseUrl, ANON_KEY);
const { data: session } = await throwaway.auth.signInWithPassword({
  email, password: 'test-password',
});

// === RPC/QUERY CLIENT (authenticated anon) ===
const supabase = createClient<Database>(supabaseUrl, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
});
// RPCs called on this client auto-derive context via set_rls_context_from_staff()
```

**After Mode C:** Zero `set_rls_context_internal` calls in rewritten tests. The JWT flow handles context injection.

---

## Workstream 0: Reclassifications & Cleanup (No Supabase)

**Files:** 4 files, no DB access needed. Can run immediately.

### Task 0.1: Reclassify `wrapped-route.int.test.ts`

**Files:**
- Modify: `lib/server-actions/middleware/__tests__/wrapped-route.int.test.ts`
- Modify: `docs/issues/gaps/testing-arch-remediation/LIB-SERVER-ACTIONS-POSTURE.md`

- [ ] **Step 1:** Read `wrapped-route.int.test.ts` and confirm it has no Supabase client calls, no DB access — only contract/shape assertions
- [ ] **Step 2:** Add reclassification header comment after the directive:
```typescript
/**
 * NOTE: Despite the .int.test.ts naming, this file is a pure contract/shape
 * assertion suite. It does not hit the database. The RUN_INTEGRATION_TESTS gate
 * is retained for consistency but all operations use mock objects.
 * Reclassified as Unit (Contract) per LIB-SERVER-ACTIONS-POSTURE.md.
 */
```
- [ ] **Step 3:** Update posture doc to mark Phase B = "Reclassified as Unit (Contract)"
- [ ] **Step 4:** Run `npx jest --config jest.node.config.js --testPathPatterns='wrapped-route' --no-coverage 2>&1 | tail -5` to verify
- [ ] **Step 5:** Commit: `fix(test): reclassify wrapped-route as unit contract test`

### Task 0.2: Reclassify `player-360-navigation.int.test.ts`

**Files:**
- Modify: `__tests__/player-360-navigation.int.test.ts`
- Modify: `docs/issues/gaps/testing-arch-remediation/ROOT-TESTS-POSTURE.md`

- [ ] **Step 1:** Read file and confirm it's pure URL/navigation logic with no DB access
- [ ] **Step 2:** Add reclassification header comment:
```typescript
/**
 * NOTE: Despite the .int.test.ts naming, this file tests pure URL construction
 * and navigation logic. No database access. The RUN_INTEGRATION_TESTS gate is
 * retained for consistency. Reclassified as Unit (Navigation) per ROOT-TESTS-POSTURE.md.
 */
```
- [ ] **Step 3:** Update posture doc
- [ ] **Step 4:** Verify: `npx jest --config jest.node.config.js --testPathPatterns='player-360-navigation' --no-coverage 2>&1 | tail -5`
- [ ] **Step 5:** Commit: `fix(test): reclassify player-360-navigation as unit navigation test`

### Task 0.3: Remove redundant `skipIfNoEnv` guards

**Files:**
- Modify: `lib/supabase/__tests__/rls-context.integration.test.ts`
- Modify: `lib/supabase/__tests__/rls-jwt-claims.integration.test.ts`

- [ ] **Step 1:** In `rls-context.integration.test.ts`, remove the `skipIfNoEnv` function definition (lines ~59-67) — it's redundant with the `RUN_INTEGRATION` gate
- [ ] **Step 2:** In `rls-jwt-claims.integration.test.ts`, remove `skipIfNoEnv()` calls from individual `it()` blocks (~18 sites) — redundant with top-level gate
- [ ] **Step 3:** Run prettier on both files
- [ ] **Step 4:** Run `RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js --testPathPatterns='rls-context|rls-jwt-claims' --testPathIgnorePatterns='trees/' --no-coverage 2>&1 | tail -10` — expect skipped (no Supabase fixture setup)
- [ ] **Step 5:** Commit: `fix(test): remove redundant skipIfNoEnv guards from rls integration tests`

---

## Workstream 1: lib/supabase Phase B (Supabase Required)

**Files:** 6 integration files (rls-context, rls-financial, rls-jwt-claims, rls-mtl, rls-policy-enforcement, rls-pooling-safety) + pit-boss-financial-txn

**Key insight:** These files test the RLS infrastructure ITSELF. Many `set_rls_context_internal` calls are intentional ops-lane testing. The Mode C rewrite replaces service-role-for-everything with:
- **setupClient** (service-role): fixture creation, teardown, verification
- **authenticated anon client**: RPCs that should go through `set_rls_context_from_staff`
- **Retain `set_rls_context_internal`** ONLY for tests that explicitly verify the ops-lane RPC behavior (not for context injection before business queries)

### Task 1.0: Baseline all lib/supabase integration files

- [ ] **Step 1:** Run each file individually and record pass/fail/skip:
```bash
for f in rls-context rls-financial rls-jwt-claims rls-mtl rls-policy-enforcement rls-pooling-safety pit-boss-financial-txn; do
  echo "=== $f ===" >> /tmp/lib-supabase-baseline.log
  RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
    --testPathPatterns="lib/supabase/__tests__/$f" \
    --testPathIgnorePatterns='trees/' --no-coverage 2>&1 | tail -5 >> /tmp/lib-supabase-baseline.log
done
```
- [ ] **Step 2:** For files that also match `jest.node.config.js` (pit-boss-financial-txn):
```bash
npx jest --config jest.node.config.js --testPathPatterns='pit-boss-financial-txn' --no-coverage 2>&1 | tail -5
```
- [ ] **Step 3:** Record baseline in posture doc. Pre-existing failures are NOT Phase B scope.

### Task 1.1: Rewrite `rls-context.integration.test.ts`

**Files:**
- Modify: `lib/supabase/__tests__/rls-context.integration.test.ts` (737 lines)

**Assessment:** 13 `set_rls_context_internal` calls, 4 `set_rls_context_from_staff` calls. Already tests both ops-lane and production paths. Phase B work:
1. Replace service-role clients used for business queries with authenticated anon clients
2. Keep `set_rls_context_internal` calls that are TESTING the ops-lane RPC itself
3. Replace `set_rls_context_internal` calls that are just INJECTING context before business queries

- [ ] **Step 1:** Read the full file. Classify each `set_rls_context_internal` call:
  - **Category A (keep):** Tests that verify `set_rls_context_internal` itself works (context persistence, isolation, transaction behavior)
  - **Category B (rewrite):** Tests that inject context as setup before running business queries
- [ ] **Step 2:** For Category B calls, create authenticated anon clients per the Mode C pattern
- [ ] **Step 3:** Run prettier
- [ ] **Step 4:** Run: `RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js --testPathPatterns='rls-context\.integration' --testPathIgnorePatterns='trees/' --no-coverage 2>&1 | tail -15`
- [ ] **Step 5:** If failures are auth-related: fix per Mode C pattern. If NOT auth-related: classify, log issue, skip with `BLOCKED:` annotation.
- [ ] **Step 6:** Commit: `fix(test): rewrite rls-context integration auth to Mode C (ADR-024)`

### Task 1.2: Rewrite `rls-financial.integration.test.ts`

**Files:**
- Modify: `lib/supabase/__tests__/rls-financial.integration.test.ts` (843 lines)

**Assessment:** 2 `set_rls_context_internal` calls, already has cross-casino isolation tests with separate auth clients.

- [ ] **Step 1:** Read full file. Identify the 2 `set_rls_context_internal` calls and their purpose.
- [ ] **Step 2:** Replace with Mode C authenticated clients (one per casino for isolation tests)
- [ ] **Step 3:** Run prettier
- [ ] **Step 4:** Verify green
- [ ] **Step 5:** Commit: `fix(test): rewrite rls-financial integration auth to Mode C (ADR-024)`

### Task 1.3: Rewrite `rls-mtl.integration.test.ts`

**Files:**
- Modify: `lib/supabase/__tests__/rls-mtl.integration.test.ts` (1,179 lines)

**Assessment:** 2 `set_rls_context_internal` calls in helper function, 7 createClient instances (service, pitBoss, cashier, admin, dealer, crossCasino).

- [ ] **Step 1:** Read full file. The helper function wrapping `set_rls_context_internal` needs Mode C replacement.
- [ ] **Step 2:** Create authenticated anon clients per role using the Mode C two-phase auth setup
- [ ] **Step 3:** Run prettier
- [ ] **Step 4:** Verify green
- [ ] **Step 5:** Commit: `fix(test): rewrite rls-mtl integration auth to Mode C (ADR-024)`

### Task 1.4: Rewrite `rls-policy-enforcement.integration.test.ts`

**Files:**
- Modify: `lib/supabase/__tests__/rls-policy-enforcement.integration.test.ts` (818 lines)

**Assessment:** 2 `set_rls_context_internal` calls in helper. Same pattern as rls-mtl.

- [ ] Follow same steps as Task 1.3
- [ ] Commit: `fix(test): rewrite rls-policy-enforcement integration auth to Mode C (ADR-024)`

### Task 1.5: Rewrite `rls-pooling-safety.integration.test.ts`

**Files:**
- Modify: `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` (2,352 lines)

**Assessment:** LARGEST FILE. 4 `set_rls_context_internal`, 26 `createClient`, tests connection pooling isolation. Many clients are intentional (testing concurrent connections). Phase B must preserve the concurrent client test structure while switching to Mode C auth.

- [ ] **Step 1:** Read full file. Map all 26 createClient calls — which are service-role (fixture) vs which should be authenticated anon.
- [ ] **Step 2:** Create Mode C authenticated clients. Keep service-role for fixture setup/teardown ONLY.
- [ ] **Step 3:** Verify all `afterAll` teardown covers all client instances (KI-003)
- [ ] **Step 4:** Run prettier
- [ ] **Step 5:** Verify green. This file may have pre-existing failures — compare against baseline (Task 1.0).
- [ ] **Step 6:** Commit: `fix(test): rewrite rls-pooling-safety integration auth to Mode C (ADR-024)`

---

## Workstream 2: lib/server-actions Phase B (Supabase Required)

**Files:** 2 real integration files (audit-log, middleware-chain). wrapped-route handled in WS0.

**Key insight:** These files currently skip auth entirely (`skipAuth: true`). Phase B adds authenticated test cases alongside existing skipAuth tests (don't remove existing coverage — augment it).

### Task 2.0: Baseline lib/server-actions integration files

- [ ] **Step 1:** Run baseline:
```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  --testPathPatterns='lib/server-actions/middleware/__tests__/' \
  --testPathIgnorePatterns='trees/' --no-coverage 2>&1 | tail -10
```
- [ ] **Step 2:** Record pass/fail/skip in posture doc

### Task 2.1: Enhance helpers with Mode C auth setup

**Files:**
- Modify: `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts`
- Modify: `lib/server-actions/middleware/__tests__/helpers/index.ts`

- [ ] **Step 1:** Add `getTestAuthenticatedClient()` function that creates a Mode C authenticated anon client:
```typescript
export async function getTestAuthenticatedClient() {
  const serviceClient = getTestSupabaseServiceClient();
  // Create auth user with staff_id claim
  // Insert staff record
  // Stamp staff_id into app_metadata
  // Sign in and get JWT
  // Return authenticated anon client
}
```
- [ ] **Step 2:** Export from `index.ts`
- [ ] **Step 3:** Commit: `feat(test): add Mode C authenticated client to server-actions test helpers`

### Task 2.2: Add authenticated tests to `middleware-chain.int.test.ts`

**Files:**
- Modify: `lib/server-actions/middleware/__tests__/middleware-chain.int.test.ts`

- [ ] **Step 1:** Read full file. Keep ALL existing `skipAuth: true` tests.
- [ ] **Step 2:** Add a new `describe('Authenticated Chain Execution')` block with at least one test that calls `withServerAction` WITHOUT `skipAuth`, using the authenticated client from Task 2.1.
- [ ] **Step 3:** The test should verify that `set_rls_context_from_staff` is called and RLS context is properly injected.
- [ ] **Step 4:** Run prettier, verify green
- [ ] **Step 5:** Commit: `fix(test): add authenticated middleware chain test (ADR-024 Mode C)`

### Task 2.3: Add authenticated tests to `audit-log.int.test.ts`

**Files:**
- Modify: `lib/server-actions/middleware/__tests__/audit-log.int.test.ts`

- [ ] **Step 1:** Read full file. Keep ALL existing `skipAuth: true` tests.
- [ ] **Step 2:** Add authenticated test case that verifies audit log entry is written with correct `actor_id` from JWT context (not hardcoded).
- [ ] **Step 3:** Run prettier, verify green
- [ ] **Step 4:** Commit: `fix(test): add authenticated audit-log test (ADR-024 Mode C)`

---

## Workstream 3: root __tests__/services Phase B (Supabase Required)

**Files:** 4 integration files under `__tests__/services/`. 3 player-identity files (constraints, integration, rls) need no code changes per posture doc — just verify green.

### Task 3.0: Baseline root __tests__ integration files

- [ ] **Step 1:** Run baseline for all 8 integration files:
```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  --testPathPatterns='__tests__/(constraints|integration|rls|services)/' \
  --testPathIgnorePatterns='trees/' --no-coverage 2>&1 | tail -15
```
- [ ] **Step 2:** Record pass/fail/skip. The player-identity files should pass. Service files may have pre-existing failures.

### Task 3.1: Verify player-identity tests green (no rewrite)

**Files:**
- `__tests__/constraints/player-identity.test.ts`
- `__tests__/integration/player-identity.test.ts`
- `__tests__/rls/player-identity.test.ts`

- [ ] **Step 1:** Run all three with `RUN_INTEGRATION_TESTS=true` and confirm green
- [ ] **Step 2:** If green, mark Phase B complete for these in posture doc. No code changes.
- [ ] **Step 3:** If failures, assess and log per blocker protocol

### Task 3.2: Rewrite `promo-instruments.int.test.ts`

**Files:**
- Modify: `__tests__/services/loyalty/promo-instruments.int.test.ts`

- [ ] **Step 1:** Read full file. Identify auth pattern (service-role + `set_rls_context_internal`?)
- [ ] **Step 2:** Rewrite to Mode C: authenticated anon client for RPCs, service-role for fixtures
- [ ] **Step 3:** Run prettier, verify green
- [ ] **Step 4:** Commit: `fix(test): rewrite promo-instruments integration auth to Mode C (ADR-024)`

### Task 3.3: Rewrite `table-session.int.test.ts`

**Files:**
- Modify: `__tests__/services/table-context/table-session.int.test.ts`

**Assessment:** LARGEST root __tests__ file. 25+ `set_rls_context_internal` calls. Uses service-role for everything. Needs full Mode C rewrite with authenticated clients per role (pit_boss, admin, dealer).

- [ ] **Step 1:** Read full file. Map all `set_rls_context_internal` calls.
- [ ] **Step 2:** Create Mode C authenticated clients per role (pit_boss, admin). Use unique emails with `Date.now()` prefix.
- [ ] **Step 3:** Replace all `set_rls_context_internal` calls with appropriate authenticated client
- [ ] **Step 4:** Run prettier, verify green
- [ ] **Step 5:** If non-auth failures, apply blocker protocol
- [ ] **Step 6:** Commit: `fix(test): rewrite table-session integration auth to Mode C (ADR-024)`

### Task 3.4: Rewrite `shift-metrics.int.test.ts`

**Files:**
- Modify: `__tests__/services/table-context/shift-metrics.int.test.ts`

- [ ] **Step 1:** Read full file. Identify auth pattern.
- [ ] **Step 2:** Rewrite to Mode C
- [ ] **Step 3:** Run prettier, verify green
- [ ] **Step 4:** Commit: `fix(test): rewrite shift-metrics integration auth to Mode C (ADR-024)`

### Task 3.5: Rewrite `finance-telemetry-bridge.int.test.ts`

**Files:**
- Modify: `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts`

**Assessment:** HIGH complexity — requires custom migration triggers not in standard schema. May need blocker protocol.

- [ ] **Step 1:** Read full file. Assess whether custom triggers are present in current migration set.
- [ ] **Step 2:** If triggers exist: rewrite auth to Mode C
- [ ] **Step 3:** If triggers missing: log blocker, skip with `BLOCKED:` annotation
- [ ] **Step 4:** Run prettier, verify green or document skip
- [ ] **Step 5:** Commit: `fix(test): rewrite finance-telemetry-bridge integration auth to Mode C (ADR-024)`

---

## Parallelization Safety

Per `integration-remediation-ops.md` §8, parallel Phase B is safe IF:

| Rule | How We Apply |
|------|-------------|
| Unique TEST_PREFIX per agent | WS1: `rls-t3-`, WS2: `mw-t3-`, WS3: `root-t3-` |
| Unique auth user emails | Include workstream prefix in email: `test-{prefix}-{role}-{Date.now()}@example.com` |
| Non-overlapping domain tables | WS1: RLS policy tables, WS2: audit_log/middleware, WS3: table_session/loyalty |
| No parallel within same context | Each workstream owns its surface exclusively |

**WS0 has no Supabase dependency** — can always run in parallel with any workstream.

---

## Blocker Protocol (from ops doc §7)

When tests fail for non-auth reasons:
1. **Classify:** schema drift, constraint violation, SEC-007 grant conflict, migration regression
2. **Log:** create issue file in `docs/issues/gaps/testing-arch-remediation/`
3. **Skip:** `it.skip('BLOCKED: [issue-file-name] — [description]', ...)`
4. **Continue:** proceed with remaining tests
5. **Report:** pass/fail/skip counts with evidence
6. **Never:** weaken assertions to force green

---

## Verification Gate

After all workstreams complete:
```bash
# Full integration suite
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  --testPathPatterns='lib/supabase|lib/server-actions|__tests__/' \
  --testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/' \
  --no-coverage 2>&1 | tail -20

# Unit suite (regression check)
npx jest --config jest.node.config.js \
  --testPathPatterns='lib/supabase|lib/server-actions|__tests__/' \
  --no-coverage 2>&1 | tail -10
```

Report: total pass / fail / skip counts. Compare against baseline from Tasks 1.0, 2.0, 3.0.

---

## Commit Summary

Expected commits (one per task):
1. `fix(test): reclassify wrapped-route as unit contract test`
2. `fix(test): reclassify player-360-navigation as unit navigation test`
3. `fix(test): remove redundant skipIfNoEnv guards from rls integration tests`
4. `fix(test): rewrite rls-context integration auth to Mode C (ADR-024)`
5. `fix(test): rewrite rls-financial integration auth to Mode C (ADR-024)`
6. `fix(test): rewrite rls-mtl integration auth to Mode C (ADR-024)`
7. `fix(test): rewrite rls-policy-enforcement integration auth to Mode C (ADR-024)`
8. `fix(test): rewrite rls-pooling-safety integration auth to Mode C (ADR-024)`
9. `feat(test): add Mode C authenticated client to server-actions test helpers`
10. `fix(test): add authenticated middleware chain test (ADR-024 Mode C)`
11. `fix(test): add authenticated audit-log test (ADR-024 Mode C)`
12. `fix(test): rewrite promo-instruments integration auth to Mode C (ADR-024)`
13. `fix(test): rewrite table-session integration auth to Mode C (ADR-024)`
14. `fix(test): rewrite shift-metrics integration auth to Mode C (ADR-024)`
15. `fix(test): rewrite finance-telemetry-bridge integration auth to Mode C (ADR-024)`
