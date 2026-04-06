# Supabase Advisor Report — 2026-04-02

**Project:** pt-v2 (`vaicxfihdldgepzryhpd`)  
**Source:** Supabase Database Linter (MCP `get_advisors`)  
**Total issues:** 303 (45 security + 258 performance)  
**Intent:** Triage for domain-expert investigation and remediation

---

## Summary Dashboard

| Category | Severity | Count | Expert |
|----------|----------|-------|--------|
| **SECURITY** | ERROR | 1 | RLS / Security |
| **SECURITY** | WARN | 43 | RLS / Security / DevOps |
| **SECURITY** | INFO | 2 | RLS / Security |
| **PERFORMANCE** | WARN | 64 | RLS / Performance |
| **PERFORMANCE** | INFO | 194 | DBA / Performance |
| **TOTAL** | — | **303** | — |

---

## SECURITY ADVISORS (45 issues)

### SEC-S1: SECURITY DEFINER View [ERROR] — 1 issue

**Risk:** Views with SECURITY DEFINER bypass the querying user's RLS policies, using the view creator's permissions instead.

| Entity | Schema | Type |
|--------|--------|------|
| `mtl_gaming_day_summary` | public | view |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view  
**Expert:** RLS Expert (`/rls-expert`)

---

### SEC-S2: RLS Enabled But No Policies [INFO] — 2 issues

**Risk:** Tables have RLS enabled but no policies defined — all access is denied by default, but this may mask missing intended policies.

| Table | Schema |
|-------|--------|
| `company` | public |
| `staff_pin_attempts` | public |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy  
**Expert:** RLS Expert (`/rls-expert`)

---

### SEC-S3: Function Search Path Mutable [WARN] — 35 issues

**Risk:** Functions without explicit `search_path` are vulnerable to search-path hijacking — a malicious schema could intercept unqualified object references.

| Function | Schema |
|----------|--------|
| `set_fin_txn_gaming_day` | public |
| `assert_table_context_casino` | public |
| `evaluate_mid_session_reward_policy` | public |
| `update_game_settings_updated_at` | public |
| `compute_gaming_day` (2 overloads) | public |
| `calculate_theo_from_snapshot` | public |
| `evaluate_session_reward_suggestion` | public |
| `compute_slip_final_seconds` | public |
| `trg_visit_set_group_id` | public |
| `update_player_identity_updated_at` | public |
| `rpc_get_visit_live_view` | public |
| `trg_mtl_immutable` | public |
| `trg_pit_cash_observation_set_gaming_day` | public |
| `trg_pit_cash_observation_immutable` | public |
| `trg_mtl_entry_set_gaming_day` | public |
| `trg_promo_program_updated_at` | public |
| `set_table_session_gaming_day` | public |
| `update_table_session_updated_at` | public |
| `set_visit_gaming_day` | public |
| `guard_stale_gaming_day_write` | public |
| `rpc_shift_active_visitors_summary` | public |
| `trg_reward_catalog_updated_at` | public |
| `trg_loyalty_earn_config_updated_at` | public |
| `set_game_settings_side_bet_casino_id` | public |
| `update_game_settings_side_bet_updated_at` | public |
| `trg_gaming_table_game_settings_tenant_check` | public |
| `set_import_batch_updated_at` | public |
| `rpc_get_rating_slip_duration` | public |
| `rpc_get_dashboard_stats` | public |
| `rpc_list_active_players_casino_wide` | public |
| `rpc_list_closed_slips_for_gaming_day` | public |
| `chipset_total_cents` | public |
| `trg_player_exclusion_lift_only` | public |
| `is_exclusion_active` | public |
| `get_player_exclusion_status` | public |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable  
**Fix pattern:** Add `SET search_path = ''` or `SET search_path = public` to each function definition.  
**Expert:** RLS Expert + Backend Service Builder

---

### SEC-S4: Extension in Public Schema [WARN] — 1 issue

**Risk:** Extensions in `public` schema can be manipulated by users with `CREATE` privileges on `public`.

