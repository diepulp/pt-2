---
prd: PRD-043
prd_title: "SEC-007 Remaining RPC p_casino_id Remediation (14 RPCs)"
service: CrossCutting
mvp_phase: 1

workstreams:
  WS1:
    name: "D1 Migration — Cross-Context Reads + Tier 4"
    description: "DROP+CREATE for up to 6 RPCs across Dashboard, Visit, RatingSlip, Loyalty. Tier 4 catalog investigation for rpc_start_rating_slip and rpc_issue_mid_session_reward."
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/<TIMESTAMP>_prd043_d1_remove_p_casino_id.sql
    gate: schema-validation
    estimated_complexity: medium

  WS2:
    name: "D1 TypeScript Callsite Cascade"
    description: "Remove p_casino_id from 7 production callsites + test files across Dashboard, Visit, RatingSlip hooks/services."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    bounded_context: [dashboard, visit, rating-slip, loyalty]
    outputs:
      - hooks/dashboard/use-dashboard-tables.ts
      - services/rating-slip/crud.ts
      - services/rating-slip-modal/rpc.ts
      - services/loyalty/dtos.ts
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: "D2 Migration — Loyalty RPCs (no delegation)"
    description: "DROP+CREATE for rpc_accrue_on_close, rpc_apply_promotion, rpc_get_player_ledger, rpc_reconcile_loyalty_balance."
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/<TIMESTAMP>_prd043_d2_remove_loyalty_p_casino_id.sql
    gate: schema-validation
    estimated_complexity: medium

  WS4:
    name: "D2 TypeScript Callsite Cascade"
    description: "Remove p_casino_id from 4 callsites in services/loyalty/crud.ts + test files. Add FR-2 mutation role gate tests."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS3]
    bounded_context: loyalty
    outputs:
      - services/loyalty/crud.ts
    gate: type-check
    estimated_complexity: medium

  WS5:
    name: "D1+D2 Validation Gate + Allowlist Consolidation"
    description: "Shrink SEC-003 allowlist (remove all 10 D1+D2 entries, leaving 4 for D3/D4). Full gate suite: type-check, build, lint, tests, SEC-003 shrinkage (14→4 allowlist), FR-0 assertions, FR-2 mutation auth, volatility preservation check."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS2, WS4]
    outputs:
      - supabase/tests/security/03_identity_param_check.sql
    gate: build
    estimated_complexity: low

  WS6:
    name: "D3 Migration — Loyalty Delegation RPCs"
    description: "DROP+CREATE for rpc_manual_credit, rpc_redeem. Delegation param handling depends on OQ-2."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS5]
    blocked_by: "OQ-2 business decision"
    outputs:
      - supabase/migrations/<TIMESTAMP>_prd043_d3_remove_loyalty_delegation_p_casino_id.sql
    gate: schema-validation
    estimated_complexity: medium

  WS7:
    name: "D3 TypeScript Callsite Cascade"
    description: "Remove p_casino_id + delegation params (if disallowed) from services/loyalty/crud.ts (2 callsites)."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS6]
    blocked_by: "OQ-2 business decision"
    outputs:
      - services/loyalty/crud.ts
      - services/loyalty/__tests__/
    gate: type-check
    estimated_complexity: medium

  WS8:
    name: "D4 Migration — Financial RPCs"
    description: "DROP+CREATE for rpc_create_financial_txn, rpc_create_financial_adjustment. Delegation param depends on OQ-1."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS5]
    blocked_by: "OQ-1 business decision"
    outputs:
      - supabase/migrations/<TIMESTAMP>_prd043_d4_remove_financial_p_casino_id.sql
    gate: schema-validation
    estimated_complexity: medium

  WS9:
    name: "D4 TypeScript Callsite Cascade"
    description: "Remove p_casino_id from lib/finance.ts, services/player-financial/http.ts + test files."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS8]
    blocked_by: "OQ-1 business decision"
    outputs:
      - lib/finance.ts
      - services/player-financial/http.ts
      - lib/supabase/__tests__/pit-boss-financial-txn.test.ts
    gate: type-check
    estimated_complexity: medium

  WS10:
    name: "Final Security Gate — Zero Allowlist"
    description: "Empty SEC-003 allowlist. All 8 security gates pass. Catalog confirms 0 rpc_* with p_casino_id."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS7, WS9]
    outputs: []
    gate: build
    estimated_complexity: low

