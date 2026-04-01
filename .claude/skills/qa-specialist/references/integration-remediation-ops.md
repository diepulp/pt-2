# Integration Test Remediation Operations

Operational patterns for executing the CONTEXT-ROLLOUT-TEMPLATE across bounded contexts. These patterns were extracted from Tier 1 remediation (Loyalty, MTL, TableContext) and apply to all remaining tiers.

**Intake document**: `docs/issues/gaps/testing-arch-remediation/REMAINING-SERVICES-REMEDIATION-PLAN.md`

---

## Table of Contents

1. [Scoping Phase B: Detecting Mocked Unit Tests](#1-scoping-phase-b-detecting-mocked-unit-tests)
2. [Jest Config Split: Node vs Integration](#2-jest-config-split-node-vs-integration)
3. [RUN_INTEGRATION_TESTS Gate Consistency](#3-run_integration_tests-gate-consistency)
4. [Worktree Test Contamination](#4-worktree-test-contamination)
5. [RLS Context RPC Mapping](#5-rls-context-rpc-mapping)
6. [Mode C Two-Phase Auth Setup](#6-mode-c-two-phase-auth-setup)
7. [Blocker Protocol for Non-Auth Failures](#7-blocker-protocol-for-non-auth-failures)
8. [Parallel Dispatch Safety Rules](#8-parallel-dispatch-safety-rules)
9. [Merge Conflict Points](#9-merge-conflict-points)
10. [Baseline Before Rewrite](#10-baseline-before-rewrite)

---

## 1. Scoping Phase B: Detecting Mocked Unit Tests

Files named `*.int.test.ts` or `*.integration.test.ts` are not necessarily real integration tests. During Loyalty remediation, 4 of 7 "integration" files were fully mocked unit tests with zero DB access — they had `RUN_INTEGRATION_TESTS` gates wrapping mocked `jest.fn()` operations.

**Why this matters**: Phase B (Mode C auth rewrite) estimates are inflated if mocked files are counted. Loyalty was scoped at 7 files; actual work was 3.

**Detection heuristic:**

```bash
# Files with no real Supabase client creation are likely mocked
grep -L 'createClient' services/{context}/__tests__/*.int.test.ts

# Files that jest.mock() supabase entirely are mocked unit tests
grep -l "jest.mock.*supabase" services/{context}/__tests__/*.int.test.ts
```

**Action**: Before scoping Phase B, audit each integration file. Mocked files get a reclassification comment header — not a rename (that's churn):

```typescript
/**
 * NOTE: Despite the .int.test.ts naming, this file is a fully mocked unit test.
 * It does not hit the database. The RUN_INTEGRATION_TESTS gate is retained for
 * consistency but all operations are mocked via jest.mock().
 * Reclassified as Unit (Mocked) per {CONTEXT}-POSTURE.md.
 */
```

---

## 2. Jest Config Split: Node vs Integration

PT-2 uses two Jest configs with different file matching:

| Config | Includes | Excludes |
|--------|----------|----------|
| `jest.node.config.js` | `*.test.ts` | `*.int.test.ts`, `*.integration.test.ts` |
| `jest.integration.config.js` | `*.int.test.ts`, `*.integration.test.ts` | Nothing |

**Consequence**: The `test:slice:{context}` scripts use `jest.node.config.js` — they **never run integration tests**, even with `RUN_INTEGRATION_TESTS=1`.

**To verify integration tests post-rewrite:**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  --testPathPatterns='services/{context}/__tests__/' \
  --testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/'
```

The `--testPathIgnorePatterns` flags are required to exclude worktree copies (see §4).

---

## 3. RUN_INTEGRATION_TESTS Gate Consistency

Two gate patterns exist in the codebase:

**Pre-existing (TableContext, some older files)** — checks `'true'` only:
```typescript
const shouldRunIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true';
```

**Canonical (Phase A additions, Loyalty)** — checks both `'true'` and `'1'`:
```typescript
const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';
```

**The canonical pattern must accept both values.** Setting `RUN_INTEGRATION_TESTS=1` silently skips files that only check `=== 'true'`. During Phase A, audit existing gates for this inconsistency and normalize to the canonical form.

Always use `RUN_INTEGRATION_TESTS=true` (not `=1`) when running integration tests manually to avoid this inconsistency until all gates are normalized.

---

## 4. Worktree Test Contamination

`jest.integration.config.js` glob patterns pick up test files from `trees/` and `.claude/worktrees/` directories. Running integration tests without exclusion patterns causes failures from stale worktree code, false failure counts, and confusing output mixing old and new test versions.

**Always add exclusion flags when running integration tests on main:**

```bash
--testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/'
```

**Or use absolute path anchoring:**

```bash
--testPathPatterns='^/absolute/path/services/{context}/__tests__/'
```

This applies to any test run where worktrees exist. The `test:slice:*` scripts are immune (they use `jest.node.config.js` which has its own ignore patterns), but direct `jest.integration.config.js` invocations are vulnerable.

---

## 5. RLS Context RPC Mapping

Three RLS context RPCs exist. Only one is current:

| RPC | Status | Where Used |
|-----|--------|------------|
| `set_rls_context` | **DROPPED** — removed from DB | Nowhere (historical) |
| `set_rls_context_internal` | **Testing-only** — directly sets session vars | Pre-Mode-C integration tests (being replaced) |
| `set_rls_context_from_staff` | **Production** (ADR-024) — derives context from JWT `staff_id` claim | Called internally by RPCs, never by test code |

After Mode C rewrite, **zero** `set_rls_context_internal` calls should remain in rewritten files. Tests should never manually set RLS context — the JWT flow through `set_rls_context_from_staff` handles it.

**Detection:**

```bash
# Find files still using the old patterns
grep -r 'set_rls_context_internal' services/{context}/__tests__/
grep -r "set_rls_context'" services/{context}/__tests__/  # Note: single quote to avoid matching _internal/_from_staff
```

---

## 6. Mode C Two-Phase Auth Setup

The ADR-024 Mode C pattern requires creating the staff DB record BEFORE stamping `staff_id` into the auth user's `app_metadata`. If reversed, the JWT claim points to a non-existent staff record and `set_rls_context_from_staff` fails silently.

**Required order (non-negotiable):**

1. `auth.admin.createUser()` with initial `app_metadata` (casino_id, staff_role — **no staff_id yet**)
2. Insert staff record in DB → returns `staff.id`
3. `auth.admin.updateUserById()` to add `staff_id: staff.id` to `app_metadata`
4. `auth.signInWithPassword()` via **throwaway client** (to avoid polluting setupClient auth state) → get JWT with complete claims
5. Create anon client with `Authorization: Bearer ${accessToken}` header

**Dual-client separation:**
- `setupClient` (service-role): fixture creation, teardown, verification queries
- `supabase` (authenticated anon): all RPC/service calls under test

**Multi-role tests** (e.g., pit_boss + dealer): create separate auth users and authenticated clients per role.

**Multi-casino RLS tests**: create separate auth users in different casino contexts, each with their own authenticated client.

---

## 7. Blocker Protocol for Non-Auth Failures

When integration tests fail for reasons beyond auth during a Mode C rewrite:

1. **Classify**: schema drift, constraint violation, SEC-007 grant conflict, migration regression
2. **Log**: create issue file in `docs/issues/gaps/testing-arch-remediation/{context}-rollout/issues/`
3. **Skip**: use `it.skip` with `BLOCKED:` annotation referencing the issue file
4. **Continue**: proceed with remaining tests
5. **Report**: pass/fail/skip counts with evidence
6. **Never**: weaken assertions to force green

**Example from Tier 1**: TableContext Phase B surfaced `SESSION-GATE-REGRESSION` — a migration re-created `rpc_start_rating_slip` without the PRD-059 session gate check. Agent logged the issue, skipped 2 tests, and reported 34 pass / 2 skip / 0 fail.

---

## 8. Parallel Dispatch Safety Rules

Phase B can be parallelized across bounded contexts despite sharing a Supabase instance, IF:

| Rule | Rationale |
|------|-----------|
| Each agent uses a unique `TEST_PREFIX` | Prevents fixture collision on unique constraints |
| Each agent creates auth users with unique emails | Avoids auth user conflicts |
| Contexts operate on non-overlapping domain tables | No cross-context FK dependencies during test |
| DO NOT parallelize within the same context | Shared fixture state causes nondeterministic failures |

**Proven safe**: Loyalty + TableContext ran in parallel against same Supabase instance. Different domain tables, unique prefixes, self-cleaning fixtures.

**Phase A is always safe to parallelize** — no Supabase required, each agent touches only its own context's files.

---

## 9. Merge Conflict Points

When dispatching parallel worktree agents:

- **`package.json`** is the only conflict point (each agent adds a `test:slice:*` script to the same location)
- Resolution is trivial: keep all entries
- **Merge in agent order** and resolve each `package.json` conflict as it appears
- No other files conflict because each agent touches only its own context's files + one shared file

---

## 10. Baseline Before Rewrite

Before starting a Mode C rewrite, run the integration file in its current state to establish a baseline:

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js {file}
```

Record pass/fail/skip counts. After rewrite, compare:
- **New failures** = rewrite-caused (fix them)
- **Pre-existing failures** = not your scope (document in posture doc)

During Loyalty Phase B, 6 pre-existing failures existed in mocked unit tests. Without the baseline, these would have been incorrectly attributed to the Mode C rewrite.
