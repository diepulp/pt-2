-- ============================================================================
-- Migration: Fix SEC-S3 — Set search_path on 35 functions
-- Created: 2026-04-03
-- Source: SUPABASE-ADVISOR-REPORT-2026-04-02.md (SEC-S3)
-- ============================================================================
-- Functions without explicit search_path are vulnerable to search-path
-- hijacking (CWE-426). Using ALTER FUNCTION ... SET search_path = ''
-- forces all object references to be schema-qualified.
--
-- Uses ALTER FUNCTION (not CREATE OR REPLACE) to avoid redefining function
-- bodies. This is a metadata-only change.
-- ============================================================================

-- 1. set_fin_txn_gaming_day()
ALTER FUNCTION public.set_fin_txn_gaming_day()
  SET search_path = '';

-- 2. assert_table_context_casino()
ALTER FUNCTION public.assert_table_context_casino()
  SET search_path = '';

-- 3. evaluate_mid_session_reward_policy(numeric, integer, jsonb)
ALTER FUNCTION public.evaluate_mid_session_reward_policy(numeric, integer, jsonb)
  SET search_path = '';

-- 4. update_game_settings_updated_at()
ALTER FUNCTION public.update_game_settings_updated_at()
  SET search_path = '';

-- 5. compute_gaming_day(timestamptz, interval) — Layer 2 pure function
ALTER FUNCTION public.compute_gaming_day(timestamptz, interval)
  SET search_path = '';

-- 6. compute_gaming_day(uuid, timestamptz) — Layer 2 casino-lookup overload
ALTER FUNCTION public.compute_gaming_day(uuid, timestamptz)
  SET search_path = '';

-- 7. calculate_theo_from_snapshot(record, jsonb)
ALTER FUNCTION public.calculate_theo_from_snapshot(record, jsonb)
  SET search_path = '';

-- 8. evaluate_session_reward_suggestion(uuid, timestamptz)
ALTER FUNCTION public.evaluate_session_reward_suggestion(uuid, timestamptz)
  SET search_path = '';

-- 9. compute_slip_final_seconds(uuid)
ALTER FUNCTION public.compute_slip_final_seconds(uuid)
  SET search_path = '';

-- 10. trg_visit_set_group_id()
ALTER FUNCTION public.trg_visit_set_group_id()
  SET search_path = '';

-- 11. update_player_identity_updated_at()
ALTER FUNCTION public.update_player_identity_updated_at()
  SET search_path = '';

-- 12. rpc_get_visit_live_view(uuid, boolean, integer)
ALTER FUNCTION public.rpc_get_visit_live_view(uuid, boolean, integer)
  SET search_path = '';

-- 13. trg_mtl_immutable()
ALTER FUNCTION public.trg_mtl_immutable()
  SET search_path = '';

-- 14. trg_pit_cash_observation_set_gaming_day()
ALTER FUNCTION public.trg_pit_cash_observation_set_gaming_day()
  SET search_path = '';

-- 15. trg_pit_cash_observation_immutable()
ALTER FUNCTION public.trg_pit_cash_observation_immutable()
  SET search_path = '';

-- 16. trg_mtl_entry_set_gaming_day()
ALTER FUNCTION public.trg_mtl_entry_set_gaming_day()
  SET search_path = '';

-- 17. trg_promo_program_updated_at()
ALTER FUNCTION public.trg_promo_program_updated_at()
  SET search_path = '';

-- 18. set_table_session_gaming_day()
ALTER FUNCTION public.set_table_session_gaming_day()
  SET search_path = '';

-- 19. update_table_session_updated_at()
ALTER FUNCTION public.update_table_session_updated_at()
  SET search_path = '';

-- 20. set_visit_gaming_day()
ALTER FUNCTION public.set_visit_gaming_day()
  SET search_path = '';

-- 21. guard_stale_gaming_day_write()
ALTER FUNCTION public.guard_stale_gaming_day_write()
  SET search_path = '';

-- 22. rpc_shift_active_visitors_summary()
ALTER FUNCTION public.rpc_shift_active_visitors_summary()
  SET search_path = '';

-- 23. trg_reward_catalog_updated_at()
ALTER FUNCTION public.trg_reward_catalog_updated_at()
  SET search_path = '';

-- 24. trg_loyalty_earn_config_updated_at()
ALTER FUNCTION public.trg_loyalty_earn_config_updated_at()
  SET search_path = '';

-- 25. set_game_settings_side_bet_casino_id()
ALTER FUNCTION public.set_game_settings_side_bet_casino_id()
  SET search_path = '';

-- 26. update_game_settings_side_bet_updated_at()
ALTER FUNCTION public.update_game_settings_side_bet_updated_at()
  SET search_path = '';

-- 27. trg_gaming_table_game_settings_tenant_check()
ALTER FUNCTION public.trg_gaming_table_game_settings_tenant_check()
  SET search_path = '';

-- 28. set_import_batch_updated_at()
ALTER FUNCTION public.set_import_batch_updated_at()
  SET search_path = '';

-- 29. rpc_get_rating_slip_duration(uuid, timestamptz)
ALTER FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz)
  SET search_path = '';

-- 30. rpc_get_dashboard_stats()
ALTER FUNCTION public.rpc_get_dashboard_stats()
  SET search_path = '';

-- 31. rpc_list_active_players_casino_wide(int, text)
ALTER FUNCTION public.rpc_list_active_players_casino_wide(int, text)
  SET search_path = '';

-- 32. rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)
ALTER FUNCTION public.rpc_list_closed_slips_for_gaming_day(date, int, timestamptz, uuid)
  SET search_path = '';

-- 33. chipset_total_cents(jsonb)
ALTER FUNCTION public.chipset_total_cents(jsonb)
  SET search_path = '';

-- 34. trg_player_exclusion_lift_only()
ALTER FUNCTION public.trg_player_exclusion_lift_only()
  SET search_path = '';

-- 35. is_exclusion_active(public.player_exclusion)
ALTER FUNCTION public.is_exclusion_active(public.player_exclusion)
  SET search_path = '';

-- 36. get_player_exclusion_status(uuid, uuid)
ALTER FUNCTION public.get_player_exclusion_status(uuid, uuid)
  SET search_path = '';

NOTIFY pgrst, 'reload schema';