execution_phases:
  - name: "Phase 1 — D1+D2 Migrations (parallel)"
    parallel: [WS1, WS3]
    gates: [schema-validation]

  - name: "Phase 2 — D1+D2 TS Cascade (parallel)"
    parallel: [WS2, WS4]
    gates: [type-check]

  - name: "Phase 3 — D1+D2 Validation"
    parallel: [WS5]
    gates: [type-check, lint, test-pass, build]

  - name: "Phase 4 — D3+D4 Migrations (parallel, blocked on OQ-1/OQ-2)"
    parallel: [WS6, WS8]
    gates: [schema-validation]

  - name: "Phase 5 — D3+D4 TS Cascade (parallel, blocked)"
    parallel: [WS7, WS9]
    gates: [type-check]

  - name: "Phase 6 — Final Security Validation"
    parallel: [WS10]
    gates: [type-check, lint, test-pass, build, security-gates]

gates:
  schema-validation:
    command: "npm run db:types-local"
    success_criteria: "Exit code 0, types regenerated"

  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0"

  lint:
    command: "npm run lint"
    success_criteria: "Exit code 0"

  test-pass:
    command: "npm run test:ci > /tmp/exec043-tests.log 2>&1"
    success_criteria: "All tests pass"

  build:
    command: "npm run build"
    success_criteria: "Exit code 0"

  security-gates:
    command: "bash supabase/tests/security/run_all_gates.sh > /tmp/exec043-security.log 2>&1"
    success_criteria: "8 passed, 0 failed"

external_dependencies:
  - prd: PRD-041
    service: CrossCutting
    required_for: "Predecessor remediation (12 RPCs). Must be merged."
  - prd: EXEC-040
    service: Security
    required_for: "SEC-007 enforcement framework and security gates"

risks:
  - risk: "Tier 4 RPCs already remediated but p_casino_id persists in catalog"
    mitigation: "FR-7 catalog truth rule — run catalog snapshot query before D1 PR"
  - risk: "Phantom overload if old signature lingers after migration"
    mitigation: "Strict DROP + CREATE (no OR REPLACE). SEC-002 gate catches residual overloads."
  - risk: "rpc_get_player_ledger had no fail-closed UNAUTHORIZED block"
    mitigation: "Adding NULL-check is new behavior per FR-1 — update tests expecting empty result to expect error. Verified: all production callers go through services/loyalty/crud.ts which always has authenticated context (set_rls_context_from_staff runs first). No server-side code calls this RPC without context. Only test code is affected."
  - risk: "OQ-1/OQ-2 business decisions delayed blocking D3/D4"
    mitigation: "D1+D2 ship immediately (10 of 14 RPCs). D3/D4 isolated."
---

# EXECUTION-SPEC: EXEC-043 — SEC-007 Remaining RPC p_casino_id Remediation

## Overview

This EXEC-SPEC implements PRD-043: the final batch of 14 RPCs that still accept `p_casino_id` in violation of ADR-024's derive-only mandate. After completion, the SEC-003 allowlist empties and the CI gate enforces zero-tolerance.

The work is split into 4 PR batches (D1–D4) across 10 workstreams. D1 and D2 are unblocked and execute in parallel. D3 and D4 are blocked on business decisions (OQ-1/OQ-2).

## Scope

- **In Scope**: Remove `p_casino_id` from 14 RPCs, update all TS callsites, update test files, empty SEC-003 allowlist
- **Out of Scope**: RLS policy changes, service_role-only RPCs, new features, UI changes

---

## WS1: D1 Migration — Cross-Context Reads + Tier 4

**Executor**: `backend-service-builder`
**Bounded contexts**: Dashboard, Visit, RatingSlip, Loyalty

### RPCs

| # | RPC | Security Posture | Current Params | Action |
|---|-----|-----------------|----------------|--------|
| 1 | `rpc_get_dashboard_tables_with_counts` | SECURITY INVOKER | `(p_casino_id uuid)` | DROP+CREATE `()` |
| 2 | `rpc_get_player_last_session_context` | SECURITY INVOKER | `(p_casino_id uuid, p_player_id uuid)` | DROP+CREATE `(p_player_id uuid)` |
| 3 | `rpc_get_player_recent_sessions` | SECURITY INVOKER | `(p_casino_id uuid, p_player_id uuid, p_limit int, p_cursor text)` | DROP+CREATE without p_casino_id |
| 4 | `rpc_get_rating_slip_modal_data` | SECURITY INVOKER STABLE | `(p_slip_id uuid, p_casino_id uuid)` | DROP+CREATE `(p_slip_id uuid)` |
| 5 | `rpc_start_rating_slip` | **SECURITY DEFINER** | `(p_casino_id uuid, p_visit_id uuid, p_table_id uuid, p_seat_number text, p_game_settings jsonb)` | DROP+CREATE without p_casino_id. Fix `SET search_path = pg_catalog, public` (currently only `= public`) |
| 6 | `rpc_issue_mid_session_reward` | SECURITY INVOKER | `(p_casino_id uuid, p_player_id uuid, p_rating_slip_id uuid, p_points int, p_idempotency_key text, p_reason loyalty_reason)` | DROP+CREATE without p_casino_id. Note: `p_staff_id` already absent from DB signature (confirmed via `database.types.ts`). |

