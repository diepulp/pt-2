# SEC-AUDIT-2026-02-19: Global RLS & Security Posture Violations Matrix

**Date:** 2026-02-19
**Scope:** All 188 SQL migrations + application-layer TypeScript
**Methodology:** 5-stream parallel audit against ADR-024, ADR-030, ADR-018, SEC-001, SEC-002
**Tooling Cross-Validation:** Pre-commit hooks (7), CI workflows (3), full-scan lint scripts (4), Jest security tests (10)

---

## Executive Summary

| Severity | Active (Unremediated) | Remediated | Tooling Gaps |
|----------|----------------------|------------|--------------|
| **CRITICAL** | 2 | 6 | 0 |
| **HIGH** | 4 | 0 | 2 |
| **MEDIUM** | ~25 | 0 | 1 |
| **LOW** | 5 | 0 | 1 |
| **INFO** | 3 | 0 | 0 |

**ADR-030 D4 Category A tables: ALL 4 COMPLIANT** (staff, staff_pin_attempts, staff_invite, player_casino).

---

## Part 1: Active Findings (Unremediated)

### CRITICAL — Actor Impersonation via `p_actor_id` Bypass

| # | Function | Migration | Attack Vector | Impact |
|---|----------|-----------|---------------|--------|
| C-1 | `rpc_create_pit_cash_observation(...)` | `20260116201236_prd007_table_buyin_telemetry.sql` | Accepts `p_actor_id uuid DEFAULT NULL`. When provided, skips `set_rls_context_from_staff()` entirely. SECURITY DEFINER — bypasses all RLS. | Any authenticated user can impersonate any active staff member to create pit cash observations. Cross-tenant write via spoofed staff lookup. |
| C-2 | `rpc_log_table_buyin_telemetry(...)` | `20260116201236_prd007_table_buyin_telemetry.sql` | Same `p_actor_id` bypass pattern. SECURITY DEFINER write RPC. | Any authenticated user can write telemetry as any staff member. Corrupts shift metrics data provenance. |

**Invariant Violations:** ADR-024 INV-7 (mandatory self-injection), INV-8 (no spoofable identity params), ADR-030 INV-030-4 (write RPCs must derive context).

**Remediation:** Remove `p_actor_id` parameter. Unconditionally call `set_rls_context_from_staff()`. Validate context-derived casino_id matches row casino_id.

---

### HIGH — Privilege Escalation & Posture Gaps

| # | Function | Migration | Issue | Impact |
|---|----------|-----------|-------|--------|
| H-1 | `rpc_shift_table_metrics(...)` | `20260219002247_enable_adjustment_telemetry.sql` | Accepts `p_actor_id uuid`. When provided, looks up staff directly without JWT validation. SECURITY INVOKER mitigates RLS bypass but allows cross-tenant data reads via service_role. | Shift metrics data accessible to any caller providing a valid staff UUID. |
| H-2 | `rpc_shift_pit_metrics(...)` | Same migration | Same `p_actor_id` bypass pattern. | Same as H-1. |
| H-3 | `rpc_shift_casino_metrics(...)` | Same migration | Same `p_actor_id` bypass pattern. | Same as H-1. |
| H-4 | `rpc_enroll_player(uuid)` | `20260211184703_create_rpc_enroll_player.sql` | SECURITY DEFINER with no role gate. `player_casino` INSERT policy restricts to pit_boss/admin, but DEFINER bypasses RLS entirely. | Any authenticated staff (dealer, cashier) can enroll players — contradicts RBAC intent. |

**H-1/H-2/H-3 Invariant Violations:** ADR-024 INV-8 (no spoofable identity params).
**H-4 Invariant Violations:** ADR-018 (SECURITY DEFINER must enforce equivalent-or-stricter access control than bypassed RLS).

---

### MEDIUM — Defense-in-Depth Gaps

#### MEDIUM-A: Missing `REVOKE ALL FROM PUBLIC` (ADR-018)

SECURITY DEFINER functions default to `EXECUTE` granted to `PUBLIC` in PostgreSQL. Without explicit `REVOKE ALL FROM PUBLIC`, the `anon` role can call these functions. Internal auth checks block execution, but this violates defense-in-depth.

