-- ============================================================================
-- Migration: Fix PERF-P1 — RLS InitPlan re-evaluation (57 policies, 27 tables)
-- Created: 2026-04-03
-- Source: SUPABASE-ADVISOR-REPORT-2026-04-02.md (PERF-P1)
-- Markers: ADR-015, RLS_REVIEW_COMPLETE
-- ============================================================================
-- Without subselect wrapping, current_setting() and auth.*() calls inside
-- RLS policies are re-evaluated per-row. Wrapping in (SELECT ...) allows
-- Postgres to cache the result as an InitPlan (evaluated once per query).
--
-- Pattern:
--   Before: current_setting('app.casino_id', true)
--   After:  (SELECT current_setting('app.casino_id', true))
--
-- Each policy is DROP'd then recreated with the subselect-wrapped expressions.
-- Policy semantics are identical — this is a performance-only change.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. mtl_entry (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS mtl_entry_select ON mtl_entry;
CREATE POLICY mtl_entry_select ON mtl_entry
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

DROP POLICY IF EXISTS mtl_entry_insert ON mtl_entry;
CREATE POLICY mtl_entry_insert ON mtl_entry
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

-- ============================================================================
-- 2. mtl_audit_note (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS mtl_audit_note_select ON mtl_audit_note;
CREATE POLICY mtl_audit_note_select ON mtl_audit_note
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry e
      WHERE e.id = mtl_audit_note.mtl_entry_id
      AND e.casino_id = COALESCE(
        NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS mtl_audit_note_insert ON mtl_audit_note;
CREATE POLICY mtl_audit_note_insert ON mtl_audit_note
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry e
      WHERE e.id = mtl_audit_note.mtl_entry_id
      AND e.casino_id = COALESCE(
        NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ============================================================================
-- 3. pit_cash_observation (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS pit_cash_observation_select ON pit_cash_observation;
CREATE POLICY pit_cash_observation_select ON pit_cash_observation
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role'
    ) IN ('pit_boss', 'cashier', 'admin')
  );

DROP POLICY IF EXISTS pit_cash_observation_insert ON pit_cash_observation;
CREATE POLICY pit_cash_observation_insert ON pit_cash_observation
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role'
    ) IN ('pit_boss', 'cashier', 'admin')
    AND created_by_staff_id = COALESCE(
      NULLIF((SELECT current_setting('app.actor_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
    )
  );

DROP POLICY IF EXISTS pit_cash_observation_no_update ON pit_cash_observation;
CREATE POLICY pit_cash_observation_no_update ON pit_cash_observation
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS pit_cash_observation_no_delete ON pit_cash_observation;
CREATE POLICY pit_cash_observation_no_delete ON pit_cash_observation
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 4. promo_program (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS promo_program_select_same_casino ON promo_program;
CREATE POLICY promo_program_select_same_casino ON promo_program
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS promo_program_insert_staff ON promo_program;
CREATE POLICY promo_program_insert_staff ON promo_program
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS promo_program_no_delete ON promo_program;
CREATE POLICY promo_program_no_delete ON promo_program
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 5. promo_coupon (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS promo_coupon_select_same_casino ON promo_coupon;
CREATE POLICY promo_coupon_select_same_casino ON promo_coupon
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS promo_coupon_insert_staff ON promo_coupon;
CREATE POLICY promo_coupon_insert_staff ON promo_coupon
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS promo_coupon_no_delete ON promo_coupon;
CREATE POLICY promo_coupon_no_delete ON promo_coupon
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 6. table_buyin_telemetry (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "table_buyin_telemetry_select_same_casino" ON table_buyin_telemetry;
CREATE POLICY "table_buyin_telemetry_select_same_casino" ON table_buyin_telemetry
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 7. table_session (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS "table_session_select_policy" ON table_session;
CREATE POLICY "table_session_select_policy" ON table_session
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS "table_session_insert_deny" ON table_session;
CREATE POLICY "table_session_insert_deny" ON table_session
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS "table_session_update_deny" ON table_session;
CREATE POLICY "table_session_update_deny" ON table_session
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND false)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS "table_session_delete_deny" ON table_session;
CREATE POLICY "table_session_delete_deny" ON table_session
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 8. shift_alert (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS shift_alert_select_casino_scope ON shift_alert;
CREATE POLICY shift_alert_select_casino_scope ON shift_alert
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 9. alert_acknowledgment (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS alert_ack_select_casino_scope ON alert_acknowledgment;
CREATE POLICY alert_ack_select_casino_scope ON alert_acknowledgment
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 10. table_opening_attestation (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "attestation_select_own_casino" ON table_opening_attestation;
CREATE POLICY "attestation_select_own_casino" ON table_opening_attestation
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 11. loyalty_outbox (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS loyalty_outbox_select ON loyalty_outbox;
CREATE POLICY loyalty_outbox_select ON loyalty_outbox
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS loyalty_outbox_insert ON loyalty_outbox;
CREATE POLICY loyalty_outbox_insert ON loyalty_outbox
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS loyalty_outbox_no_updates ON loyalty_outbox;
CREATE POLICY loyalty_outbox_no_updates ON loyalty_outbox
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS loyalty_outbox_no_deletes ON loyalty_outbox;
CREATE POLICY loyalty_outbox_no_deletes ON loyalty_outbox
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 12. onboarding_registration (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "onboarding_registration_select_own_pending" ON onboarding_registration;
CREATE POLICY "onboarding_registration_select_own_pending" ON onboarding_registration
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND user_id = (SELECT auth.uid())
    AND status = 'pending'
  );

-- ============================================================================
-- 13. staff_invite (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS staff_invite_select_admin_session ON staff_invite;
CREATE POLICY staff_invite_select_admin_session ON staff_invite
  FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((SELECT current_setting('app.staff_role', true)), '') = 'admin'
  );

DROP POLICY IF EXISTS staff_invite_insert_admin_session ON staff_invite;
CREATE POLICY staff_invite_insert_admin_session ON staff_invite
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((SELECT current_setting('app.staff_role', true)), '') = 'admin'
  );

DROP POLICY IF EXISTS staff_invite_update_admin_session ON staff_invite;
CREATE POLICY staff_invite_update_admin_session ON staff_invite
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((SELECT current_setting('app.staff_role', true)), '') = 'admin'
  )
  WITH CHECK (
    casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
  );

-- ============================================================================
-- 14. staff (1 policy — update_own_pin; staff_update already uses subselects)
-- ============================================================================

DROP POLICY IF EXISTS staff_update_own_pin ON staff;
CREATE POLICY staff_update_own_pin ON staff
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) = user_id
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND status = 'active'
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) = user_id
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
  );

COMMENT ON POLICY staff_update_own_pin ON staff IS
  'Allow staff to update their own row (pin_hash only via column-level grant). ADR-030 D4 Template 2b.';

-- ============================================================================
-- 15. gaming_table (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS gaming_table_insert_admin ON gaming_table;
CREATE POLICY gaming_table_insert_admin ON gaming_table
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS gaming_table_update_admin ON gaming_table;
CREATE POLICY gaming_table_update_admin ON gaming_table
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ============================================================================
-- 16. game_settings_side_bet (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS side_bet_select ON game_settings_side_bet;
CREATE POLICY side_bet_select ON game_settings_side_bet
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt())->'app_metadata'->>'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS side_bet_insert ON game_settings_side_bet;
CREATE POLICY side_bet_insert ON game_settings_side_bet
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt())->'app_metadata'->>'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      (SELECT auth.jwt())->'app_metadata'->>'staff_role'
    ) = 'admin'
  );

DROP POLICY IF EXISTS side_bet_update ON game_settings_side_bet;
CREATE POLICY side_bet_update ON game_settings_side_bet
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt())->'app_metadata'->>'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      (SELECT auth.jwt())->'app_metadata'->>'staff_role'
    ) = 'admin'
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt())->'app_metadata'->>'casino_id')::uuid
    )
  );

