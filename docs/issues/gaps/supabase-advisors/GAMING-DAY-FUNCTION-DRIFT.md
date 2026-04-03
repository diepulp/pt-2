# Gaming-Day Function Drift – Investigation Notes (2026-04-03)

**Source context:** [`IMPLEMENTATION-PRECIS-2026-04-03.md`](./IMPLEMENTATION-PRECIS-2026-04-03.md)

## Problem Statement (revised after investigation)

The original SEC-S3 migration (`20260403202628_fix_function_search_path_sec_s3.sql`) used
`ALTER FUNCTION ... SET search_path = ''` on all 36 functions without rewriting function bodies.
**17 of those 36 functions contain unqualified table, function, or type references** that would
fail at runtime with an empty search path (e.g., `relation "casino_settings" does not exist`).

The initial diagnosis (missing `compute_gaming_day(uuid, timestamptz)` during `db reset`)
was **incorrect** — PRD-000 exists in this tree and creates the Layer-2 function. The real
issue was the search-path/body inconsistency.

## Root Cause

The remediation agent chose metadata-only `ALTER FUNCTION` to "minimize regression risk,"
but this approach is fundamentally wrong for functions with unqualified references.
`SET search_path = ''` forces all object resolution to use fully-qualified names, so
function bodies must use `public.table_name` and `public.function_name()` syntax.

This is **not** architectural drift — the unqualified references work correctly under
PostgreSQL's default search_path (`"$user", public`). The breakage is introduced solely
by the SEC-S3 remediation.

## Affected Functions (17)

| # | Function | Unqualified References |
|---|----------|----------------------|
| 1 | `set_fin_txn_gaming_day()` | `compute_gaming_day()` |
| 2 | `assert_table_context_casino()` | `gaming_table` |
| 3 | `compute_gaming_day(uuid, timestamptz)` | `casino_settings` |
| 4 | `evaluate_session_reward_suggestion(uuid, timestamptz)` | `rating_slip`, `calculate_theo_from_snapshot()` |
| 5 | `compute_slip_final_seconds(uuid)` | `rating_slip`, `rating_slip_pause` |
| 6 | `rpc_get_visit_live_view(uuid, boolean, integer)` | `visit`, `player`, `rating_slip`, `gaming_table`, `player_financial_transaction`, `set_rls_context_from_staff()`, `rpc_get_rating_slip_duration()` |
| 7 | `trg_pit_cash_observation_set_gaming_day()` | `compute_gaming_day()` |
| 8 | `set_table_session_gaming_day()` | `compute_gaming_day()` |
| 9 | `set_visit_gaming_day()` | `compute_gaming_day()` |
| 10 | `guard_stale_gaming_day_write()` | `compute_gaming_day()`, `rating_slip`, `visit` |
| 11 | `rpc_shift_active_visitors_summary()` | `set_rls_context_from_staff()`, `rating_slip`, `visit` |
| 12 | `set_game_settings_side_bet_casino_id()` | `game_settings` |
| 13 | `trg_gaming_table_game_settings_tenant_check()` | `game_settings` |
| 14 | `rpc_get_rating_slip_duration(uuid, timestamptz)` | `rating_slip`, `rating_slip_pause`, `rating_slip_status` (type) |
| 15 | `rpc_get_dashboard_stats()` | `set_rls_context_from_staff()`, `gaming_table`, `rating_slip`, `visit` |
| 16 | `rpc_list_active_players_casino_wide(int, text)` | `set_rls_context_from_staff()`, `rating_slip`, `visit`, `gaming_table`, `player`, `player_loyalty` |
| 17 | `rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)` | `set_rls_context_from_staff()`, `rating_slip`, `visit`, `gaming_table`, `player`, `player_loyalty` |

## Fix Applied

**Option A: Full body rewrite** — the SEC-S3 migration was rewritten in-place:

- **Part 1 (17 functions):** `CREATE OR REPLACE` with all references schema-qualified (`public.`) + `SET search_path = ''` in the function definition
- **Part 2 (19 functions):** `ALTER FUNCTION ... SET search_path = ''` (safe — no table access or already schema-qualified)

Remote DB was **not affected** — the original SEC-S3 migration was never applied remotely.

## Validation Checklist

- [x] All 9 referenced tables exist on remote DB
- [x] All 5 referenced functions exist on remote DB (including both `compute_gaming_day` overloads)
- [x] `rating_slip_status` custom type exists on remote DB
- [ ] Apply migration to remote/branch and re-run Supabase Advisors
- [ ] Verify `search_path` is set on all 36 functions post-migration