| # | Functions | Migration | Count |
|---|-----------|-----------|-------|
| M-1 | `rpc_confirm_table_fill`, `rpc_confirm_table_credit`, `rpc_acknowledge_drop_received` | `20260217074826_prd033_cashier_confirmation_rpcs.sql` | 3 |
| M-2 | `rpc_seed_game_settings_defaults` | `20260210081120_prd029_rpc_seed_game_settings_defaults.sql` | 1 |
| M-3 | 12 RPCs from ADR-024 remediation wave (rpc_start_rating_slip, rpc_close_rating_slip, rpc_update_average_bet, rpc_change_table, rpc_change_seat, rpc_pause_rating_slip, rpc_resume_rating_slip, rpc_end_break, rpc_create_financial_txn, rpc_issue_mid_session_reward, rpc_check_in_player, rpc_check_out_player) | `20251231072655_adr024_rpc_context_remediation.sql` | 12 |

**Total: ~16 SECURITY DEFINER RPCs missing REVOKE ALL FROM PUBLIC.**

#### MEDIUM-B: Other Posture Gaps

| # | Item | Migration | Issue |
|---|------|-----------|-------|
| M-4 | `rpc_start_rating_slip` | `20251231072655` | Residual `p_actor_id uuid DEFAULT NULL` parameter. Function ignores it (uses context), but parameter exists in signature — confusing and signals old pattern. |
| M-5 | `rpc_issue_mid_session_reward` | `20260103091827` | Uses SECURITY INVOKER but signature lacks explicit annotation comment. ADR-030 requires clear documentation of INVOKER choice. |
| M-6 | Bypass lockdown CI guard | `lib/supabase/__tests__/bypass-lockdown.test.ts` | `skipAuth: true` scanner does not exempt `app/(onboarding)/` paths. Two legitimate onboarding files (`invite/accept/_actions.ts`, `bootstrap/_actions.ts`) would be flagged but the test itself crashes (see Tooling Gap TG-1). |

---

### LOW — Consistency & Robustness Defects

| # | Item | Migration | Issue |
|---|------|-----------|-------|
| L-1 | `game_settings_side_bet` RLS policies | `20260210081119_prd029_game_settings_schema_evolution.sql` | Missing `NULLIF()` wrappers in COALESCE pattern. `current_setting('app.casino_id', true)::uuid` throws cast error on empty string instead of falling through to JWT branch. All other Pattern C policies use NULLIF. |
| L-2 | `search_path` inconsistency | Multiple (temporal RPCs, cashier RPCs) | Some SECURITY DEFINER functions use `SET search_path TO 'public'` instead of standard `pg_catalog, public`. Minimal risk in Supabase but inconsistent. |
| L-3 | `exec_sql(text)` | `00000000000000_baseline_srm.sql` | Legacy unrestricted SQL execution function. Pre-dates all ADR security controls. Should be dropped if unused. |
| L-4 | `compute_gaming_day(uuid, timestamptz)` (2-arg) | `20251108195341_table_context_chip_custody.sql` | Pre-ADR-024, accepts spoofable `p_casino_id`. Superseded by `compute_gaming_day_for_casino(timestamptz)` which reads context. Old version should be dropped if unused. |
| L-5 | Role gate references `'manager'` | `20260210081119`, `20260210081120` | `'manager'` is not in canonical `staff_role` enum (`dealer`, `pit_boss`, `cashier`, `admin`). Dead code in role gates. |

---

### INFO — Documentation & Cosmetic

| # | Item | Detail |
|---|------|--------|
| I-1 | Deprecated RPC in test fixtures | `rpc_log_table_buyin_telemetry` referenced in test files with `skipAuth: true`. Deprecated RPC should be removed from test fixtures when C-2 is remediated. |
| I-2 | Staff DML exception documentation | `services/staff/crud.ts` uses `.from('staff').insert()` — documented exception per SRM for admin-only staff creation path. Not a violation. |
| I-3 | `search_path` minor variant | `bridge_rated_buyin_to_telemetry()` uses `SET search_path TO 'public'` (missing `pg_catalog`). Trigger function — minimal risk. |

---

## Part 2: Remediated Findings (Historical)

These CRITICAL findings existed in early migrations but were fixed by subsequent migrations. Documented for completeness.

| # | Original Function | Original Migration | Remediation Migration | Issue |
|---|-------------------|-------------------|----------------------|-------|
| R-1 | `rpc_log_table_inventory_snapshot` | `20251108195341` | `20251231072655` | Spoofable `p_casino_id`, no `set_rls_context_from_staff()`, SECURITY DEFINER |
| R-2 | `rpc_request_table_fill` | `20251108195341` | `20251231072655` | Same pattern |
| R-3 | `rpc_request_table_credit` | `20251108195341` | `20251231072655` | Same pattern |
| R-4 | `rpc_log_table_drop` | `20251108195341` | `20251231072655` | Same pattern |
| R-5 | `rpc_create_financial_txn` | `20251215041423` | `20251231072655` | Same pattern |
| R-6 | `set_rls_context()` (3-param) | `20251108220000` | `20251231014359` (ADR-024) | Fully spoofable context injection |