| Extension | Current Schema |
|-----------|---------------|
| `pg_trgm` | public |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public  
**Fix:** Move to `extensions` schema via migration.  
**Expert:** DevOps / DBA

---

### SEC-S5: Materialized View Exposed via API [WARN] — 1 issue

**Risk:** Materialized view is selectable by `anon` or `authenticated` roles through the Data API (PostgREST).

| Materialized View | Schema |
|-------------------|--------|
| `mv_loyalty_balance_reconciliation` | public |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api  
**Fix:** `REVOKE SELECT ON mv_loyalty_balance_reconciliation FROM anon, authenticated;` or apply RLS.  
**Expert:** RLS Expert

---

### SEC-S6: Auth — Leaked Password Protection Disabled [WARN]

**Risk:** Users can sign up with known-compromised passwords. Supabase can check against HaveIBeenPwned.

**Remediation:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection  
**Fix:** Enable in Supabase Dashboard > Auth > Settings.  
**Expert:** DevOps

---

### SEC-S7: Auth — Insufficient MFA Options [WARN]

**Risk:** Too few MFA methods enabled, weakening account security.

**Remediation:** https://supabase.com/docs/guides/auth/auth-mfa  
**Fix:** Enable additional MFA methods (TOTP, WebAuthn) in Dashboard.  
**Expert:** DevOps

---

### SEC-S8: Vulnerable Postgres Version [WARN]

**Risk:** Current version `supabase-postgres-17.4.1.074` has outstanding security patches.

**Remediation:** https://supabase.com/docs/guides/platform/upgrading  
**Fix:** Upgrade Postgres via Supabase Dashboard.  
**Expert:** DevOps

---

## PERFORMANCE ADVISORS (258 issues)

### PERF-P1: Auth RLS InitPlan Re-evaluation [WARN] — 57 issues

**Risk:** RLS policies using `current_setting()` or `auth.*()` functions are re-evaluated per-row instead of being cached as an InitPlan. This is the single highest-impact performance issue — affects every query on these tables.

**Affected tables (27 unique):**

| Table | Policies Affected |
|-------|-------------------|
| `mtl_entry` | `mtl_entry_insert`, `mtl_entry_select` |
| `mtl_audit_note` | `mtl_audit_note_select`, `mtl_audit_note_insert` |
| `pit_cash_observation` | `select`, `insert`, `no_update`, `no_delete` |
| `promo_program` | `select_same_casino`, `insert_staff`, `no_delete` |
| `promo_coupon` | `select_same_casino`, `insert_staff`, `no_delete` |
| `table_buyin_telemetry` | `select_same_casino` |
| `table_session` | `select_policy`, `insert_deny`, `update_deny`, `delete_deny` |
| `shift_alert` | `select_casino_scope` |
| `alert_acknowledgment` | `select_casino_scope` |
| `table_opening_attestation` | `select_own_casino` |
| `loyalty_outbox` | `select`, `insert`, `no_updates`, `no_deletes` |
| `onboarding_registration` | `select_own_pending` |
| `staff_invite` | `select_admin_session`, `insert_admin_session`, `update_admin_session` |
| `staff` | `update_own_pin` |
| `gaming_table` | `insert_admin`, `update_admin` |
| `game_settings_side_bet` | `select`, `insert`, `update` |
| `table_rundown_report` | `select` |
| `shift_checkpoint` | `select` |
| `loyalty_ledger` | `deny_update`, `deny_delete` |
| `player_identity` | `no_delete` |
| `player_note` | `deny_update`, `deny_delete` |
| `player_tag` | `deny_delete` |
| `loyalty_valuation_policy` | `select_casino_scope`, `insert_admin`, `update_admin` |
| `loyalty_liability_snapshot` | `select_casino_scope` |
| `player_exclusion` | `select_casino`, `insert_role`, `update_admin` |
| `player` | `no_delete` |
| `player_casino` | `no_delete` |
| `table_metric_baseline` | `select_casino_scope`, `insert_casino_scope`, `update_casino_scope`, `no_deletes` |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan  
**Fix pattern:** Wrap `current_setting()` calls in a subselect so Postgres can cache the value:
```sql
-- Before (re-evaluated per row):
current_setting('app.casino_id', true)::uuid

-- After (cached as InitPlan):
(SELECT current_setting('app.casino_id', true)::uuid)
```
**Expert:** RLS Expert + Performance Engineer

