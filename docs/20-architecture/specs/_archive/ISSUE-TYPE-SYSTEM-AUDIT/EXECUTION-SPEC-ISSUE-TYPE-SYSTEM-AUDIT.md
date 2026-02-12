---
# EXECUTION-SPEC: ISSUE-TYPE-SYSTEM-AUDIT
# Type System Staleness Remediation
# Source: docs/issues/ISSUE-TYPE-SYSTEM-AUDIT-2026-02-03.md
# Generated: 2026-02-04
# Nature: Code cleanup — no new features, tables, or RPCs

prd: ISSUE-TYPE-SYSTEM-AUDIT
prd_title: "Supabase Type System Audit — Staleness Remediation"
service: CrossCutting
mvp_phase: null  # Remediation, not a feature phase

workstreams:
  WS1:
    name: Gaming-Day Shim Deletion
    description: >
      Delete dead shim lib/gaming-day/rpc.ts (G1/G2 protocol violation).
      Update 2 consumers to call supabase.rpc() directly using canonical types.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "lib/gaming-day/server.ts (modified — inline RPC calls)"
      - "services/player360-dashboard/crud.ts (modified — inline RPC call)"
      - "lib/gaming-day/rpc.ts (DELETED)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 2 files modified, 1 file deleted
    risk: low
    mitigation: "type-check immediately after; public API (getServerGamingDay) unchanged"

  WS2:
    name: Loyalty Service Cast Removal
    description: >
      Remove all (supabase.rpc as any) and (supabase as any) casts in loyalty context.
      Files: services/loyalty/crud.ts (~8 casts), services/loyalty/rollups.ts (~1 cast),
      services/loyalty/promo/crud.ts (~11 casts). Also remove data as any in crud.ts:489
      if it resolves after RPC cast removal. Covers: H1, H2, L2.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "services/loyalty/crud.ts (modified — 8 casts removed)"
      - "services/loyalty/rollups.ts (modified — 1 cast removed)"
      - "services/loyalty/promo/crud.ts (modified — 11 casts removed)"
    gate: type-check
    estimated_complexity: medium
    blast_radius: 3 files modified, 20 casts removed
    risk: medium
    mitigation: >
      Run npm run type-check after this WS completes. Any remaining type errors
      indicate RPC signature mismatch — investigate individually, do NOT re-add cast.
      promo/crud.ts has (supabase as any).from() casts — may indicate table access
      bypasses requiring separate investigation.

  WS3:
    name: Rating-Slip Service Cast Removal
    description: >
      Remove (supabase.rpc as any) casts in rating-slip bounded context.
      Files: services/rating-slip/crud.ts (2 casts: rpc_list_closed_slips_for_gaming_day,
      rpc_start_from_previous), services/rating-slip-modal/rpc.ts (1 cast: rpc_move_player).
      Covers: H1, H2.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "services/rating-slip/crud.ts (modified — 2 casts removed)"
      - "services/rating-slip-modal/rpc.ts (modified — 1 cast removed)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 2 files modified, 3 casts removed
    risk: low
    mitigation: "Run npm run type-check after this WS. These are well-typed RPCs."

  WS4:
    name: Table-Context Service Cast Removal
    description: >
      Remove (supabase.rpc as any) casts in table-context bounded context.
      Files: services/table-context/shift-cash-obs.ts (4 casts),
      services/table-context/shift-metrics/service.ts (3 casts),
      services/table-context/table-session.ts (2 casts).
      Covers: H1, H2.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "services/table-context/shift-cash-obs.ts (modified — 4 casts removed)"
      - "services/table-context/shift-metrics/service.ts (modified — 3 casts removed)"
      - "services/table-context/table-session.ts (modified — 2 casts removed)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 3 files modified, 9 casts removed
    risk: low
    mitigation: "Run npm run type-check after this WS."

  WS5:
    name: Dashboard & Misc Cast Removal
    description: >
      Remove (supabase.rpc as any) cast in hooks/dashboard/use-dashboard-stats.ts
      for rpc_get_dashboard_stats. Covers: H1, H2.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "hooks/dashboard/use-dashboard-stats.ts (modified — 1 cast removed)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 1 file modified, 1 cast removed
    risk: low
    mitigation: "Run npm run type-check after this WS."

  WS6:
    name: Import Path Corrections
    description: >
      H3: services/player360-dashboard/mappers.ts:10 — change Json import from
      @/types/remote/database.types to @/types/database.types (G1 violation).
      M2: services/loyalty/__tests__/points-accrual-calculation.integration.test.ts:28 —
      change absolute path to @/types/database.types (portability fix).
      L3: lib/supabase/server.ts:6 — change import { Database } to import type { Database }
      (consistency fix).
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "services/player360-dashboard/mappers.ts (modified — import path fix)"
      - "services/loyalty/__tests__/points-accrual-calculation.integration.test.ts (modified — import path fix)"
      - "lib/supabase/server.ts (modified — import type fix)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 3 files modified, 0 behavioral changes
    risk: negligible
    mitigation: "Run npm run type-check. Json type is structurally identical."

  WS7:
    name: Infrastructure Cleanup
    description: >
      M3: Delete orphaned utils/supabase/client.ts (0 importers confirmed via blast
      radius analysis — 100% duplicate of lib/supabase/client.ts).
      M4: Fix 6 middleware test files using {} as any for Supabase mocks — replace with
      as unknown as SupabaseClient<Database> typed doubles.
      Files: compositor.test.ts, tracing.test.ts, audit.test.ts, idempotency.test.ts,
      rls.test.ts, auth.test.ts.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1, WS2, WS3, WS4, WS5, WS6]
    outputs:
      - "utils/supabase/client.ts (DELETED)"
      - "lib/server-actions/middleware/__tests__/compositor.test.ts (modified)"
      - "lib/server-actions/middleware/__tests__/tracing.test.ts (modified)"
      - "lib/server-actions/middleware/__tests__/audit.test.ts (modified)"
      - "lib/server-actions/middleware/__tests__/idempotency.test.ts (modified)"
      - "lib/server-actions/middleware/__tests__/rls.test.ts (modified)"
      - "lib/server-actions/middleware/__tests__/auth.test.ts (modified)"
    gate: test-pass
    estimated_complexity: low
    blast_radius: 1 file deleted, 6 test files modified
    risk: negligible
    mitigation: >
      utils/supabase/client.ts has 0 importers (confirmed). Test mock changes
      validated by running npm test on affected files.

  WS8:
    name: Navigator Type Declaration
    description: >
      L1: Add types/navigator.d.ts declaration for navigator.userAgentData.
      Affects 3 files using (navigator as any).userAgentData:
      player-360-header-content.tsx, empty-states.tsx, use-search-keyboard.ts.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "types/navigator.d.ts (NEW)"
      - "components/player-360-header-content.tsx (modified — remove as any)"
      - "components/empty-states.tsx (modified — remove as any)"
      - "hooks/player-360/use-search-keyboard.ts (modified — remove as any)"
    gate: type-check
    estimated_complexity: low
    blast_radius: 1 file created, 3 files modified
    risk: negligible
    mitigation: "Type declaration is additive. Run type-check to verify."

  WS9:
    name: Full Validation & Regression Check
    description: >
      Run all validation gates. Verify zero (supabase.rpc as any) and
      (supabase as any) casts remain in runtime code. Verify zero imports from
      @/types/remote/ in runtime code. Run full test suite and build.
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS1, WS2, WS3, WS4, WS5, WS6, WS7, WS8]
    outputs: []
    gate: build
    estimated_complexity: low
    blast_radius: 0 files modified (validation only)
    risk: none
    mitigation: "N/A — read-only validation"

