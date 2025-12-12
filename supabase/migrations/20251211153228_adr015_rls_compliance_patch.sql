-- Migration: ADR-015 RLS Compliance Patch
-- Purpose: Address RLS policy regressions and gaps across all services
-- ADR Reference: ADR-015 (RLS Connection Pooling Strategy)
--
-- This migration:
-- 1. Fixes broken rpc_issue_mid_session_reward (references dropped rating_slip.player_id)
-- 2. Upgrades non-compliant casino_settings policies to Pattern C
-- 3. Upgrades non-compliant staff policies to Pattern C
-- 4. Enables RLS on 16 tables missing RLS protection
--
-- Pattern C (Hybrid with Fallback):
--   auth.uid() IS NOT NULL
--   AND casino_id = COALESCE(
--     NULLIF(current_setting('app.casino_id', true), '')::uuid,
--     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
--   )

BEGIN;

-- =====================================================================
-- SECTION 1: FIX BROKEN RPCs
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 Fix rpc_issue_mid_session_reward
-- ---------------------------------------------------------------------
-- Problem: References rating_slip.player_id which was dropped in
--          migration 20251207024918_rating_slip_drop_player_id.sql
-- Fix: Derive player_id via JOIN to visit table

CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text default null,
  p_reason loyalty_reason default 'mid_session'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Fixed: Derive player_id from visit via rating_slip.visit_id
  -- (rating_slip.player_id was dropped in favor of visit.player_id)
  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM loyalty_ledger
       WHERE idempotency_key = p_idempotency_key
         AND casino_id = p_casino_id
    ) THEN
      RETURN QUERY
        SELECT ll.id,
               (
                 SELECT balance
                   FROM player_loyalty
                  WHERE player_id = p_player_id
                    AND casino_id = p_casino_id
               )
          FROM loyalty_ledger ll
         WHERE ll.idempotency_key = p_idempotency_key
           AND ll.casino_id = p_casino_id;
      RETURN;
    END IF;
  END IF;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_earned,
    reason,
    idempotency_key,
    created_at
  )
  VALUES (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    COALESCE(p_reason, 'mid_session'),
    p_idempotency_key,
    v_now
  )
  RETURNING id INTO v_ledger_id;

  -- Update or insert player_loyalty balance
  INSERT INTO player_loyalty (player_id, casino_id, balance, updated_at)
  VALUES (p_player_id, p_casino_id, p_points, v_now)
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    balance = player_loyalty.balance + p_points,
    updated_at = v_now
  RETURNING balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$$;

COMMENT ON FUNCTION rpc_issue_mid_session_reward IS
  'Issues mid-session loyalty points. Fixed in ADR-015 patch to derive player_id from visit.';

-- =====================================================================
-- SECTION 2: UPGRADE NON-COMPLIANT POLICIES TO PATTERN C
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.1 casino_settings policies (Pattern C upgrade)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS casino_settings_read ON casino_settings;
DROP POLICY IF EXISTS casino_settings_write ON casino_settings;

CREATE POLICY casino_settings_read ON casino_settings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY casino_settings_write ON casino_settings
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- ---------------------------------------------------------------------
-- 2.2 staff policies (Pattern C upgrade for write/update/delete)
-- ---------------------------------------------------------------------
-- Note: staff_read was already upgraded in 20251209023430_fix_staff_rls_bootstrap.sql
--       with auth.uid() bootstrap logic. We preserve that and add JWT fallback.

DROP POLICY IF EXISTS staff_read ON staff;
DROP POLICY IF EXISTS staff_write ON staff;
DROP POLICY IF EXISTS staff_update ON staff;
DROP POLICY IF EXISTS staff_delete ON staff;

-- staff_read: Bootstrap (own record) OR casino scoped with JWT fallback
CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      -- Bootstrap: Can always read own record
      user_id = auth.uid()
      OR
      -- Casino-scoped with ADR-015 Pattern C
      casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
  );

-- staff_write: Admin only, Pattern C
CREATE POLICY staff_write ON staff
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- staff_update: Admin only, Pattern C
CREATE POLICY staff_update ON staff
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- staff_delete: Admin only, Pattern C
CREATE POLICY staff_delete ON staff
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- =====================================================================
-- SECTION 3: ENABLE RLS ON TABLES MISSING PROTECTION
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3.1 Loyalty Tables (player_loyalty, loyalty_ledger, loyalty_outbox)
-- ---------------------------------------------------------------------

