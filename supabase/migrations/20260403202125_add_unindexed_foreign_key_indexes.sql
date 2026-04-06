-- ============================================================================
-- Migration: Add indexes on unindexed foreign keys
-- Created: 2026-04-03
-- Purpose: PERF-P4 from Supabase Advisor Report 2026-04-02
--          68 foreign keys lack indexes, causing slow JOINs and cascading deletes.
--          Creates single-column indexes on FK columns that are not already
--          covered as a leading column in an existing index.
--
-- Note: CONCURRENTLY removed - Supabase migrations run in transactions.
--       For large production tables, consider running these manually with
--       CONCURRENTLY via psql to avoid locking.
--
-- Skipped (already covered by existing indexes):
--   - player_casino.player_id       -> ix_player_casino_by_player (player_id)
--   - player_casino.casino_id (implicit) -> ix_player_casino_by_casino (casino_id)
--   - table_buyin_telemetry.visit_id -> idx_tbt_visit (casino_id, visit_id, ...)
--     Note: visit_id is NOT leading, but composite coverage is adequate for JOINs
-- ============================================================================

-- ============================================================================
-- 1. alert_acknowledgment
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_alert_ack_acknowledged_by
  ON public.alert_acknowledgment (acknowledged_by);

CREATE INDEX IF NOT EXISTS idx_alert_ack_casino_id
  ON public.alert_acknowledgment (casino_id);

-- ============================================================================
-- 2. casino_settings
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_casino_settings_setup_completed_by
  ON public.casino_settings (setup_completed_by);

-- ============================================================================
-- 3. game_settings_side_bet
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_game_settings_side_bet_casino_id
  ON public.game_settings_side_bet (casino_id);

-- ============================================================================
-- 4. gaming_table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_gaming_table_par_updated_by
  ON public.gaming_table (par_updated_by);

-- ============================================================================
-- 5. import_batch
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_import_batch_created_by_staff_id
  ON public.import_batch (created_by_staff_id);

-- ============================================================================
-- 6. import_row
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_import_row_casino_id
  ON public.import_row (casino_id);

CREATE INDEX IF NOT EXISTS idx_import_row_matched_player_id
  ON public.import_row (matched_player_id);

-- ============================================================================
-- 7. loyalty_outbox
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_loyalty_outbox_ledger_id
  ON public.loyalty_outbox (ledger_id);

-- ============================================================================
-- 8. loyalty_valuation_policy
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_loyalty_valuation_policy_created_by
  ON public.loyalty_valuation_policy (created_by_staff_id);

-- ============================================================================
-- 9. onboarding_registration
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_onboarding_registration_company_id
  ON public.onboarding_registration (company_id);