---

### PERF-P2: Duplicate Index [WARN] — 1 issue

**Risk:** Identical indexes waste storage and slow writes.

| Table | Duplicate Indexes |
|-------|-------------------|
| `loyalty_ledger` | `loyalty_ledger_idempotency_uk` = `ux_loyalty_ledger_idem` |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index  
**Fix:** Drop one of the two identical indexes.  
**Expert:** DBA / Backend Service Builder

---

### PERF-P3: Multiple Permissive Policies [WARN] — 6 issues

**Risk:** Multiple permissive policies on the same table/role/action are OR'd together, which may widen access beyond intent and adds planning overhead.

| Table | Action | Roles Affected |
|-------|--------|----------------|
| `staff` | UPDATE | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `reporting_reader` |

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies  
**Fix:** Consolidate UPDATE policies or convert extras to RESTRICTIVE.  
**Expert:** RLS Expert

---

### PERF-P4: Unindexed Foreign Keys [INFO] — 68 issues

**Risk:** Missing indexes on FK columns cause slow sequential scans on JOINs and cascading deletes.

<details>
<summary>Full list (68 foreign keys)</summary>

| Table | Foreign Key |
|-------|-------------|
| `alert_acknowledgment` | `acknowledged_by_fkey`, `casino_id_fkey` |
| `casino_settings` | `setup_completed_by_fkey` |
| `game_settings_side_bet` | `casino_id_fkey` |
| `gaming_table` | `par_updated_by_fkey` |
| `import_batch` | `created_by_staff_id_fkey` |
| `import_row` | `casino_id_fkey`, `matched_player_id_fkey` |
| `loyalty_outbox` | `ledger_id_fkey` |
| `loyalty_valuation_policy` | `created_by_staff_id_fkey` |
| `onboarding_registration` | `company_id_fkey` |
| `pit_cash_observation` | `created_by_staff_id_fkey`, `rating_slip_id_fkey` |
| `player_casino` | `enrolled_by_fkey` |
| `player_exclusion` | `created_by_fkey`, `lifted_by_fkey`, `player_id_fkey` |
| `player_identity` | `created_by_fkey`, `player_id_fkey`, `updated_by_fkey`, `verified_by_fkey` |
| `player_note` | `casino_id_fkey`, `created_by_fkey`, `player_id_fkey` |
| `player_tag` | `applied_by_fkey`, `player_id_fkey`, `removed_by_fkey` |
| `promo_coupon` | `issued_by_staff_id_fkey`, `replaced_by_staff_id_fkey`, `replacement_coupon_id_fkey`, `voided_by_staff_id_fkey` |
| `promo_program` | `created_by_staff_id_fkey` |
| `reward_eligibility` | `casino_id_fkey`, `reward_id_fkey` |
| `reward_entitlement_tier` | `reward_id_fkey` |
| `reward_limits` | `casino_id_fkey`, `reward_id_fkey` |
| `reward_price_points` | `casino_id_fkey` |
| `shift_alert` | `table_id_fkey` |
| `shift_checkpoint` | `created_by_fkey`, `gaming_table_id_fkey` |
| `staff_invite` | `created_by_fkey` |
| `staff_pin_attempts` | `staff_id_fkey` |
| `table_buyin_telemetry` | `actor_id_fkey`, `rating_slip_id_fkey`, `table_id_fkey`, `visit_id_fkey` |
| `table_credit` | `confirmed_by_fkey` |
| `table_drop_event` | `cage_received_by_fkey` |
| `table_fill` | `confirmed_by_fkey` |
| `table_metric_baseline` | `computed_by_fkey`, `table_id_fkey` |
| `table_opening_attestation` | `attested_by_fkey`, `predecessor_snapshot_id_fkey` |
| `table_rundown_report` | `closing_snapshot_id_fkey`, `computed_by_fkey`, `drop_event_id_fkey`, `finalized_by_fkey`, `gaming_table_id_fkey`, `opening_snapshot_id_fkey` |
| `table_session` | `activated_by_staff_id_fkey`, `closed_by_staff_id_fkey`, `gaming_table_id_fkey`, `opened_by_staff_id_fkey`, `paused_by_staff_id_fkey`, `resumed_by_staff_id_fkey`, `rolled_over_by_staff_id_fkey`, `rundown_started_by_staff_id_fkey` |