# Execution Phases — with per-bounded-context type-check mitigation
execution_phases:
  - name: "Phase 1 — P0/P1 Remediation (Parallel)"
    parallel: [WS1, WS2, WS3, WS4, WS5, WS6, WS8]
    gates: [type-check]
    mitigation: >
      CRITICAL: Run npm run type-check after EACH workstream completes (not just
      at phase end). If any WS fails type-check, STOP that WS — investigate the
      RPC signature mismatch. Do NOT re-add the as any cast. Other parallel WS
      continue unaffected. Report per-WS type-check results individually.

  - name: "Phase 2 — Infrastructure Cleanup"
    parallel: [WS7]
    gates: [type-check, test-pass]
    mitigation: >
      Run npm test on the 6 modified test files to verify mock changes.
      Client deletion is safe (0 importers confirmed).

  - name: "Phase 3 — Final Validation"
    parallel: [WS9]
    gates: [type-check, lint, test-pass, build]
    mitigation: >
      Regression grep checks: verify zero matches for
      (supabase.rpc as any), (supabase as any), from '@/types/remote/'
      in runtime code (app/, services/, lib/, hooks/, components/).

# Validation Gates
gates:
  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0, no type errors"

  lint:
    command: "npm run lint"
    success_criteria: "Exit code 0"

  test-pass:
    command: "npm test"
    success_criteria: "All tests pass"

  build:
    command: "npm run build"
    success_criteria: "Exit code 0"

