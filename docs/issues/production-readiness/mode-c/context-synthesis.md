## Mode C Migration — Context Synthesis

> **SUPERSEDED IN PART (2026-04-09):** DA review and per-file triage corrected several claims below. Authoritative sources:
> - **File counts:** `canonical-file-list.md` (17 Phase B targets, 19 already Mode C, 25 misnamed non-integration tests)
> - **RPC seams:** `rpc_get_visit_loyalty_summary` and `rpc_get_visit_last_segment` are internal SQL callees with zero TypeScript callers — targeted transitively via parent RPCs, not directly
> - **Helper:** `getTestAuthenticatedClient()` is scoped to one surface — replaced by `createModeCSession` (auth-only, zero domain fixtures). See FIB-H Section N.
> - **Scope:** Phase A is excluded from FIB scope (prerequisite, not migration work). Effort estimates below include Phase A and are therefore inflated for Phase B alone.

Here's the full picture from the domain expert research:

### What Mode C Is

**Two-phase auth pattern (ADR-024):** Tests create an authenticated anon client carrying a JWT with `staff_id` claim, then RPCs derive context server-side via `set_rls_context_from_staff()`. Service-role is used **only** for fixture setup/teardown. This catches RLS bugs, grant gaps, and auth pipeline failures that service-role clients silently bypass.

### Current State

| Category | Files | Status |
|----------|-------|--------|
| **Already Mode C** (mixed: service-role fixtures + authenticated business logic) | ~23 | Done |
| **Already Mode C** (anon-only) | ~24 | Done |
| **Service-role only** (the migration targets) | ~11 | **Needs rewrite** |

> **CORRECTED:** Per-file triage (`canonical-file-list.md`) found: 19 already Mode C, 17 Phase B targets (9 service-role-biz + 3 legacy-context + 3 mixed + 2 assess-first), and 25 files misnamed as `.int.test.ts` that are actually mocks, type-only assertions, or stubs. The "58% using service_role" from the production report was inflated by these misclassifications.

### Existing Infrastructure

- ~~**`getTestAuthenticatedClient()`** — canonical helper at `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts` handles the full 5-phase Mode C setup~~ **CORRECTED:** This helper is scoped to 3 files in `lib/server-actions/middleware/__tests__/`. It bundles auth + domain fixtures — wrong abstraction for cross-context use. Replaced by `createModeCSession` (auth-only ceremony, zero domain fixtures, caller-provided identity claims). See FIB-H Section N.
- **Exemplar commit** `b81aae14` — rating-slip rewrite (973 insertions, 621 deletions, 54/54 green)
- **Governance docs** — ADR-044, TESTING_GOVERNANCE_STANDARD.md, CONTEXT-ROLLOUT-TEMPLATE.md

### Two Critical RPCs With Zero Test Coverage

- `rpc_get_visit_loyalty_summary` — only mentioned in docs, never actually called in any test
- `rpc_get_visit_last_segment` — same situation

> **CORRECTED:** These are internal SQL composition functions with zero TypeScript `.rpc()` callers. They are called only from PL/pgSQL inside `rpc_get_player_recent_sessions` and `rpc_get_last_session_context`. Coverage is achieved transitively by migrating `visit-continuation.integration.test.ts` (#2 in canonical file list) to Mode C — it exercises both parent RPCs.

### Resolution Architecture (from REMAINING-SERVICES-REMEDIATION-PLAN.md)

**Phase A (mechanical, no Supabase):** Add `@jest-environment node` directives, `RUN_INTEGRATION_TESTS` gates, route-handler exemplars, slice scripts, posture docs. ~82 directive changes across 13 contexts.

**Phase B (judgment required, running Supabase):** Rewrite auth patterns from service-role/`set_rls_context_internal` to Mode C. **Sequential per-context** (shared Supabase instance). ~35 integration files across 8 contexts.

### Execution Tiers (by risk)

| Tier | Contexts | Phase B Files | Effort |
|------|----------|---------------|--------|
| **1** | Loyalty (9 int), TableContext (6 int), MTL (none) | 15 | 11-15h |
| **2** | PlayerImport (4), Security (1), + 8 others (Phase A only) | 5 | 8-13h |
| **3** | lib/supabase (6), lib/server-actions (2), root __tests__ (5) | 13 | 9-13h |

**Total: 28-41h estimated, 35 integration files needing Phase B rewrite.**

> **CORRECTED:** This estimate includes Phase A (out of FIB scope) and counts 35 files that per-file triage reduced to 17 Phase B targets. Phase B-only effort is estimated lower — 6 HIGH, 8 MED, 3 LOW complexity files.

### Key Constraints

1. **Running Supabase required** for Phase B — `npx supabase status` pre-flight
2. **One context at a time** for Phase B (fixture collisions otherwise)
3. **Blocker protocol** — classify non-auth failures, log as issue, skip with annotation, never weaken assertions
4. **Phase A is prerequisite** for Phase B per context

### Detailed plan already exists

`docs/superpowers/plans/2026-04-01-tier3-phase-b-mode-c-rewrite.md` has a complete task-by-task plan for Tier 3 infrastructure surfaces (15 commits). `docs/issues/gaps/testing-arch-remediation/REMAINING-SERVICES-REMEDIATION-PLAN.md` covers all tiers with agent execution playbooks.

**Ready to proceed.** Which tier/context do you want to start with, or should I draft a consolidated execution plan?