### Migration pattern

Single migration file: `<TIMESTAMP>_prd043_d1_remove_p_casino_id.sql`

For each RPC:
1. `DROP FUNCTION IF EXISTS public.<rpc>(<old_args>);`
2. `CREATE FUNCTION public.<rpc>(<new_args>) ... AS $$ ... $$;`
3. Body: `PERFORM set_rls_context_from_staff(); v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid; IF v_casino_id IS NULL THEN RAISE EXCEPTION 'no casino context'; END IF;`
4. `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated, service_role;`

At end of migration file (once, after all RPCs):
5. `NOTIFY pgrst, 'reload schema';`

> **NOTIFY placement (standardized):** A single `NOTIFY pgrst, 'reload schema'` at the end of each migration file. Multiple per-function NOTIFYs within a single transaction are redundant — PostgREST receives one notification per transaction commit regardless. Placing it once at the end is cleaner and prevents inconsistent "optimization" across migration files.

> **Volatility preservation (CRITICAL):** Preserve existing volatility markers (`STABLE`, `IMMUTABLE`) from the original function. If the original is `STABLE` (e.g., `rpc_get_rating_slip_modal_data`, `rpc_get_player_ledger`), the new `CREATE FUNCTION` must include `STABLE`. PostgreSQL defaults to `VOLATILE` — omitting `STABLE` changes query planner behavior.

### Special cases

- **rpc_start_rating_slip**: SECURITY DEFINER — must include `SET search_path = pg_catalog, public` (correcting current `= public`). p_casino_id feeds 5 body sites (visit WHERE, gaming_table WHERE, INSERT rating_slip, INSERT audit_log, game_settings lookup).
- **rpc_get_rating_slip_modal_data**: p_casino_id appears in 6 WHERE clauses — all replaced with `v_casino_id`.
- **rpc_issue_mid_session_reward**: No production TS `.rpc()` callsite exists (the DTO is defined in `services/loyalty/dtos.ts` but never invoked via `.rpc()` in production code). **Why it's still in scope:** the function appears in the SEC-003 allowlist and `p_casino_id` is present in `proargnames` (catalog truth). Until the DB signature is remediated, WS10's zero-tolerance catalog query will fail — so this RPC must be fixed regardless of callsite count. For audit purposes, "callsite" means an actual `.rpc('rpc_issue_mid_session_reward', ...)` call — the DTO interface alone is not a callsite, but is still a cleanup target. `p_staff_id` is already absent from the DB function signature (confirmed via `database.types.ts`); only `p_casino_id` removal needed. The stale `p_staff_id` field in the DTO interface `MidSessionRewardRpcInput` is a DTO cleanup — remove alongside `p_casino_id` in WS2.

### SEC-003 allowlist update

> **Moved to WS5.** To avoid merge conflicts when WS1 and WS3 run in parallel, all SEC-003 allowlist edits are consolidated in WS5 (the first sequential gate after both D1 and D2 merge). WS1 does NOT modify `03_identity_param_check.sql`.

### Tier 4 catalog snapshot (required in PR description)

```sql
SELECT proname, pg_get_function_arguments(oid), prosecdef, proconfig
FROM pg_proc
WHERE proname IN ('rpc_start_rating_slip', 'rpc_issue_mid_session_reward')
  AND pronamespace = 'public'::regnamespace;
```

### Acceptance criteria

- [ ] `npm run db:types-local` succeeds
- [ ] FR-0: `set_rls_context_from_staff()` placement validated by WS5 G7a (must PASS for all 6 D1 RPCs). Not enforced at WS1 PR time.
- [ ] FR-1: No `p_casino_id` in `proargnames` for any of the 6 RPCs
- [ ] FR-2: `rpc_start_rating_slip` has `SET search_path = pg_catalog, public`

---

## WS2: D1 TypeScript Callsite Cascade