# Regression Checks (post-completion)
regression_checks:
  - name: "No runtime as-any RPC casts"
    command: "grep -rn '(supabase.rpc as any)\\|(supabase as any)' services/ lib/ hooks/ app/ components/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v node_modules"
    success_criteria: "Zero matches"

  - name: "No runtime remote type imports"
    command: "grep -rn \"from '@/types/remote/\" services/ lib/ hooks/ app/ components/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v node_modules"
    success_criteria: "Zero matches"

  - name: "No absolute path imports"
    command: "grep -rn \"from '/home/\" services/ lib/ hooks/ app/ components/ --include='*.ts' --include='*.tsx'"
    success_criteria: "Zero matches"

# External Dependencies
external_dependencies: []

# Risks and Mitigations
risks:
  - risk: "RPC signature mismatch after cast removal (especially loyalty/promo with 11 casts)"
    likelihood: medium
    mitigation: "Per-WS type-check; investigate mismatches individually; canonical types confirmed current"

  - risk: "(supabase as any).from() in promo/crud.ts may indicate table access not in generated types"
    likelihood: medium
    mitigation: "If type-check fails on .from() calls, verify table exists in canonical types; may need db:types-local regeneration"

  - risk: "Removing data as any post-processing casts reveals return type mismatches"
    likelihood: low
    mitigation: "Add explicit type annotations or type guards instead of re-casting"
---

# EXECUTION-SPEC: ISSUE-TYPE-SYSTEM-AUDIT — Supabase Type System Remediation

## Overview

Remediate all protocol violations identified in the Type System Audit (2026-02-03). Canonical types are current — all `as any` casts, dead shims, and import violations are now unnecessary artifacts from a resolved S1/S2 staleness incident.

## Scope

**In Scope:**
- Remove 37 `as any` casts in runtime code (30+ RPC bypasses, navigator API)
- Delete dead shim `lib/gaming-day/rpc.ts` (G1/G2 violation)
- Fix 3 import path violations (remote types, absolute path, value import)
- Delete orphaned duplicate `utils/supabase/client.ts`
- Fix 6 untyped test mocks in middleware tests
- Add `navigator.d.ts` type declaration

**Out of Scope:**
- Schema migrations (none needed — canonical types are current)
- RLS policy changes
- New RPCs or tables
- CI gate implementation (documented in issue for future work)

## Architecture Context

**Governing protocol:** `docs/issues/dual-type-system/DB-CONTRACT-STALENESS-PROTOCOL.md`

**Protocol guardrails being enforced:**
- **G1** — Single canonical import (`@/types/database.types` only)
- **G2** — No type-system mixing (no remote types in runtime)
- **G3** — No casts around `.rpc(...)` calls

## Mitigation Strategy

**Per-bounded-context type-check**: After each workstream removes its `as any` casts, run `npm run type-check` immediately. This isolates type errors to the specific bounded context that introduced them, rather than discovering all failures at phase end.

**On type-check failure**: Do NOT re-add the `as any` cast. Instead:
1. Check if the RPC exists in `types/database.types.ts`
2. Compare parameter names at call site vs generated type signature
3. Compare return type expectations vs generated return type
4. Fix the call site to match the canonical type contract

## Workstream Details

### WS1: Gaming-Day Shim Deletion

**Purpose**: Remove dead `lib/gaming-day/rpc.ts` shim that violates G1/G2 by importing remote types into runtime code.

