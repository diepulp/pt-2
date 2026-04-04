# SEC-S3 Search Path Body Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the SEC-S3 migration to use `CREATE OR REPLACE` with schema-qualified bodies for functions that access tables, fixing the runtime breakage caused by `SET search_path = ''` on functions with unqualified references.

**Architecture:** The committed SEC-S3 migration uses `ALTER FUNCTION ... SET search_path = ''` (metadata-only). 17 of 36 targeted functions contain unqualified table/function references that fail at runtime with empty search_path. Fix: `CREATE OR REPLACE` with `public.`-qualified bodies + `SET search_path = ''`. 19 safe functions (no table access) keep the `ALTER FUNCTION` approach.

**Tech Stack:** PostgreSQL, Supabase migrations

---

### Task 1: Replace SEC-S3 migration with schema-qualified body rewrites

**Files:**
- Modify: `supabase/migrations/20260403202628_fix_function_search_path_sec_s3.sql`

**Approach:**
- Part 1 (17 functions): `CREATE OR REPLACE FUNCTION` with all table/function/type references prefixed `public.`, plus `SET search_path = ''` in the function definition
- Part 2 (19 functions): `ALTER FUNCTION ... SET search_path = ''` (safe — no table access or already schema-qualified)

**17 functions requiring body rewrite:**
1. `set_fin_txn_gaming_day()` — `compute_gaming_day` -> `public.compute_gaming_day`
2. `assert_table_context_casino()` — `gaming_table` -> `public.gaming_table`
3. `compute_gaming_day(uuid, timestamptz)` — `casino_settings` -> `public.casino_settings`
4. `evaluate_session_reward_suggestion(uuid, timestamptz)` — `rating_slip`, `calculate_theo_from_snapshot`
5. `compute_slip_final_seconds(uuid)` — `rating_slip`, `rating_slip_pause`
6. `rpc_get_visit_live_view(uuid, boolean, integer)` — `visit`, `player`, `rating_slip`, `gaming_table`, `player_financial_transaction`, `set_rls_context_from_staff`, `rpc_get_rating_slip_duration`
7. `trg_pit_cash_observation_set_gaming_day()` — `compute_gaming_day`
8. `set_table_session_gaming_day()` — `compute_gaming_day`
9. `set_visit_gaming_day()` — `compute_gaming_day`
10. `guard_stale_gaming_day_write()` — `compute_gaming_day`, `rating_slip`, `visit`
11. `rpc_shift_active_visitors_summary()` — `set_rls_context_from_staff`, `rating_slip`, `visit`
12. `set_game_settings_side_bet_casino_id()` — `game_settings`
13. `trg_gaming_table_game_settings_tenant_check()` — `game_settings`
14. `rpc_get_rating_slip_duration(uuid, timestamptz)` — `rating_slip`, `rating_slip_pause`, `rating_slip_status` (type)
15. `rpc_get_dashboard_stats()` — `set_rls_context_from_staff`, `gaming_table`, `rating_slip`, `visit`
16. `rpc_list_active_players_casino_wide(int, text)` — `set_rls_context_from_staff`, `rating_slip`, `visit`, `gaming_table`, `player`, `player_loyalty`
17. `rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)` — `set_rls_context_from_staff`, `rating_slip`, `visit`, `gaming_table`, `player`, `player_loyalty`

**19 safe functions (ALTER FUNCTION only):**
`evaluate_mid_session_reward_policy`, `update_game_settings_updated_at`, `compute_gaming_day(timestamptz, interval)`, `calculate_theo_from_snapshot`, `trg_visit_set_group_id`, `update_player_identity_updated_at`, `trg_mtl_immutable`, `trg_pit_cash_observation_immutable`, `trg_mtl_entry_set_gaming_day`, `trg_promo_program_updated_at`, `update_table_session_updated_at`, `trg_reward_catalog_updated_at`, `trg_loyalty_earn_config_updated_at`, `update_game_settings_side_bet_updated_at`, `set_import_batch_updated_at`, `chipset_total_cents`, `trg_player_exclusion_lift_only`, `is_exclusion_active`, `get_player_exclusion_status`

- [ ] **Step 1:** Write the complete migration file (see Task 1 code block below)
- [ ] **Step 2:** Update the GAMING-DAY-FUNCTION-DRIFT.md to reflect the fix
- [ ] **Step 3:** Commit

### Task 2: Validate

- [ ] **Step 1:** Run Supabase advisors to confirm SEC-S3 issues are resolved
- [ ] **Step 2:** Spot-check a function on the remote DB to confirm search_path is set