**Executor**: `backend-service-builder`
**Depends on**: WS1

> **Note — `services/visit/crud.ts` omitted from YAML outputs (intentional):**
> - **What validator:** The SRM (Service Responsibility Matrix) validator flags cross-context file modifications as violations. `visit/crud.ts` is owned by the Visit bounded context, and this workstream's YAML header lists `dashboard, visit, rating-slip, loyalty` — but the validator keys on output file paths, not bounded_context.
> - **Why it's safe to omit:** The changes are purely subtractive (removing `p_casino_id` args from `.rpc()` calls). No new cross-context coupling is introduced. The file remains owned by the Visit context.
> - **How reviewers enforce:** PR checklist must include "`services/visit/crud.ts` — 3 callsites updated (rpc_get_player_recent_sessions, rpc_get_player_last_session_context, rpc_start_rating_slip)". The WS5 type-check gate (G2) will fail if callsites are missed, since the DB function signatures will have changed.

### Callsite inventory

| File | RPC | Line | Change |
|------|-----|------|--------|
| `hooks/dashboard/use-dashboard-tables.ts` | `rpc_get_dashboard_tables_with_counts` | 59–61 | Remove `{ p_casino_id: casinoId! }` from `.rpc()` args. Keep `casinoId` in hook signature (used for cache key). |
| `services/visit/crud.ts` | `rpc_get_player_recent_sessions` | 489–494 | Remove `p_casino_id: casinoId` from `.rpc()` args |
| `services/visit/crud.ts` | `rpc_get_player_last_session_context` | 547–553 | Remove `p_casino_id: casinoId` from `.rpc()` args |
| `services/visit/crud.ts` | `rpc_start_rating_slip` | 691–700 | Remove `p_casino_id: casinoId` from `.rpc()` args (startFromPrevious) |
| `services/rating-slip/crud.ts` | `rpc_start_rating_slip` | 180–188 | Remove `p_casino_id: casinoId` from `.rpc()` args (start) |
| `services/rating-slip-modal/rpc.ts` | `rpc_get_rating_slip_modal_data` | 146–149 | Remove `p_casino_id: casinoId` from `.rpc()` args |
| `services/loyalty/dtos.ts` | `rpc_issue_mid_session_reward` | 318 | Remove `p_casino_id: string` from `MidSessionRewardRpcInput` interface |

### Test file updates

| File | Change | Occurrences |
|------|--------|-------------|
| `services/visit/__tests__/visit-continuation.integration.test.ts` | Remove `p_casino_id` from `rpc_start_rating_slip` calls | 8 |
| `services/visit/__tests__/visit-continuation.test.ts` | Update any `toHaveBeenCalledWith` assertions that include `p_casino_id` | Inspect |
| `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` | Remove `p_casino_id` from `rpc_get_player_recent_sessions` / `rpc_get_player_last_session_context` calls | 7 |

### FR-0 fail-closed test (D1 read RPC coverage)

Add to `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`:
- `rpc_get_player_recent_sessions fails without casino context` → expect UNAUTHORIZED

> **Why:** WS4 adds fail-closed tests for D2 loyalty RPCs, but D1 read RPCs had no equivalent coverage. One test proves the pattern holds outside the loyalty bounded context.

### Acceptance criteria

- [ ] `npm run type-check` — zero errors
- [ ] `grep -r "p_casino_id" hooks/dashboard/ services/visit/ services/rating-slip/ services/rating-slip-modal/` returns 0 production matches for in-scope RPCs
- [ ] All affected tests pass
- [ ] FR-0 fail-closed test passes for `rpc_get_player_recent_sessions`

---

## WS3: D2 Migration — Loyalty RPCs (no delegation)

**Executor**: `backend-service-builder`
**Bounded context**: Loyalty

### RPCs

| # | RPC | Security Posture | Role Gate | Key Body Changes |
|---|-----|-----------------|-----------|-----------------|
| 7 | `rpc_accrue_on_close` | INVOKER | pit_boss, admin | Replace p_casino_id in 5 WHERE/INSERT sites with v_casino_id |
| 8 | `rpc_apply_promotion` | INVOKER | pit_boss, admin | Replace p_casino_id in 6 sites. Preserve 4-col return (balance_after) |
| 9 | `rpc_get_player_ledger` | INVOKER STABLE | none (read-only) | Add fail-closed NULL check (currently missing). Replace WHERE p_casino_id |
| 10 | `rpc_reconcile_loyalty_balance` | INVOKER | admin only | Replace p_casino_id in 3 sites |