-- ============================================================================
-- 10. pit_cash_observation
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pit_cash_observation_created_by
  ON public.pit_cash_observation (created_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_pit_cash_observation_rating_slip_id
  ON public.pit_cash_observation (rating_slip_id);

-- ============================================================================
-- 11. player_casino
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_player_casino_enrolled_by
  ON public.player_casino (enrolled_by);

-- ============================================================================
-- 12. player_exclusion
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_player_exclusion_created_by
  ON public.player_exclusion (created_by);

CREATE INDEX IF NOT EXISTS idx_player_exclusion_lifted_by
  ON public.player_exclusion (lifted_by);

CREATE INDEX IF NOT EXISTS idx_player_exclusion_player_id
  ON public.player_exclusion (player_id);

-- ============================================================================
-- 13. player_identity
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_player_identity_created_by
  ON public.player_identity (created_by);

CREATE INDEX IF NOT EXISTS idx_player_identity_player_id
  ON public.player_identity (player_id);

CREATE INDEX IF NOT EXISTS idx_player_identity_updated_by
  ON public.player_identity (updated_by);

CREATE INDEX IF NOT EXISTS idx_player_identity_verified_by
  ON public.player_identity (verified_by);

-- ============================================================================
-- 14. player_note
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_player_note_casino_id
  ON public.player_note (casino_id);

CREATE INDEX IF NOT EXISTS idx_player_note_created_by
  ON public.player_note (created_by);

CREATE INDEX IF NOT EXISTS idx_player_note_player_id
  ON public.player_note (player_id);

-- ============================================================================
-- 15. player_tag
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_player_tag_applied_by
  ON public.player_tag (applied_by);

CREATE INDEX IF NOT EXISTS idx_player_tag_player_id
  ON public.player_tag (player_id);

CREATE INDEX IF NOT EXISTS idx_player_tag_removed_by
  ON public.player_tag (removed_by);

-- ============================================================================
-- 16. promo_coupon
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_promo_coupon_issued_by_staff_id
  ON public.promo_coupon (issued_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_promo_coupon_replaced_by_staff_id
  ON public.promo_coupon (replaced_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_promo_coupon_replacement_coupon_id
  ON public.promo_coupon (replacement_coupon_id);

CREATE INDEX IF NOT EXISTS idx_promo_coupon_voided_by_staff_id
  ON public.promo_coupon (voided_by_staff_id);

-- ============================================================================
-- 17. promo_program
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_promo_program_created_by_staff_id
  ON public.promo_program (created_by_staff_id);

-- ============================================================================
-- 18. reward_eligibility
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reward_eligibility_casino_id
  ON public.reward_eligibility (casino_id);

CREATE INDEX IF NOT EXISTS idx_reward_eligibility_reward_id
  ON public.reward_eligibility (reward_id);

-- ============================================================================
-- 19. reward_entitlement_tier
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reward_entitlement_tier_reward_id
  ON public.reward_entitlement_tier (reward_id);

-- ============================================================================
-- 20. reward_limits
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reward_limits_casino_id
  ON public.reward_limits (casino_id);

CREATE INDEX IF NOT EXISTS idx_reward_limits_reward_id
  ON public.reward_limits (reward_id);

-- ============================================================================
-- 21. reward_price_points
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reward_price_points_casino_id
  ON public.reward_price_points (casino_id);

-- ============================================================================
-- 22. shift_alert
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_shift_alert_table_id
  ON public.shift_alert (table_id);

-- ============================================================================
-- 23. shift_checkpoint
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_shift_checkpoint_created_by
  ON public.shift_checkpoint (created_by);

CREATE INDEX IF NOT EXISTS idx_shift_checkpoint_gaming_table_id
  ON public.shift_checkpoint (gaming_table_id);

-- ============================================================================
-- 24. staff_invite
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_staff_invite_created_by
  ON public.staff_invite (created_by);

-- ============================================================================
-- 25. staff_pin_attempts
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_staff_pin_attempts_staff_id
  ON public.staff_pin_attempts (staff_id);

-- ============================================================================
-- 26. table_buyin_telemetry
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tbt_actor_id
  ON public.table_buyin_telemetry (actor_id);

CREATE INDEX IF NOT EXISTS idx_tbt_rating_slip_id
  ON public.table_buyin_telemetry (rating_slip_id);

CREATE INDEX IF NOT EXISTS idx_tbt_table_id
  ON public.table_buyin_telemetry (table_id);

CREATE INDEX IF NOT EXISTS idx_tbt_visit_id
  ON public.table_buyin_telemetry (visit_id);

-- ============================================================================
-- 27. table_credit
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_credit_confirmed_by
  ON public.table_credit (confirmed_by);

-- ============================================================================
-- 28. table_drop_event
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_drop_event_cage_received_by
  ON public.table_drop_event (cage_received_by);

-- ============================================================================
-- 29. table_fill
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_fill_confirmed_by
  ON public.table_fill (confirmed_by);

-- ============================================================================
-- 30. table_metric_baseline
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_metric_baseline_computed_by
  ON public.table_metric_baseline (computed_by);

CREATE INDEX IF NOT EXISTS idx_table_metric_baseline_table_id
  ON public.table_metric_baseline (table_id);

-- ============================================================================
-- 31. table_opening_attestation
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_toa_attested_by
  ON public.table_opening_attestation (attested_by);

CREATE INDEX IF NOT EXISTS idx_toa_predecessor_snapshot_id
  ON public.table_opening_attestation (predecessor_snapshot_id);

-- ============================================================================
-- 32. table_rundown_report
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rundown_report_closing_snapshot_id
  ON public.table_rundown_report (closing_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_rundown_report_computed_by
  ON public.table_rundown_report (computed_by);

CREATE INDEX IF NOT EXISTS idx_rundown_report_drop_event_id
  ON public.table_rundown_report (drop_event_id);

CREATE INDEX IF NOT EXISTS idx_rundown_report_finalized_by
  ON public.table_rundown_report (finalized_by);

CREATE INDEX IF NOT EXISTS idx_rundown_report_gaming_table_id
  ON public.table_rundown_report (gaming_table_id);

CREATE INDEX IF NOT EXISTS idx_rundown_report_opening_snapshot_id
  ON public.table_rundown_report (opening_snapshot_id);

-- ============================================================================
-- 33. table_session
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_table_session_activated_by
  ON public.table_session (activated_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_closed_by
  ON public.table_session (closed_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_gaming_table_id
  ON public.table_session (gaming_table_id);

CREATE INDEX IF NOT EXISTS idx_table_session_opened_by
  ON public.table_session (opened_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_paused_by
  ON public.table_session (paused_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_resumed_by
  ON public.table_session (resumed_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_rolled_over_by
  ON public.table_session (rolled_over_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_table_session_rundown_started_by
  ON public.table_session (rundown_started_by_staff_id);