-- ============================================================================
-- 17. table_rundown_report (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "rundown_report_select" ON table_rundown_report;
CREATE POLICY "rundown_report_select" ON table_rundown_report
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 18. shift_checkpoint (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "shift_checkpoint_select" ON shift_checkpoint;
CREATE POLICY "shift_checkpoint_select" ON shift_checkpoint
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 19. loyalty_ledger (2 denial policies)
-- ============================================================================

DROP POLICY IF EXISTS loyalty_ledger_deny_update ON loyalty_ledger;
CREATE POLICY loyalty_ledger_deny_update ON loyalty_ledger
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS loyalty_ledger_deny_delete ON loyalty_ledger;
CREATE POLICY loyalty_ledger_deny_delete ON loyalty_ledger
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 20. player_identity (1 denial policy)
-- ============================================================================

DROP POLICY IF EXISTS player_identity_no_delete ON player_identity;
CREATE POLICY player_identity_no_delete ON player_identity
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 21. player_note (2 denial policies)
-- ============================================================================

DROP POLICY IF EXISTS player_note_deny_update ON player_note;
CREATE POLICY player_note_deny_update ON player_note
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL AND false);

DROP POLICY IF EXISTS player_note_deny_delete ON player_note;
CREATE POLICY player_note_deny_delete ON player_note
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 22. player_tag (1 denial policy)
-- ============================================================================

DROP POLICY IF EXISTS player_tag_deny_delete ON player_tag;
CREATE POLICY player_tag_deny_delete ON player_tag
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- 23. loyalty_valuation_policy (3 policies)
-- Note: Uses request.jwt.claims pattern (different from auth.jwt())
-- ============================================================================

DROP POLICY IF EXISTS "loyalty_valuation_policy_select_casino_scoped" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_select_casino_scoped"
  ON loyalty_valuation_policy
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS "loyalty_valuation_policy_insert_admin" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_insert_admin"
  ON loyalty_valuation_policy
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND (SELECT current_setting('app.staff_role', true)) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS "loyalty_valuation_policy_update_admin" ON loyalty_valuation_policy;
CREATE POLICY "loyalty_valuation_policy_update_admin"
  ON loyalty_valuation_policy
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND (SELECT current_setting('app.staff_role', true)) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND (SELECT current_setting('app.staff_role', true)) IN ('pit_boss', 'admin')
  );

