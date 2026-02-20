---
title: "Ship Gate Report — SEC Remediation Post-Implementation Validation"
doc_id: SEC-REMEDIATION-SHIP-GATE-REPORT-2026-02-20
date: 2026-02-20
timezone: America/Los_Angeles
status: "NOT READY — blocking findings"
applies_to:
  - EXECUTION-SPEC-SEC-REMEDIATION-2026-02-19.md
  - SEC-REMEDIATION-POST-IMPLEMENTATION-TEST-PLAN-2026-02-19.md
---

# SEC Remediation — Ship Gate Report

**Verdict: NOT READY**

3 blocking findings must be resolved before merge.

---

## 1) Migration + Type Safety Gates

| Gate | Command | Result | Exit Code |
|------|---------|--------|-----------|
| DB Reset | `supabase db reset` | Clean apply (user-confirmed precondition) | 0 |
| Type Generation | `npm run db:types-local` | Types regenerated (user-confirmed precondition) | 0 |
| Type Check | `npm run type-check` | **PASS** — no TS errors | 0 |
| Build | `npm run build` | **PASS** — production build succeeds | 0 |

**Conclusion:** No TypeScript errors related to `.rpc()` argument objects or function signatures. All production callers compile cleanly against the new signatures.

---

## 2) Catalog Assertions

### 2A) Detect `p_actor_id` in RPC identity args

**RESULT: 2 rows returned (expected 0)**

| Schema | Function | Identity Args | Disposition |
|--------|----------|---------------|-------------|
| public | `rpc_update_table_status` | `p_casino_id uuid, p_table_id uuid, p_new_status table_status, p_actor_id uuid` | **Stale overload** — clean 3-param version exists alongside. Needs DROP. |
| public | `rpc_start_rating_slip` | `p_casino_id uuid, p_visit_id uuid, p_table_id uuid, p_seat_number text, p_game_settings jsonb, p_actor_id uuid` | **Out of scope** — explicitly deferred (M-4 Phase 2, requires TS changes). |

**Assessment:**
- `rpc_start_rating_slip` — **Accepted risk** (documented out-of-scope in EXECUTION-SPEC).
- `rpc_update_table_status` — **BLOCKING.** A stale 4-param overload with `p_actor_id` persists alongside the clean 3-param version. This overload is callable by `authenticated` and represents a bypass vector. Requires a `DROP FUNCTION` in a follow-up migration.

### 2B) P0 RPC Signatures (C-1, C-2)

**RESULT: PASS**

| Function | Identity Args (Safe) |
|----------|---------------------|
| `rpc_create_pit_cash_observation` | 8 params, no `p_actor_id` |
| `rpc_log_table_buyin_telemetry` | 9 params, no `p_actor_id` |

No legacy overloads remain for C-1/C-2. DROP + CREATE was successful.

---

## 3) Privilege Assertions

### 3A) No PUBLIC EXECUTE on SECURITY DEFINER RPCs

**RESULT: PASS**

All 43 SECURITY DEFINER RPCs grant EXECUTE only to `{authenticated, service_role}`. The `public` role does NOT appear in any grant list. ADR-018 compliance confirmed.

### 3B) C-1/C-2 Grant Posture

**RESULT: DEVIATION FROM SPEC**

| Function | authenticated | service_role | Expected (per EXEC-SPEC) |
|----------|:---:|:---:|---|
| `rpc_create_pit_cash_observation` | t | t | auth=t, **sr=f** |
| `rpc_log_table_buyin_telemetry` | t | t | auth=t, **sr=f** |

The EXECUTION-SPEC states: *"GRANT: authenticated only (service_role removed — no server-side callers confirmed)"*. However, `service_role` still has EXECUTE on both RPCs. **Non-blocking** — service_role access is overly permissive but not a bypass vector (service_role is trusted). A follow-up REVOKE is recommended.

### 3C) Shift Metrics Special Case (WS4)

**RESULT: BLOCKING — Grant lockdown NOT applied**