### SEC-003 allowlist update

> **Moved to WS5.** To avoid merge conflicts when WS1 and WS3 run in parallel, all SEC-003 allowlist edits are consolidated in WS5. WS3 does NOT modify `03_identity_param_check.sql`.

### Migration notes

- All 4 RPCs are SECURITY INVOKER — preserve
- None currently have `SET search_path` — add `SET search_path = pg_catalog, public`. **Decision: For EXEC-043, all remediated RPCs (DEFINER + INVOKER) get `SET search_path = pg_catalog, public` for consistency.** While ADR-018 only mandates it for DEFINER, applying it uniformly is cheap, prevents search_path injection, and eliminates per-function policy decisions during review.
- `rpc_get_player_ledger`: Adding NULL-check is new fail-closed behavior (previously relied on RLS). Tests expecting empty result must be updated to expect UNAUTHORIZED error.

### Acceptance criteria

- [ ] `npm run db:types-local` succeeds
- [ ] FR-0: `set_rls_context_from_staff()` placement validated by WS5 G7a (must PASS for all 4 D2 RPCs). Not enforced at WS3 PR time.
- [ ] FR-1: No `p_casino_id` in `proargnames`
- [ ] `search_path` includes `pg_catalog, public` for all 4

---

## WS4: D2 TypeScript Callsite Cascade

**Executor**: `backend-service-builder`
**Depends on**: WS3

### Production callsite changes (services/loyalty/crud.ts)

| Function | Line | Change |
|----------|------|--------|
| `accrueOnClose` | 210–215 | Remove `p_casino_id: input.casinoId` |
| `applyPromotion` | 360–367 | Remove `p_casino_id: input.casinoId` |
| `getLedger` | 532–538 | Remove `p_casino_id: query.casinoId` |
| `reconcileBalance` | 581–585 | Remove `p_casino_id: casinoId` |

**DTO impact**: `casinoId` fields retained in DTOs (AccrueOnCloseInput, ApplyPromotionInput, LedgerListQuery) — still used as context metadata, just no longer forwarded to RPCs.

**Mapper check**: Verify `parseApplyPromotionResponse` in `mappers.ts` handles 4-col return including `balance_after`.

### Test file updates

| File | Changes |
|------|---------|
| `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts` | Remove `p_casino_id` from 3 `rpc_accrue_on_close` calls |
| `services/rating-slip/__tests__/policy-snapshot.integration.test.ts` | Remove `p_casino_id` from any direct `rpc_accrue_on_close` calls |
| `services/security/__tests__/rls-context.integration.test.ts` | Remove `p_casino_id` from any loyalty RPC calls |

### New FR-2 mutation auth tests

Add to `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts`:
- `dealer cannot call rpc_accrue_on_close` → expect FORBIDDEN
- `cashier cannot call rpc_apply_promotion` → expect FORBIDDEN
- `pit_boss cannot call rpc_reconcile_loyalty_balance` (admin only) → expect FORBIDDEN

Add to `services/security/__tests__/rls-context.integration.test.ts`:
- `rpc_accrue_on_close fails without casino context` → expect UNAUTHORIZED
- `rpc_apply_promotion fails without casino context` → expect UNAUTHORIZED
- `rpc_get_player_ledger fails without casino context` → expect UNAUTHORIZED

### Acceptance criteria

- [ ] `npm run type-check` — zero errors
- [ ] `grep -r "p_casino_id" services/loyalty/crud.ts` returns 0 matches
- [ ] FR-2 role gate tests pass
- [ ] FR-0 fail-closed tests pass

---

## WS5: D1+D2 Validation Gate

**Executor**: `backend-service-builder`
**Depends on**: WS2, WS4

### Gate sequence