---

## Part 3: ADR-030 D4 Category A Compliance

All four D4 critical tables use Template 2b (session-var-only) for write policies with no COALESCE fallback.

| Critical Table | INSERT | UPDATE | DELETE | Mechanism | Verdict |
|---------------|--------|--------|--------|-----------|---------|
| `staff` | Session-var only | Session-var only | Session-var only (admin) | RLS policies (20260129193824) | **COMPLIANT** |
| `staff_pin_attempts` | Deny-all | Deny-all | Deny-all | No policies + REVOKE ALL | **EXCEEDS** |
| `staff_invite` | Session-var only (admin) | Session-var only (admin) | No policy (correct) | RLS policies (20260208140546) | **COMPLIANT** |
| `player_casino` | Session-var only (pit_boss/admin) | Session-var only | Hard deny | RLS policies (20260129193824) | **COMPLIANT** |

---

## Part 4: Tooling Validation Cross-Reference

### Tooling Inventory

| Layer | Tool | Version | Coverage |
|-------|------|---------|----------|
| Pre-commit | Migration naming | v1.1.0 | Filename format validation |
| Pre-commit | Migration safety | v3.0.0 | RLS policy regression, COALESCE pattern, auth.uid() guard |
| Pre-commit | RPC self-injection | v2.0.0 | ADR-024 `set_rls_context_from_staff()` in every `rpc_*` |
| Pre-commit | API route sanity | v2.2.0 | 9 middleware/schema checks |
| Pre-commit | Service check | v2.6.0 | 16 service-layer pattern checks |
| Pre-commit | Zustand check | v1.0.0 | Store pattern compliance |
| Pre-commit | RLS write-path | v1.0.0 | Category A direct DML prevention |
| CI | migration-lint.yml | — | RPC self-injection (full diff) |
| Script | lint-rls-write-path.sh | — | Full-scan Category A DML detection |
| Script | lint-rls-category-b-policies.sh | — | pg_policies query for unwrapped current_setting |
| Jest | bypass-lockdown.test.ts | — | skipAuth guard, dev bypass containment |

### Tooling Gaps Discovered

| # | Severity | Gap | Impact |
|---|----------|-----|--------|
| TG-1 | **HIGH** | `bypass-lockdown.test.ts` line 153: `fail()` undefined in Jest 30. Test crashes before scanning for `skipAuth: true` in production files. | **Masks 2 real violations** in `app/(onboarding)/invite/accept/_actions.ts` and `app/(onboarding)/bootstrap/_actions.ts`. These are legitimate onboarding exceptions but the scanner cannot distinguish them from real violations. |
| TG-2 | **HIGH** | `scripts/__tests__/lint-rls-write-path.regression.sh` — synthetic violation not detected. Lint script `scripts/lint-rls-write-path.sh` has a grep pattern/exclude gap. | Write-path lint may have false negatives. Full-scan lint appears functional (0 violations found in production code), but the regression test proves the detection pattern is brittle. |
| TG-3 | **MEDIUM** | Pre-commit hooks and CI only check **staged/modified** files. Historical migrations are never retroactively validated. | 9 older migrations define `rpc_*` functions without `set_rls_context*` calls. Some may have been superseded by later CREATE OR REPLACE migrations, but this is unvalidated. |
| TG-4 | **LOW** | `lint-rls-category-b-policies.sh` requires running local Supabase DB. Cannot run in CI without DB fixture. | Category B write-policy Pattern C compliance is not continuously validated. |

### Historical Migrations Missing RPC Self-Injection (TG-3 Detail)

These 9 migrations define `rpc_*` functions without `set_rls_context_from_staff()` or `set_rls_context()`. Many were superseded by later CREATE OR REPLACE migrations — marked where confirmed.

| Migration | RPC Count | Superseded? |
|-----------|-----------|-------------|
| `00000000000000_baseline_srm.sql` | 2 | Likely (baseline) |
| `20251128221408_rating_slip_pause_tracking.sql` | 6 | Yes — by `20251231072655` |
| `20251207024918_rating_slip_drop_player_id.sql` | 1 | Yes — by `20251231072655` |
| `20251211153228_adr015_rls_compliance_patch.sql` | 1 | Yes — by `20251231014359` |
| `20251212080915_sec006_rls_hardening.sql` | 1 | Yes — by `20251231072655` |
| `20251212081000_sec007_rating_slip_rpc_hardening.sql` | 5 | Yes — by `20251231072655` |
| `20251213010000_prd004_loyalty_rpcs.sql` | 6 | Partial — needs manual verification |
| `20251216073543_adr014_ghost_visit_loyalty_guard.sql` | 2 | Partial — needs manual verification |
| `20251229024258_issue_b5894ed8_p0_blockers.sql` | 1 | Needs verification |