</details>

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys  
**Expert:** Performance Engineer + DBA

---

### PERF-P5: Unused Indexes [INFO] — 126 issues

**Risk:** Indexes that have never been used waste storage, slow writes, and bloat `pg_stat_user_indexes`. However, some may be needed for future queries or are too new to have been hit.

<details>
<summary>Full list (126 indexes)</summary>

| Index | Table |
|-------|-------|
| `idx_rating_slip_table_status_active` | `rating_slip` |
| `ix_rating_slip_accrual_kind` | `rating_slip` |
| `ix_mtl_patron_day` | `mtl_entry` |
| `ix_mtl_gaming_day_direction` | `mtl_entry` |
| `ix_mtl_occurred_at` | `mtl_entry` |
| `idx_tbt_table_window` | `table_buyin_telemetry` |
| `ix_visit_casino_gaming_day` | `visit` |
| `idx_financial_txn_related_txn_id` | `player_financial_transaction` |
| `idx_table_fill_casino_created` | `table_fill` |
| `idx_table_credit_casino_created` | `table_credit` |
| `idx_table_drop_event_casino_removed` | `table_drop_event` |
| `idx_table_inventory_snapshot_session` | `table_inventory_snapshot` |
| `ix_loyalty_outbox_unprocessed` | `loyalty_outbox` |
| `idx_reward_catalog_casino_active` | `reward_catalog` |
| `idx_gaming_table_casino_id` | `gaming_table` |
| `idx_player_email_lower` | `player` |
| `idx_player_phone_number` | `player` |
| `idx_gaming_table_game_settings_id` | `gaming_table` |
| `idx_table_fill_status_casino` | `table_fill` |
| `idx_rating_slip_theo_discrepancy` | `rating_slip` |
| `idx_table_fill_session` | `table_fill` |
| `idx_table_credit_session` | `table_credit` |
| `idx_import_batch_status_uploaded` | `import_batch` |
| `idx_import_batch_status_parsing_heartbeat` | `import_batch` |
| `idx_report_casino_id` | `report` |
| `idx_gaming_table_settings_casino_id` | `gaming_table_settings` |
| `idx_dealer_rotation_staff_id` | `dealer_rotation` |
| `idx_rating_slip_casino_id` | `rating_slip` |
| `idx_financial_player_timeline` | `player_financial_transaction` |
| `idx_mtl_entry_patron_uuid` | `mtl_entry` |
| `idx_mtl_entry_staff_id` | `mtl_entry` |
| `idx_mtl_entry_visit_id` | `mtl_entry` |
| `idx_mtl_player_timeline` | `mtl_entry` |
| `idx_table_inventory_snapshot_verified_by` | `table_inventory_snapshot` |
| `idx_tis_consumed_by` | `table_inventory_snapshot` |
| `idx_table_fill_delivered_by` | `table_fill` |
| `idx_table_fill_received_by` | `table_fill` |
| `idx_table_fill_requested_by` | `table_fill` |
| `idx_table_fill_table_id` | `table_fill` |
| `idx_table_credit_authorized_by` | `table_credit` |
| `idx_table_credit_received_by` | `table_credit` |
| `idx_table_credit_sent_by` | `table_credit` |
| `idx_table_credit_table_id` | `table_credit` |
| `idx_table_credit_status_casino` | `table_credit` |
| `idx_table_drop_event_casino_id` | `table_drop_event` |
| `idx_table_drop_event_removed_by` | `table_drop_event` |
| `idx_table_drop_event_table_id` | `table_drop_event` |
| `idx_table_drop_event_witnessed_by` | `table_drop_event` |
| `idx_drop_event_pending` | `table_drop_event` |
| `idx_floor_layout_approved_by` | `floor_layout` |
| `idx_floor_layout_created_by` | `floor_layout` |
| `idx_floor_layout_reviewed_by` | `floor_layout` |
| `idx_floor_layout_activation_activated_by` | `floor_layout_activation` |
| `idx_floor_layout_activation_layout_version_id` | `floor_layout_activation` |
| `idx_finance_outbox_ledger_id` | `finance_outbox` |
| `ix_slip_pause_slip_id` | `rating_slip_pause` |
| `idx_rating_slip_pause_casino_id` | `rating_slip_pause` |
| `idx_rating_slip_pause_created_by` | `rating_slip_pause` |
| `ix_loyalty_ledger_player_time` | `loyalty_ledger` |
| `ix_loyalty_ledger_pagination` | `loyalty_ledger` |
| `idx_loyalty_ledger_staff_id` | `loyalty_ledger` |
| `idx_loyalty_ledger_visit_id` | `loyalty_ledger` |
| `idx_loyalty_player_timeline` | `loyalty_ledger` |
| `idx_player_loyalty_casino_id` | `player_loyalty` |
| `ix_pit_cash_observation_visit_time` | `pit_cash_observation` |
| `ix_pit_cash_observation_player_time` | `pit_cash_observation` |
| `idx_promo_program_casino_id` | `promo_program` |
| `idx_promo_program_casino_status` | `promo_program` |
| `idx_promo_coupon_casino_id` | `promo_coupon` |
| `idx_promo_coupon_program_id` | `promo_coupon` |
| `idx_promo_coupon_player_id` | `promo_coupon` |
| `idx_promo_coupon_visit_id` | `promo_coupon` |
| `idx_promo_coupon_status_issued` | `promo_coupon` |
| `idx_promo_coupon_expiry` | `promo_coupon` |
| `idx_tbt_gaming_day` | `table_buyin_telemetry` |
| `idx_tbt_visit` | `table_buyin_telemetry` |
| `idx_tbt_kind` | `table_buyin_telemetry` |
| `idx_table_buyin_telemetry_casino_occurred` | `table_buyin_telemetry` |
| `idx_table_session_predecessor` | `table_session` |
| `ix_staff_pin_attempts_window_start` | `staff_pin_attempts` |
| `idx_import_batch_casino_status` | `import_batch` |
| `idx_import_row_batch_status` | `import_row` |
| `idx_rundown_report_gaming_day` | `table_rundown_report` |
| `idx_shift_checkpoint_latest` | `shift_checkpoint` |
| `ix_player_exclusion_active` | `player_exclusion` |
| `ix_player_exclusion_review` | `player_exclusion` |
| `ix_player_exclusion_jurisdiction` | `player_exclusion` |
| `idx_baseline_casino_day` | `table_metric_baseline` |
| `idx_alert_ack_alert_id` | `alert_acknowledgment` |
| `idx_toa_casino_id` | `table_opening_attestation` |
| `idx_mtl_audit_note_mtl_entry_id` | `mtl_audit_note` |
| `idx_mtl_audit_note_staff_id` | `mtl_audit_note` |
| `ix_mtl_audit_note_entry` | `mtl_audit_note` |
| `idx_floor_layout_version_created_by` | `floor_layout_version` |
| `ix_floor_table_slot_layout` | `floor_table_slot` |
| `idx_floor_table_slot_pit_id` | `floor_table_slot` |
| `idx_floor_table_slot_preferred_table_id` | `floor_table_slot` |
| `ix_floor_pit_layout` | `floor_pit` |
| `ix_fin_txn_player_time` | `player_financial_transaction` |
| `ix_fin_txn_casino_gaming_day` | `player_financial_transaction` |
| `ix_mtl_casino_time` | `mtl_entry` |
| `ix_floor_layout_casino` | `floor_layout` |
| `ix_floor_layout_activation_casino` | `floor_layout_activation` |
| `ix_finance_outbox_unprocessed` | `finance_outbox` |
| `ix_floor_layout_version_layout` | `floor_layout_version` |
| `ix_player_casino_by_casino` | `player_casino` |
| `ix_visit_active_by_player` | `visit` |
| `ix_visit_by_casino_date` | `visit` |
| `ix_visit_by_kind` | `visit` |
| `idx_rating_slip_table_seat_status` | `rating_slip` |
| `idx_sessions_started_at` | `context.sessions` |
| `idx_sessions_active` | `context.sessions` |
| `idx_session_events_created_at` | `context.session_events` |
| `ix_player_name_trgm` | `player` |
| `ix_player_names_lower` | `player` |
| `idx_audit_log_actor_id` | `audit_log` |
| `idx_audit_log_casino_id` | `audit_log` |
| `idx_staff_casino_id` | `staff` |
| `ix_player_casino_active` | `player_casino` |
| `idx_visit_group` | `visit` |
| `idx_visit_player_recent_closed` | `visit` |
| `idx_rating_slip_previous_slip_id` | `rating_slip` |
| `idx_rating_slip_move_group_id` | `rating_slip` |
| `idx_table_inventory_snapshot_casino_id` | `table_inventory_snapshot` |
| `idx_table_inventory_snapshot_counted_by` | `table_inventory_snapshot` |
| `ix_player_enrollment_match` | `player` |