| Function | Overload | auth_exec | sr_exec | Expected |
|----------|----------|:---------:|:-------:|----------|
| `rpc_shift_table_metrics` | 2-param (wrapper) | t | t | auth=t (correct) |
| `rpc_shift_table_metrics` | 3-param (internal) | **t** | t | **auth=f** |
| `rpc_shift_pit_metrics` | 3-param (wrapper) | t | t | auth=t (correct) |
| `rpc_shift_pit_metrics` | 4-param (internal) | **t** | t | **auth=f** |
| `rpc_shift_casino_metrics` | 2-param (wrapper) | t | t | auth=t (correct) |
| `rpc_shift_casino_metrics` | 3-param (internal) | **t** | t | **auth=f** |

The `REVOKE EXECUTE ON FUNCTION ... FROM authenticated` was NOT applied to the internal overloads. **Authenticated users can still call the `p_internal_actor_id` overloads directly.** While the function body contains a `current_user <> 'service_role'` gate, defense-in-depth requires the grant lockdown as well (INV-8 requirement).

**INV-8 Status: FAIL** — authenticated-callable RPCs still accept actor_id param.

---

## 4) Behavior Tests

### 4A) Baseline Integration Tests

| Test File | Result | Pass/Fail |
|-----------|--------|-----------|
| `bypass-lockdown.test.ts` | 8/8 passed | **PASS** |
| `rls-pooling-safety.integration.test.ts` | 8 passed, 27 failed | **FAIL** |

### 4A Detail: rls-pooling-safety failures

Two failure categories observed:

**Category 1: "UNAUTHORIZED: staff identity not found"** (19 failures)
Tests call `injectRLSContext()` with staff IDs that don't exist in the local DB after `db reset`. This is a **test fixture/data issue**, not a regression from the remediation. These tests require seed data or authenticated test users that are not provisioned by the current migration set.

**Category 2: "chk_policy_snapshot_if_loyalty" constraint** (8 failures)
The `pit_cash_observation` test suite fails during test data setup (creating rating slips) due to a check constraint on the `rating_slip` table. This is a **pre-existing test data dependency issue**, not related to the security remediation.

**Assessment:** These failures are pre-existing integration test environment issues. The 8 passing tests (cross-casino denial suite) validate the core RLS isolation mechanism and pass cleanly.

### 4B–4D) Manual Negative Tests

Not executed in this automated run. Recommend manual verification:
- [ ] 4B: Call old 9-param `rpc_create_pit_cash_observation` signature — expect "function does not exist"
- [ ] 4C: Call `rpc_enroll_player` with non-admin/non-pit_boss role — expect FORBIDDEN
- [ ] 4D: Authenticated call to 3-param shift metrics — expect DENIED (currently would succeed due to missing REVOKE)

---

## 5) Tooling Regression Checks

### 5A) TG-2: lint-rls-write-path.regression.sh

**RESULT: PASS**

```
PASS: Lint correctly detected synthetic violation (exit code 1)
```

Single-line chained call pattern works correctly. No brittle formatting failures.

### 5B) TG-3: audit-rpc-context-injection.sh

**RESULT: PASS**

```
Total rpc_* functions:  77
Compliant (OK):         70
Non-compliant:           7
  WARN (DEFINER issue):  1
  INFO (no injection):   6
```

| Status | Function | Notes |
|--------|----------|-------|
| WARN | `rpc_bootstrap_casino` | SECURITY DEFINER without `set_rls_context` — expected (bootstrap function, no staff context available) |
| INFO | 6 SECURITY INVOKER functions | No injection needed (invoker security model) — intentional |

The audit script produces a stable, actionable report. All SECURITY DEFINER RPCs (except the expected `rpc_bootstrap_casino`) contain `set_rls_context` in their source.

---

## 6) Final Ship Gate Checklist