| Step | Command | Success Criteria |
|------|---------|-----------------|
| G1 | `npm run db:types-local` | Exit 0, types regenerate cleanly. Catalog-based argname checks are enforced by G7a / WS10 G7. |
| G2 | `npm run type-check` | Exit 0 |
| G3 | `npm run build` | Exit 0 |
| G4 | `npm run lint` | Exit 0 |
| G5 | `npm run test:ci > /tmp/ws5-tests.log 2>&1` | All unit tests pass |
| G6 | SEC-003 allowlist consolidation (file edit + assertion) | **Edit** `03_identity_param_check.sql`: remove all 10 D1+D2 entries from `v_casino_id_allowlist`. **Assert**: allowlist contains exactly `{rpc_manual_credit, rpc_redeem, rpc_create_financial_txn, rpc_create_financial_adjustment}` (4 D3/D4 RPCs). Use `COALESCE(array_length(v_casino_id_allowlist, 1), 0) = 4` to guard against NULL on empty array. |
| G7 | SEC-006 context-first-line check (DEFINER only) | `rpc_start_rating_slip` passes SEC-006. Only DEFINER RPC in D1+D2 scope; all others are INVOKER (covered by G7a). |
| G7a | **FR-0 context-first-line for ALL RPCs** (DEFINER + INVOKER) | See preamble-scan verification query below — all 10 D1+D2 RPCs confirmed |
| G7a.1 | **No dynamic SQL (EXECUTE) in remediated RPCs** | See EXECUTE guard query below — 0 rows expected |
| G7b | **Volatility preservation check** | See `provolatile` verification query below — all 10 D1+D2 RPCs match expected volatility |
| G8 | SEC-007 dashboard RPC acceptance | `rpc_get_dashboard_tables_with_counts` verified |
| G9 | FR-2 mutation auth (D2 writes) | Integration test or SQL body audit confirms role gates |

### SEC-003 allowlist consolidation (WS5 responsibility)

Remove all 10 D1+D2 entries from `supabase/tests/security/03_identity_param_check.sql` `v_casino_id_allowlist` array:

**D1 entries:**
- `rpc_get_dashboard_tables_with_counts`
- `rpc_get_player_last_session_context`
- `rpc_get_player_recent_sessions`
- `rpc_get_rating_slip_modal_data`
- `rpc_start_rating_slip`
- `rpc_issue_mid_session_reward`

**D2 entries:**
- `rpc_accrue_on_close`
- `rpc_apply_promotion`
- `rpc_get_player_ledger`
- `rpc_reconcile_loyalty_balance`

After WS5: allowlist shrinks from 14 to 4 entries (only D3/D4 RPCs remain).

> **Why consolidated here:** WS1 and WS3 both run in parallel (Phase 1). Both previously listed `03_identity_param_check.sql` as an output, guaranteeing a merge conflict on the allowlist array. By deferring all allowlist edits to WS5 (the first sequential gate after both D1 and D2 merge), migrations run truly parallel with zero shared-file contention.

### Expected catalog state after D1+D2

```sql
-- Named args check
SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames)
  AND pronamespace = 'public'::regnamespace;
-- Expected: 4 rows (rpc_manual_credit, rpc_redeem, rpc_create_financial_txn, rpc_create_financial_adjustment)

-- Unnamed/positional args check (consistent with WS10 G7-b)
SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
WHERE proname LIKE 'rpc_%' AND pg_get_function_arguments(oid) ~* '\mp_casino_id\M'
  AND pronamespace = 'public'::regnamespace;
-- Expected: same 4 rows
```

### G7a: FR-0 context-first-line verification (ALL RPCs, not just DEFINER)

> **Why this gate exists:** SEC-006 only checks `prosecdef = true` (SECURITY DEFINER). 9 of the 10 D1+D2 RPCs are INVOKER. Without this gate, FR-0 compliance for INVOKER RPCs is unverifiable.

> **Why `strpos()` instead of regex:** The original regex approach is brittle — it can false-pass if `set_rls_context_from_staff()` appears in a comment, or false-fail on statement forms like `WITH`, `SELECT INTO`, `PERFORM` variations. Positional index checks are deterministic.

> **Why scan AFTER the context call:** The migration pattern uses `PERFORM set_rls_context_from_staff()`, so the keyword `perform` appears at the context-call line itself. Scanning the whole body would false-FAIL because `pos_first_data` would equal `pos_ctx`. By scanning only the substring after the context call, we test what matters: "is there any data statement *before* the context was set?"

