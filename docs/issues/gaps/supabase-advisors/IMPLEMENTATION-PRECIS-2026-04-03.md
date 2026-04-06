# Supabase Advisor Remediation — Implementation Précis

**Findings report:** [SUPABASE-ADVISOR-REPORT-2026-04-02.md](./SUPABASE-ADVISOR-REPORT-2026-04-02.md)  
**Date implemented:** 2026-04-03  
**Branch:** `claude/fix-supabase-advisor-issues-5jyue`  
**Total issues addressed:** 303 / 303  
**Commits:** 4 (`f8d56dd`, `09aacbb`, `f236ed8`, `93f76b7`)

---

## Disposition Summary

| Disposition | Issues | Method |
|-------------|--------|--------|
| Fixed via SQL migration | 171 | 7 migration files (1,453 lines) |
| Deferred to post-launch | 126 | Tracking doc (traffic analysis required) |
| Requires dashboard action | 3 | Manual runbook created |
| Documented (intentional) | 3 | Explicit deny-all policies added |
| **Total** | **303** | — |

---

## Artifacts Produced

### SQL Migrations (7 files, 1,453 lines)

| # | Migration | Lines | Issues | Track |
|---|-----------|-------|--------|-------|
| 1 | `20260403201739_move_pg_trgm_to_extensions_schema.sql` | 28 | SEC-S4 | B |
| 2 | `20260403201854_drop_duplicate_loyalty_ledger_index.sql` | 12 | PERF-P2 | C |
| 3 | `20260403202125_add_unindexed_foreign_key_indexes.sql` | 321 | PERF-P4 | C |
| 4 | `20260403202555_fix_supabase_advisor_sec_s1_s2_s5.sql` | 110 | SEC-S1, SEC-S2, SEC-S5 | A |
| 5 | `20260403202628_fix_function_search_path_sec_s3.sql` | 158 | SEC-S3 | A |
| 6 | `20260403202700_fix_rls_initplan_perf_p1.sql` | 747 | PERF-P1 | A |
| 7 | `20260403202939_fix_staff_permissive_policies_perf_p3.sql` | 77 | PERF-P3 | A |

### Documentation (2 files)

| File | Purpose |
|------|---------|
| [`DASHBOARD-REMEDIATIONS.md`](./DASHBOARD-REMEDIATIONS.md) | Manual steps for SEC-S6, SEC-S7, SEC-S8 |
| [`UNUSED-INDEX-REVIEW.md`](./UNUSED-INDEX-REVIEW.md) | 126 unused indexes cataloged for 30-day post-launch review |

---

## Issue-by-Issue Remediation Log

### SEC-S1: SECURITY DEFINER View [ERROR] — FIXED

**Entity:** `mtl_gaming_day_summary` view  
**Root cause:** Postgres defaults views to `SECURITY DEFINER`, bypassing the querying user's RLS policies.  
**Fix:** Dropped and recreated the view with `security_invoker = true`. All column expressions and GROUP BY preserved identically — only the security context changed.  
**Migration:** `_sec_s1_s2_s5.sql` (lines 16–53)

### SEC-S2: RLS Enabled But No Policies [INFO] — DOCUMENTED + EXPLICIT DENY

**Entities:** `company`, `staff_pin_attempts`  
**Root cause:** Both tables intentionally use deny-by-default (RLS on, zero permissive policies). `company` was locked down in PRD-025 (metadata-only table, access via `service_role`). `staff_pin_attempts` is accessed exclusively through `SECURITY DEFINER` RPCs (`rpc_increment_pin_attempt`, `rpc_clear_pin_attempts`).  
**Fix:** Added explicit `USING (false) WITH CHECK (false)` deny-all policies with comments documenting intent. This silences the Supabase lint (0008) without changing the security posture.  
**Migration:** `_sec_s1_s2_s5.sql` (lines 55–86)

### SEC-S3: Function Search Path Mutable [WARN] — FIXED (36 functions)