</details>

**Remediation:** https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index  
**Caveat:** Many indexes are pre-production and will be hit once traffic starts. Do NOT blindly drop — verify against query plans.  
**Expert:** Performance Engineer

---

## Recommended Remediation Order (by impact)

### Priority 1 — Immediate (security + high-perf impact)

| ID | Issue | Count | Effort | Expert |
|----|-------|-------|--------|--------|
| **PERF-P1** | RLS InitPlan re-evaluation | 57 | Medium (batch migration) | `/rls-expert` + `/performance-engineer` |
| **SEC-S1** | SECURITY DEFINER view | 1 | Low | `/rls-expert` |
| **SEC-S3** | Mutable search_path | 35 | Medium (batch migration) | `/rls-expert` |
| **SEC-S8** | Vulnerable Postgres version | 1 | Low (dashboard) | DevOps |

### Priority 2 — Short-term (security hardening)

| ID | Issue | Count | Effort | Expert |
|----|-------|-------|--------|--------|
| **SEC-S2** | RLS enabled, no policies | 2 | Low | `/rls-expert` |
| **SEC-S5** | Materialized view in API | 1 | Low | `/rls-expert` |
| **SEC-S6** | Leaked password protection | 1 | Trivial (dashboard) | DevOps |
| **SEC-S7** | Insufficient MFA | 1 | Low (dashboard) | DevOps |
| **SEC-S4** | Extension in public schema | 1 | Low (migration) | DevOps |
| **PERF-P3** | Multiple permissive policies | 6 | Low | `/rls-expert` |