-- ============================================================================
-- 24. loyalty_liability_snapshot (1 policy)
-- ============================================================================

DROP POLICY IF EXISTS "loyalty_liability_snapshot_select_casino_scoped" ON loyalty_liability_snapshot;
CREATE POLICY "loyalty_liability_snapshot_select_casino_scoped"
  ON loyalty_liability_snapshot
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- 25. player_exclusion (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS player_exclusion_select_casino ON player_exclusion;
CREATE POLICY player_exclusion_select_casino ON player_exclusion
  FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS player_exclusion_insert_role ON player_exclusion;
CREATE POLICY player_exclusion_insert_role ON player_exclusion
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS player_exclusion_update_admin ON player_exclusion;
CREATE POLICY player_exclusion_update_admin ON player_exclusion
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- ============================================================================
-- 26. player (1 denial policy)
-- ============================================================================

DROP POLICY IF EXISTS "player_no_delete" ON player;
CREATE POLICY "player_no_delete" ON player
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

COMMENT ON POLICY "player_no_delete" ON player IS
  'Hard deletes denied (audit trail preservation per ADR-022)';

-- ============================================================================
-- 27. player_casino (1 denial policy)
-- ============================================================================

DROP POLICY IF EXISTS "player_casino_no_delete" ON player_casino;
CREATE POLICY "player_casino_no_delete" ON player_casino
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

COMMENT ON POLICY "player_casino_no_delete" ON player_casino IS
  'Hard deletes denied (enrollment ledger per ADR-022, use status=inactive for soft delete)';

-- ============================================================================
-- 28. table_metric_baseline (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS baseline_select_casino_scope ON table_metric_baseline;
CREATE POLICY baseline_select_casino_scope ON table_metric_baseline
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS baseline_insert_casino_scope ON table_metric_baseline;
CREATE POLICY baseline_insert_casino_scope ON table_metric_baseline
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS baseline_update_casino_scope ON table_metric_baseline;
CREATE POLICY baseline_update_casino_scope ON table_metric_baseline
  FOR UPDATE USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

DROP POLICY IF EXISTS baseline_no_deletes ON table_metric_baseline;
CREATE POLICY baseline_no_deletes ON table_metric_baseline
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND false);

COMMIT;

NOTIFY pgrst, 'reload schema';