**Root cause:** 35 functions (plus `get_player_exclusion_status` = 36 total) lacked explicit `search_path`, making them vulnerable to search-path hijacking via unqualified object references.  
**Fix:** `ALTER FUNCTION ... SET search_path = ''` on all 36 functions. Metadata-only change — no function bodies were rewritten. Empty search path forces all object references to be schema-qualified at runtime.  
**Migration:** `_sec_s3.sql` (158 lines)  
**Design decision:** Used `ALTER FUNCTION` rather than `CREATE OR REPLACE` to avoid touching function bodies and minimize regression risk.

### SEC-S4: Extension in Public Schema [WARN] — FIXED

**Entity:** `pg_trgm` extension  
**Root cause:** Extension in `public` schema can be manipulated by users with `CREATE` privileges on `public`.  
**Fix:** Dropped `pg_trgm` from `public`, recreated in `extensions` schema (Supabase convention). Dropped and recreated the dependent `ix_player_name_trgm` GIN index with `extensions.gin_trgm_ops` operator class.  
**Migration:** `_move_pg_trgm_to_extensions_schema.sql` (28 lines)

### SEC-S5: Materialized View Exposed via API [WARN] — FIXED

**Entity:** `mv_loyalty_balance_reconciliation`  
**Root cause:** Materialized view was selectable by `anon` and `authenticated` roles through PostgREST.  
**Fix:** `REVOKE SELECT FROM anon, authenticated; GRANT SELECT TO service_role;`  
**Migration:** `_sec_s1_s2_s5.sql` (lines 88–95)

### SEC-S6: Leaked Password Protection Disabled [WARN] — RUNBOOK

**Fix:** Enable in Supabase Dashboard > Auth > Settings.  
**Tracking:** [`DASHBOARD-REMEDIATIONS.md`](./DASHBOARD-REMEDIATIONS.md)

### SEC-S7: Insufficient MFA Options [WARN] — RUNBOOK

**Fix:** Enable TOTP and WebAuthn in Dashboard > Auth > MFA.  
**Tracking:** [`DASHBOARD-REMEDIATIONS.md`](./DASHBOARD-REMEDIATIONS.md)

### SEC-S8: Vulnerable Postgres Version [WARN] — RUNBOOK

**Current:** `supabase-postgres-17.4.1.074`  
**Fix:** Upgrade via Supabase Dashboard > Settings > Infrastructure.  
**Tracking:** [`DASHBOARD-REMEDIATIONS.md`](./DASHBOARD-REMEDIATIONS.md)

### PERF-P1: Auth RLS InitPlan Re-evaluation [WARN] — FIXED (57 policies, 27 tables)

**Root cause:** RLS policies using `current_setting()`, `auth.uid()`, and `auth.jwt()` without subselect wrapping are re-evaluated per-row instead of being cached as a Postgres InitPlan. This was the single highest-impact performance issue across the database.  
**Fix:** Dropped and recreated all 57 affected policies with every `auth.*()` and `current_setting()` call wrapped in `(SELECT ...)` subselects. Policy semantics (COALESCE/NULLIF patterns, role gates, hybrid JWT fallbacks) preserved exactly.  
**Migration:** `_perf_p1.sql` (747 lines)  
**Affected tables:** `mtl_entry`, `mtl_audit_note`, `pit_cash_observation`, `promo_program`, `promo_coupon`, `table_buyin_telemetry`, `table_session`, `shift_alert`, `alert_acknowledgment`, `table_opening_attestation`, `loyalty_outbox`, `onboarding_registration`, `staff_invite`, `staff`, `gaming_table`, `game_settings_side_bet`, `table_rundown_report`, `shift_checkpoint`, `loyalty_ledger`, `player_identity`, `player_note`, `player_tag`, `loyalty_valuation_policy`, `loyalty_liability_snapshot`, `player_exclusion`, `player`, `player_casino`, `table_metric_baseline`  
**Design decision:** Used `DROP POLICY` + `CREATE POLICY` (not `ALTER POLICY`) since Postgres does not support altering policy expressions in-place.