**Blast radius**: 2 consumers — `lib/gaming-day/server.ts` and `services/player360-dashboard/crud.ts`

**Changes**:
1. Delete `lib/gaming-day/rpc.ts`
2. Update `lib/gaming-day/server.ts` to call `supabase.rpc('rpc_current_gaming_day', ...)` directly
3. Update `services/player360-dashboard/crud.ts` to call `supabase.rpc('rpc_gaming_day_range', ...)` directly

**Public API unchanged**: `getServerGamingDay()` and `getServerGamingDayAt()` signatures do not change.

### WS2: Loyalty Service Cast Removal

**Purpose**: Remove 20 `as any` casts across loyalty bounded context.

**Files**:
- `services/loyalty/crud.ts` — 8 casts (rpc_accrue_on_close, rpc_redeem, rpc_manual_credit, rpc_apply_promotion, rpc_issue_mid_session_reward, rpc_get_player_ledger, rpc_get_player_loyalty_balance, data as any)
- `services/loyalty/rollups.ts` — 1 cast (rpc_get_loyalty_summary)
- `services/loyalty/promo/crud.ts` — 11 casts (promo RPCs + table access)

**Risk note**: `promo/crud.ts` uses `(supabase as any).from(...)` which may indicate table name mismatches, not just RPC bypasses. Investigate on type-check failure.

### WS3: Rating-Slip Service Cast Removal

**Purpose**: Remove 3 `as any` casts in rating-slip bounded context.

**Files**:
- `services/rating-slip/crud.ts` — 2 casts (rpc_list_closed_slips_for_gaming_day, rpc_start_from_previous)
- `services/rating-slip-modal/rpc.ts` — 1 cast (rpc_move_player)

### WS4: Table-Context Service Cast Removal

**Purpose**: Remove 9 `as any` casts in table-context bounded context.

**Files**:
- `services/table-context/shift-cash-obs.ts` — 4 casts
- `services/table-context/shift-metrics/service.ts` — 3 casts
- `services/table-context/table-session.ts` — 2 casts

### WS5: Dashboard Cast Removal

**Purpose**: Remove 1 `as any` cast in dashboard hook.

**File**: `hooks/dashboard/use-dashboard-stats.ts` — 1 cast (rpc_get_dashboard_stats)

### WS6: Import Path Corrections

**Purpose**: Fix 3 import path violations.

**Changes**:
1. `services/player360-dashboard/mappers.ts:10` — `@/types/remote/database.types` → `@/types/database.types`
2. `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts:28` — absolute path → `@/types/database.types`
3. `lib/supabase/server.ts:6` — `import { Database }` → `import type { Database }`

### WS7: Infrastructure Cleanup

**Purpose**: Delete orphaned duplicate and fix untyped test mocks.

**Changes**:
1. Delete `utils/supabase/client.ts` (0 importers confirmed)
2. Fix 6 middleware test files: replace `{} as any` with `as unknown as SupabaseClient<Database>`

### WS8: Navigator Type Declaration

**Purpose**: Add proper type declaration for `navigator.userAgentData` browser API.

**Changes**:
1. Create `types/navigator.d.ts` with `UserAgentData` interface
2. Remove `(navigator as any).userAgentData` casts in 3 component/hook files

### WS9: Full Validation & Regression Check

**Purpose**: Verify all remediation is complete with zero regressions.

**Checks**:
1. `npm run type-check` — zero type errors
2. `npm run lint` — zero lint errors
3. `npm test` — all tests pass
4. `npm run build` — clean build
5. Grep: zero `(supabase.rpc as any)` in runtime code
6. Grep: zero `from '@/types/remote/'` in runtime code
7. Grep: zero absolute path imports

## Definition of Done

- [ ] Zero `(supabase.rpc as any)` casts in runtime code
- [ ] Zero `(supabase as any)` casts in runtime code (excluding test doubles)
- [ ] Zero imports from `@/types/remote/` in runtime code
- [ ] Zero absolute path imports in any code
- [ ] `lib/gaming-day/rpc.ts` deleted
- [ ] `utils/supabase/client.ts` deleted
- [ ] All middleware test mocks use typed doubles
- [ ] `types/navigator.d.ts` exists
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