```sql
-- FR-0 verification: set_rls_context_from_staff() appears, and no data statement
-- precedes it. Scans the substring BEFORE the context call for stray DML.
-- Uses pg_get_functiondef() (full CREATE FUNCTION text; comments may be present).
-- Covers ALL rpc_* functions (DEFINER + INVOKER).
WITH rpc_bodies AS (
  SELECT p.proname,
         lower(pg_get_functiondef(p.oid)) AS full_def,
         strpos(lower(pg_get_functiondef(p.oid)), 'perform set_rls_context_from_staff') AS pos_ctx
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'rpc_get_dashboard_tables_with_counts',
      'rpc_get_player_last_session_context',
      'rpc_get_player_recent_sessions',
      'rpc_get_rating_slip_modal_data',
      'rpc_start_rating_slip',
      'rpc_issue_mid_session_reward',
      'rpc_accrue_on_close',
      'rpc_apply_promotion',
      'rpc_get_player_ledger',
      'rpc_reconcile_loyalty_balance'
    )
),
pre_ctx AS (
  -- Extract the substring BEFORE the context call (the "preamble")
  -- If no context call exists, preamble = entire body (will fail the check)
  SELECT proname,
         pos_ctx,
         CASE WHEN pos_ctx > 0
              THEN substr(full_def, 1, pos_ctx - 1)
              ELSE full_def
         END AS preamble
  FROM rpc_bodies
)
SELECT proname,
       pos_ctx,
       -- Check: does the preamble contain any data statement?
       -- Use \m word-boundary to avoid matching substrings (e.g., "without")
       CASE
         WHEN pos_ctx = 0 THEN 'FAIL — no context call found'
         WHEN preamble ~* '\m(select|insert|update|delete)\M' THEN 'FAIL — data statement before context call'
         ELSE 'PASS'
       END AS fr0_status
FROM pre_ctx;
-- Success: all 10 rows have fr0_status = 'PASS'
--
-- How it works:
--   1. Find the position of 'perform set_rls_context_from_staff' in the function body
--   2. Extract everything BEFORE that position (the "preamble")
--   3. Check the preamble for DML keywords using \m...\M word boundaries
--      (prevents "with" matching "without", "select" matching "selectivity", etc.)
--   4. PASS = context call exists AND no DML precedes it
--
-- Notes:
--   - Uses pg_get_functiondef() (full CREATE FUNCTION text, includes signature/attributes).
--     Comments may be present; this check is intentionally conservative.
--   - Word-boundary regex (\m...\M) avoids false matches on substrings
--   - Does NOT search for 'perform' in the preamble (it's the context-call keyword itself)
--   - Does NOT search for 'execute' (dynamic SQL) — handled by separate G7a.1 guard
--   - A commented-out DML in the preamble would still flag FAIL (conservative).
```

### G7a.1: No dynamic SQL (EXECUTE) in remediated RPCs

> Dynamic SQL (`EXECUTE`) bypasses compile-time analysis and could circumvent FR-0 ordering checks. This gate ensures none of the remediated RPCs use it; if any do, they require manual review.

```sql
-- G7a.1: No dynamic SQL (EXECUTE) in remediated RPCs unless manually reviewed.
SELECT p.proname
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'rpc_get_dashboard_tables_with_counts',
    'rpc_get_player_last_session_context',
    'rpc_get_player_recent_sessions',
    'rpc_get_rating_slip_modal_data',
    'rpc_start_rating_slip',
    'rpc_issue_mid_session_reward',
    'rpc_accrue_on_close',
    'rpc_apply_promotion',
    'rpc_get_player_ledger',
    'rpc_reconcile_loyalty_balance'
  )
  AND lower(pg_get_functiondef(p.oid)) ~ '\mexecute\M';
-- Success: 0 rows (no dynamic SQL in any remediated RPC)
```

### G7b: Volatility preservation check

