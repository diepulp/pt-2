# Session Handoff: Tier 3 Infrastructure Surfaces Remediation

**Date**: 2026-04-01
**Previous session**: Tier 1 Phase A+B complete (Loyalty, MTL, TableContext)
**Next session intent**: Execute Tier 3 — Infrastructure Surfaces (Slice 5)
**Intake document**: `docs/issues/gaps/testing-arch-remediation/REMAINING-SERVICES-REMEDIATION-PLAN.md` §4 Tier 3

---

## What Was Delivered This Session

### Tier 1 Phase A (Template Compliance) — 3 parallel worktree agents

| Context | Directives | Gates | Route Exemplar | Slice Script | Posture Doc |
|---------|-----------|-------|----------------|-------------|-------------|
| Loyalty | 7 added/fixed | 7/7 | valuation-policy GET + HTTP contract canary | `test:slice:loyalty` | LOYALTY-POSTURE.md |
| MTL | 2 added | N/A | gaming-day-summary GET | `test:slice:mtl` | MTL-POSTURE.md |
| TableContext | 24 added | 1 new + 5 existing | drop-events GET | `test:slice:table-context` | TABLE-CONTEXT-POSTURE.md |

### Tier 1 Phase B (Mode C Auth Rewrite) — 2 parallel worktree agents

| Context | Files Rewritten | Tests Green | Skipped | Blockers |
|---------|----------------|-------------|---------|----------|
| Loyalty | 3 real integration + 4 reclassified | 20/20 | 0 | 6 pre-existing failures in mocked unit tests |
| TableContext | 5 active integration | 36/36 | 2 | SESSION-GATE-REGRESSION (migration lost session gate) |

### Key Artifacts Created
- `REMAINING-SERVICES-REMEDIATION-PLAN.md` — full-scope plan (the intake doc)
- 3 posture docs (LOYALTY, MTL, TABLE-CONTEXT)
- 3 route boundary exemplars + 1 HTTP contract canary
- `SESSION-GATE-REGRESSION.md` issue file
- `/qa-specialist` skill updated with `references/integration-remediation-ops.md` (10 operational patterns)

### Commits on main (not pushed)
```
39ef986  fix(loyalty): snake_case serialization in updateValuationRate + remediation plan
418a294  Merge Loyalty Phase A
a34dd2c  Merge MTL Phase A
3868362  Merge TableContext Phase A
a8e417e  Merge Loyalty Phase B
bae5db0  Merge TableContext Phase B
```

---

## Tier 3 Scope: Infrastructure Surfaces

Tier 3 targets infrastructure test surfaces that are NOT bounded-context services but carry the **highest security risk**. These are the RLS foundation and auth pipeline tests.

### Three surfaces, three agents

| Agent | Surface | Files | Int Files | Directive Gap | Phase B Needed? |
|-------|---------|-------|-----------|---------------|-----------------|
| agent-lib-supabase | `lib/supabase` | 10 | 6 | 9/10 missing | **Yes** — RLS core, references `set_rls_context` |
| agent-lib-middleware | `lib/server-actions` | 10 | 3 | 10/10 missing | **Yes** — middleware chain, auth pipeline |
| agent-root-tests | root `__tests__` | 15 | 5 | 12/15 missing | **Maybe** — assess dashboard/navigation tests |

### Phase A operations (same as Tier 1, adapted for infra)
- Add `/** @jest-environment node */` directive to all server-side test files
- Add `RUN_INTEGRATION_TESTS` gate to integration files (canonical form: check both `'true'` and `'1'`)
- **No route exemplars** for infrastructure surfaces (no route handlers)
- **No slice scripts** for infrastructure (these aren't service contexts)
- Write posture docs per surface

### Phase B considerations
- `lib/supabase` — 6 integration files reference `set_rls_context` (the DROPPED RPC). These need Mode C rewrite or migration to `set_rls_context_internal`/`set_rls_context_from_staff`.
- `lib/server-actions` — 3 integration files test the middleware chain. Assess auth patterns before rewriting.
- `root __tests__` — 5 integration files for dashboard/navigation. Assess whether these are real integration tests or mocked (apply the detection heuristic from the session insights).
- **Supabase must be running** for Phase B.

### Differences from Tier 1
1. **No route boundary exemplars** — these surfaces don't have route handlers
2. **No slice scripts** — no `test:slice:*` for `lib/` directories
3. **`lib/supabase` is the RLS test suite** — most complex Phase B, similar in scope to the rating-slip rewrite
4. **`lib/server-actions` is the auth pipeline** — middleware tests may need different Mode C patterns (testing middleware itself, not through it)

---

## Operational Patterns to Apply (from this session)

1. **Audit before scoping Phase B** — `grep -L 'createClient'` to detect mocked files
2. **Use `RUN_INTEGRATION_TESTS=true`** (not `=1`) until all gates are normalized
3. **Exclude worktrees** — `--testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/'`
4. **Parallel Phase A is safe** — all three agents can run in isolated worktrees
5. **Phase B may need sequential dispatch** — `lib/supabase` and `lib/server-actions` may share RLS test fixtures
6. **Baseline before rewrite** — run each file first to capture pre-existing failures
7. **Blocker protocol** — classify, log issue, skip, continue, never weaken assertions

---

## Pre-flight Checklist for Next Session

```bash
# 1. Verify Supabase running
npx supabase status

# 2. Verify Tier 1 work is on main
git log --oneline -10

# 3. Verify no stale worktrees
git worktree list

# 4. Verify slice tests still pass
npm run test:slice:loyalty 2>&1 | tail -5
npm run test:slice:mtl 2>&1 | tail -5
npm run test:slice:table-context 2>&1 | tail -5

# 5. Check integration tests (with worktree exclusion)
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  --testPathPatterns='services/(loyalty|table-context)/__tests__/' \
  --testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/' \
  2>&1 | tail -10
```

---

## Files to Read First

1. `docs/issues/gaps/testing-arch-remediation/REMAINING-SERVICES-REMEDIATION-PLAN.md` — §4 Tier 3, §10 Agent Execution Playbook
2. `.claude/skills/qa-specialist/references/integration-remediation-ops.md` — operational patterns
3. `lib/supabase/__tests__/` — inventory the 10 files
4. `lib/server-actions/middleware/__tests__/` — inventory the 10 files
5. `__tests__/` — inventory the 15 root test files