### Priority 3 — Planned (performance optimization)

| ID | Issue | Count | Effort | Expert |
|----|-------|-------|--------|--------|
| **PERF-P2** | Duplicate index | 1 | Trivial | DBA |
| **PERF-P4** | Unindexed foreign keys | 68 | Medium (selective) | `/performance-engineer` |
| **PERF-P5** | Unused indexes | 126 | High (needs traffic analysis) | `/performance-engineer` |

---

## Expert Dispatch Plan

### Track A: RLS Expert (`/rls-expert`)
- SEC-S1, SEC-S2, SEC-S3, SEC-S5, PERF-P1, PERF-P3
- **Key deliverable:** Single batch migration fixing search_path + InitPlan subselect wrapping

### Track B: DevOps (`/devops-pt2`)
- SEC-S4, SEC-S6, SEC-S7, SEC-S8
- **Key deliverable:** Dashboard config changes + pg_trgm schema migration + Postgres upgrade

### Track C: Performance Engineer (`/performance-engineer`)
- PERF-P2, PERF-P4, PERF-P5
- **Key deliverable:** Index audit with `pg_stat_user_indexes` cross-reference, selective add/drop migration

---

*Report generated from Supabase Database Linter via MCP. Raw data preserved in `/tmp/perf-advisors.json`.*