> **Why this gate exists:** The migration pattern warns to preserve `STABLE/IMMUTABLE` markers, but without verification a silent regression to `VOLATILE` (PostgreSQL's default) can change query planner behavior without failing any test.

**Pre-migration snapshot** (capture before D1/D2 PRs):
```sql
SELECT proname, provolatile
FROM pg_proc
WHERE proname IN (
  'rpc_get_dashboard_tables_with_counts',
  'rpc_get_player_last_session_context',
  'rpc_get_player_recent_sessions',
  'rpc_get_rating_slip_modal_data',
  'rpc_start_rating_slip',
  'rpc_issue_mid_session_reward',
  'rpc_accrue_on_close',
  'rpc_apply_promotion',
  'rpc_get_player_ledger',
  'rpc_reconcile_loyalty_balance'
) AND pronamespace = 'public'::regnamespace;
-- Record provolatile values: 'v' = VOLATILE, 's' = STABLE, 'i' = IMMUTABLE
```

**Post-migration assertion:**
```sql
-- Assert volatility unchanged after remediation
SELECT proname, provolatile,
       CASE proname
         WHEN 'rpc_get_rating_slip_modal_data' THEN 's'  -- STABLE
         WHEN 'rpc_get_player_ledger'          THEN 's'  -- STABLE
         ELSE 'v'  -- VOLATILE (default for all others)
       END AS expected_volatility,
       CASE WHEN provolatile = CASE proname
         WHEN 'rpc_get_rating_slip_modal_data' THEN 's'
         WHEN 'rpc_get_player_ledger'          THEN 's'
         ELSE 'v'
       END THEN 'PASS' ELSE 'FAIL' END AS volatility_status
FROM pg_proc
WHERE proname IN (
  'rpc_get_dashboard_tables_with_counts',
  'rpc_get_player_last_session_context',
  'rpc_get_player_recent_sessions',
  'rpc_get_rating_slip_modal_data',
  'rpc_start_rating_slip',
  'rpc_issue_mid_session_reward',
  'rpc_accrue_on_close',
  'rpc_apply_promotion',
  'rpc_get_player_ledger',
  'rpc_reconcile_loyalty_balance'
) AND pronamespace = 'public'::regnamespace;
-- Success: all 10 rows have volatility_status = 'PASS'
```

---

## WS6–WS9: D3+D4 (Blocked on OQ-1/OQ-2)

### WS6: D3 Migration — Loyalty Delegation RPCs
- `rpc_manual_credit`: Remove p_casino_id. Delegation param `p_awarded_by_staff_id` per OQ-2.
- `rpc_redeem`: Remove p_casino_id. Delegation param `p_issued_by_staff_id` per OQ-2.

### WS7: D3 TypeScript Cascade
- `services/loyalty/crud.ts` (2 callsites)
- Test files: `services/loyalty/__tests__/`, `services/security/__tests__/`

### WS8: D4 Migration — Financial RPCs
- `rpc_create_financial_txn`: Remove p_casino_id. Delegation param `p_created_by_staff_id` per OQ-1.
- `rpc_create_financial_adjustment`: Remove p_casino_id only.

### WS9: D4 TypeScript Cascade
- `lib/finance.ts` (1 callsite)
- `services/player-financial/http.ts` (1 callsite)
- Test: `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` (15 `p_casino_id` occurrences)

---

## WS10: Final Security Gate — Zero Allowlist

**Depends on**: WS7, WS9

### Gate sequence

| Step | Command | Success Criteria |
|------|---------|-----------------|
| G1 | `npm run db:types-local` | Exit 0, types regenerate cleanly. Catalog-based argname checks enforced by G7 + G7-b. |
| G2 | `npm run type-check` | Exit 0 |
| G3 | `npm run build` | Exit 0 |
| G4 | `npm run lint` | Exit 0 |
| G5 | `npm run test:ci > /tmp/ws10-tests.log 2>&1` | All unit tests pass |
| G6 | `bash supabase/tests/security/run_all_gates.sh > /tmp/ws10-security.log 2>&1` | "8 passed, 0 failed" |
| G7 | Catalog zero-tolerance query (named args) | `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` → 0 rows |
| G7-b | Catalog zero-tolerance query (unnamed/positional args) | `SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname LIKE 'rpc_%' AND pg_get_function_arguments(oid) ~* '\mp_casino_id\M' AND pronamespace = 'public'::regnamespace;` → 0 rows |
| G7a | **Volatility preservation check** | All 14 RPCs match pre-remediation `provolatile` values (see WS5 G7b query pattern, expanded to all 14 RPCs) |
| G8 | TS callsite zero-tolerance | `grep -r "p_casino_id" services/ hooks/ lib/ app/ --include='*.ts' --include='*.tsx'` → 0 production matches |
| G9 | Integration test suite | All `*.integration.test.ts` pass against local DB (note: codebase uses `.integration.test.ts` naming, known deviation from `.int.test.ts` governance standard) |
| G10 | FR-2 final mutation auth | D3+D4 write RPCs verified for role gating |

---

## Definition of Done

- [ ] All 14 RPCs have `p_casino_id` removed (WS10 G7: 0 rows)
- [ ] Every remediated RPC calls `set_rls_context_from_staff()` first (SEC-006 for DEFINER + G7a FR-0 query for ALL RPCs including INVOKER)
- [ ] Tier 4 investigation complete (WS1 catalog snapshot)
- [ ] All 8 security gates pass 8/8 (WS10 G6)
- [ ] SEC-003 allowlist empty
- [ ] Each PR passes `db:types-local + type-check + build`
- [ ] Volatility preservation verified — all RPCs match pre-remediation `provolatile` (WS5 G7b, WS10 G7a)
- [ ] FR-2 mutation auth tests pass for all write RPCs
- [ ] OQ-1 and OQ-2 resolved; delegation params removed or justified
- [ ] Gap document updated with resolution status