---

## Part 5: Application Layer Posture

| Check | Status | Detail |
|-------|--------|--------|
| Middleware chain integrity | **PASS** | `withAuth` → `withRLS` → action pipeline enforced |
| DEV_AUTH_BYPASS containment | **PASS** | Gated behind `NODE_ENV=development` + `NEXT_PUBLIC_DEV_AUTH_BYPASS_ENABLED` |
| Service key usage | **PASS** | Restricted to server-only utilities |
| `skipAuth: true` in production | **2 instances** | `app/(onboarding)/invite/accept/_actions.ts:33`, `app/(onboarding)/bootstrap/_actions.ts:39` — legitimate ADR-030 D6 onboarding bootstrap exceptions |
| Direct Category A DML | **PASS** | 0 violations in production code (1 documented staff exception) |
| Template 2b RPC discipline | **PASS** | All Category A write paths route through SECURITY DEFINER RPCs |

---

## Part 6: Recommended Remediation Priority

### P0 — Immediate (Security)

1. **C-1, C-2**: Remove `p_actor_id` from `rpc_create_pit_cash_observation` and `rpc_log_table_buyin_telemetry`. Unconditionally call `set_rls_context_from_staff()`. Single migration.
2. **H-4**: Add role gate (`pit_boss`, `admin`) to `rpc_enroll_player()`. Single ALTER.

### P1 — Next Sprint (Defense-in-Depth)

3. **H-1/H-2/H-3**: Remove `p_actor_id` parameter from shift metrics RPCs. If service_role needs a different path, use a separate internal function.
4. **M-1/M-2/M-3**: Add `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated` to all ~16 affected SECURITY DEFINER RPCs. Single migration.
5. **TG-1**: Fix `bypass-lockdown.test.ts` — replace `fail()` with `throw new Error()` or `expect(...).toBe(0)`. Add onboarding path exemptions.
6. **TG-2**: Fix write-path regression test grep pattern.

### P2 — Hardening Backlog

7. **L-1**: Add NULLIF wrappers to `game_settings_side_bet` RLS policies.
8. **L-3/L-4**: Drop `exec_sql(text)` and 2-arg `compute_gaming_day` if unused.
9. **M-4**: Remove vestigial `p_actor_id` parameter from `rpc_start_rating_slip`.
10. **L-2**: Standardize `search_path` to `pg_catalog, public` across all SECURITY DEFINER functions.
11. **TG-3**: Run one-time full-migration self-injection audit against live database function catalog.
12. **TG-4**: Add CI-compatible Category B policy lint (mock or ephemeral DB).

---

## Invariant Cross-Reference

| Invariant | Status | Violations |
|-----------|--------|------------|
| ADR-024 INV-1 (context via set_rls_context_from_staff) | PARTIAL | C-1, C-2 bypass when p_actor_id provided |
| ADR-024 INV-7 (mandatory self-injection) | PARTIAL | C-1, C-2 |
| ADR-024 INV-8 (no spoofable identity params) | PARTIAL | C-1, C-2, H-1, H-2, H-3, M-4 |
| ADR-030 INV-030-1 (TOCTOU-free context) | PASS | — |
| ADR-030 INV-030-2 (claims lifecycle) | PASS | — |
| ADR-030 INV-030-3 (bypass lockdown) | PASS | Tooling gap TG-1 |
| ADR-030 INV-030-4 (write-path session-var) | PARTIAL | C-1, C-2 |
| ADR-030 INV-030-5 (D5 transport constraint) | PASS | — |
| ADR-030 INV-030-6 (D6 bootstrap mode) | PASS | Onboarding exceptions documented |
| ADR-030 INV-030-7 (D4 Category A tables) | **PASS** | All 4 tables compliant |
| ADR-018 (REVOKE ALL FROM PUBLIC) | PARTIAL | M-1, M-2, M-3 (~16 RPCs) |
| SEC-001 Template 2b (session-var-only writes) | **PASS** | All Category A tables |
| SEC-001 Pattern C (COALESCE hybrid) | PARTIAL | L-1 (missing NULLIF) |

---

*Audit conducted 2026-02-19 via 5-stream parallel investigation + automated tooling cross-validation.*
*Streams: Legacy RPCs, ADR-024 Remediation, Jan 2026 RPCs, Feb 2026 RPCs + D4 Policies, Application Layer.*