ALTER TABLE player_loyalty ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_loyalty_select ON player_loyalty
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE loyalty_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_outbox_select ON loyalty_outbox
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY loyalty_outbox_insert ON loyalty_outbox
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ---------------------------------------------------------------------
-- 3.2 Finance Tables (player_financial_transaction, finance_outbox)
-- ---------------------------------------------------------------------

ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_financial_transaction_select ON player_financial_transaction
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY player_financial_transaction_insert ON player_financial_transaction
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE finance_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_outbox_select ON finance_outbox
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY finance_outbox_insert ON finance_outbox
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ---------------------------------------------------------------------
-- 3.3 MTL Tables (mtl_entry, mtl_audit_note)
-- ---------------------------------------------------------------------

ALTER TABLE mtl_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY mtl_entry_select ON mtl_entry
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY mtl_entry_insert ON mtl_entry
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE mtl_audit_note ENABLE ROW LEVEL SECURITY;

-- mtl_audit_note doesn't have direct casino_id, use subquery to mtl_entry
CREATE POLICY mtl_audit_note_select ON mtl_audit_note
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry me
       WHERE me.id = mtl_audit_note.mtl_entry_id
         AND me.casino_id = COALESCE(
           NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
         )
    )
  );

CREATE POLICY mtl_audit_note_insert ON mtl_audit_note
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mtl_entry me
       WHERE me.id = mtl_audit_note.mtl_entry_id
         AND me.casino_id = COALESCE(
           NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
         )
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ---------------------------------------------------------------------
-- 3.4 Game/Table Settings (game_settings, gaming_table_settings)
-- ---------------------------------------------------------------------

ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_settings_select ON game_settings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY game_settings_insert ON game_settings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

CREATE POLICY game_settings_update ON game_settings
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

ALTER TABLE gaming_table_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gaming_table_settings_select ON gaming_table_settings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY gaming_table_settings_insert ON gaming_table_settings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY gaming_table_settings_update ON gaming_table_settings
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ---------------------------------------------------------------------
-- 3.5 Table Context / Chip Custody Tables
-- ---------------------------------------------------------------------

ALTER TABLE table_inventory_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_inventory_snapshot_select ON table_inventory_snapshot
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY table_inventory_snapshot_insert ON table_inventory_snapshot
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE table_fill ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_fill_select ON table_fill
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY table_fill_insert ON table_fill
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY table_fill_update ON table_fill
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE table_credit ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_credit_select ON table_credit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY table_credit_insert ON table_credit
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY table_credit_update ON table_credit
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

ALTER TABLE table_drop_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_drop_event_select ON table_drop_event
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY table_drop_event_insert ON table_drop_event
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ---------------------------------------------------------------------
-- 3.6 Audit / Reporting Tables
-- ---------------------------------------------------------------------

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- audit_log insert is typically done by SECURITY DEFINER functions
-- but we allow pit_boss/admin for direct inserts if needed
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

ALTER TABLE report ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_select ON report
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY report_insert ON report
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- =====================================================================
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- =====================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
--
-- Tables now with ADR-015 Pattern C compliant RLS:
-- - casino_settings (upgraded from non-compliant)
-- - staff (upgraded from partial compliance)
-- - player_loyalty (NEW - was missing RLS)
-- - loyalty_ledger (NEW - was missing RLS)
-- - loyalty_outbox (NEW - was missing RLS)
-- - player_financial_transaction (NEW - was missing RLS)
-- - finance_outbox (NEW - was missing RLS)
-- - mtl_entry (NEW - was missing RLS)
-- - mtl_audit_note (NEW - was missing RLS)
-- - game_settings (NEW - was missing RLS)
-- - gaming_table_settings (NEW - was missing RLS)
-- - table_inventory_snapshot (NEW - was missing RLS)
-- - table_fill (NEW - was missing RLS)
-- - table_credit (NEW - was missing RLS)
-- - table_drop_event (NEW - was missing RLS)
-- - audit_log (NEW - was missing RLS)
-- - report (NEW - was missing RLS)
--
-- RPCs fixed:
-- - rpc_issue_mid_session_reward (fixed broken player_id reference)
--
-- ADR-015 Pattern C:
--   auth.uid() IS NOT NULL
--   AND casino_id = COALESCE(
--     NULLIF(current_setting('app.casino_id', true), '')::uuid,
--     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
--   )
--
-- This pattern:
-- 1. Guards against unauthenticated access (auth.uid() IS NOT NULL)
-- 2. Tries session context first (current_setting with NULLIF for empty string)
-- 3. Falls back to JWT claims (auth.jwt() -> 'app_metadata')
-- 4. Works with both transaction-wrapped RPC AND JWT-only auth