| # | Gate | Status | Notes |
|---|------|--------|-------|
| 1 | `supabase db reset` applies all migrations cleanly | **PASS** | User-confirmed precondition |
| 2 | `npm run db:types-local` completes and types update | **PASS** | User-confirmed precondition |
| 3 | `npm run type-check` succeeds | **PASS** | Exit code 0 |
| 4 | `npm run build` succeeds | **PASS** | Exit code 0 |
| 5 | Catalog query: 0 rows for `p_actor_id` | **PARTIAL** | 2 rows: 1 out-of-scope (rpc_start_rating_slip), 1 stale overload (rpc_update_table_status) |
| 6 | No `PUBLIC` EXECUTE on SECURITY DEFINER RPCs | **PASS** | All 43 RPCs: `{authenticated, service_role}` only |
| 7 | Shift-metrics grants match intended boundary | **FAIL** | REVOKE not applied — authenticated can call internal overloads |
| 8 | Baseline integration tests pass | **PARTIAL** | bypass-lockdown PASS; rls-pooling-safety has pre-existing failures |
| 9 | Manual negative test: removed signature not callable | **NOT TESTED** | Recommend manual SQL verification |
| 10 | Shift-metrics negative cases deny bypass attempts | **FAIL** | Grant lockdown missing — authenticated can still invoke |
| 11 | TG scripts run cleanly | **PASS** | Both TG-2 and TG-3 pass |

---

## Blocking Findings (Must Fix Before Merge)

### BF-1: rpc_update_table_status stale overload (MEDIUM)

A 4-param overload of `rpc_update_table_status` with `p_actor_id` persists alongside the clean 3-param version. This was not addressed by the current migration set.

**Fix:** Add `DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status, uuid);` to a new migration.

### BF-2: Shift metrics grant lockdown NOT applied (HIGH — INV-8 blocker)

The `REVOKE EXECUTE ... FROM authenticated` on 3/4-param internal shift metrics overloads was not applied. Authenticated users can still directly invoke `rpc_shift_table_metrics(ts, ts, uuid)`, `rpc_shift_pit_metrics(ts, ts, text, uuid)`, and `rpc_shift_casino_metrics(ts, ts, uuid)`.

**Fix:** Apply the REVOKE statements from WS4 Step 2 of the EXECUTION-SPEC.

### BF-3: rls-pooling-safety integration test failures (MEDIUM)

27 of 35 tests fail. While these appear to be pre-existing test fixture issues (not regressions), the test plan requires they pass before ship.

**Fix:** Investigate staff identity seeding in test fixtures. The "UNAUTHORIZED: staff identity not found" errors suggest `injectRLSContext()` tests need valid staff records in the local DB.

---

## Non-Blocking Findings

### NB-1: C-1/C-2 service_role GRANT not revoked (LOW)

The EXEC-SPEC specifies removing `service_role` GRANT from `rpc_create_pit_cash_observation` and `rpc_log_table_buyin_telemetry`. Both still have `{authenticated, service_role}`. Not a security risk (service_role is trusted), but diverges from spec.

### NB-2: rpc_start_rating_slip p_actor_id (ACCEPTED — Out of Scope)

Explicitly deferred per EXECUTION-SPEC: *"M-4 Phase 2 (remove p_actor_id from rpc_start_rating_slip signature — requires TS changes)"*. Track in future remediation phase.

---

## Invariant Restoration Status

| Invariant | Target | Actual | Notes |
|-----------|--------|--------|-------|
| ADR-024 INV-7 (mandatory self-injection) | PASS | **PASS** | All P0 RPCs use `set_rls_context_from_staff()` unconditionally |
| ADR-024 INV-8 (no spoofable identity params) | PASS | **FAIL** | Shift metrics grant lockdown missing (BF-2); stale rpc_update_table_status overload (BF-1) |
| ADR-030 INV-030-4 (write-path session-var) | PASS | **PASS** | P0 RPCs enforce session-var context |
| ADR-018 (REVOKE ALL FROM PUBLIC) | PASS | **PASS** | No PUBLIC EXECUTE on any DEFINER RPC |
| SEC-001 Pattern C (NULLIF) | PASS | **PASS** | game_settings_side_bet policies use NULLIF pattern |

---

*Report generated: 2026-02-20 by automated post-implementation validation pipeline*
*Test plan: SEC-REMEDIATION-POST-IMPLEMENTATION-TEST-PLAN-2026-02-19*