### PERF-P2: Duplicate Index [WARN] — FIXED

**Entity:** `loyalty_ledger` table  
**Root cause:** Two identical indexes on `(casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL`: `ux_loyalty_ledger_idem` (original, 2025-12-13) and `loyalty_ledger_idempotency_uk` (duplicate, 2025-12-29).  
**Fix:** `DROP INDEX IF EXISTS public.loyalty_ledger_idempotency_uk;`  
**Migration:** `_drop_duplicate_loyalty_ledger_index.sql` (12 lines)

### PERF-P3: Multiple Permissive Policies [WARN] — FIXED

**Entity:** `staff` table UPDATE policies  
**Root cause:** Two permissive UPDATE policies (`staff_update` for admin-only access, `staff_update_own_pin` for self-service PIN changes) were OR'd together, widening access and adding planning overhead.  
**Fix:** Consolidated into a single UPDATE policy with OR branches: admin path (full row via session-var casino_id + role check) and self-service path (own record via `auth.uid() = user_id`, PIN column only via column-level GRANT). ADR-030 session-var-only pattern maintained.  
**Migration:** `_perf_p3.sql` (77 lines)

### PERF-P4: Unindexed Foreign Keys [INFO] — FIXED (68 indexes, 33 tables)

**Root cause:** 68 FK columns lacked indexes, causing sequential scans on JOINs and cascading deletes.  
**Fix:** Created 68 `CREATE INDEX IF NOT EXISTS` statements across 33 tables. All use single-column B-tree indexes. `CONCURRENTLY` intentionally omitted (Supabase migrations run inside transactions).  
**Migration:** `_add_unindexed_foreign_key_indexes.sql` (321 lines)  
**Design decision:** Composite indexes where the FK column is not the leading column do NOT satisfy FK lookups, so standalone single-column indexes were added even where composite coverage existed.

### PERF-P5: Unused Indexes [INFO] — DEFERRED (126 indexes)

**Root cause:** 126 indexes show zero scans in `pg_stat_user_indexes`.  
**Decision:** NOT dropped. System is pre-production — indexes have not been exercised by real traffic. Dropping now would risk re-adding them later under load pressure.  
**Tracking:** [`UNUSED-INDEX-REVIEW.md`](./UNUSED-INDEX-REVIEW.md) catalogs all 126 indexes by table with a 30-day post-launch review process.

---

## Execution Tracks

| Track | Expert | Issues | Migrations | Duration |
|-------|--------|--------|------------|----------|
| **A** | RLS Expert | SEC-S1, SEC-S2, SEC-S3, SEC-S5, PERF-P1, PERF-P3 | 4 (1,092 lines) | ~16 min |
| **B** | DevOps | SEC-S4, SEC-S6, SEC-S7, SEC-S8 | 1 (28 lines) + 1 doc | ~1.5 min |
| **C** | Performance Engineer | PERF-P2, PERF-P4, PERF-P5 | 2 (333 lines) + 1 doc | ~7 min |

All three tracks executed in parallel with isolated git worktrees, then merged to the shared branch via rebase.

---

## Remaining Manual Actions

- [ ] **SEC-S6:** Enable leaked password protection (Supabase Dashboard)
- [ ] **SEC-S7:** Enable TOTP + WebAuthn MFA (Supabase Dashboard)
- [ ] **SEC-S8:** Upgrade Postgres past `17.4.1.074` (Supabase Dashboard)
- [ ] **PERF-P5:** Re-run `pg_stat_user_indexes` 30 days post-launch

## Verification

After applying migrations, re-run the Supabase Database Advisor:

```
get_advisors(project_id="vaicxfihdldgepzryhpd", type="security")
get_advisors(project_id="vaicxfihdldgepzryhpd", type="performance")
```

**Expected result:** All migration-addressed issues (SEC-S1 through SEC-S5, PERF-P1 through PERF-P4) should no longer appear. SEC-S6/S7/S8 remain until dashboard actions are completed. PERF-P5 remains until post-launch review.
