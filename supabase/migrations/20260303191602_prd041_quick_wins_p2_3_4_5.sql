-- EXEC-041 WS1: Quick Wins Migration (P2-3, P2-4, P2-5)
-- PRD-041: ADR-024 P2 Validate-to-Derive Remediation
--
-- P2-3: REVOKE chipset_total_cents from anon
-- P2-4: Normalize 8 denial policies with auth.uid() IS NOT NULL
-- P2-5: Add WITH CHECK to player_tag UPDATE policy

BEGIN;

-- ============================================================================
-- P2-3: REVOKE chipset_total_cents from anon
-- Source: 20260114003537_chipset_total_cents_helper.sql (line 102 grants anon)
-- ============================================================================

REVOKE ALL ON FUNCTION chipset_total_cents(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION chipset_total_cents(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO service_role;

-- ============================================================================
-- P2-4: Normalize 8 denial policies
-- Replace bare USING (false) with USING (auth.uid() IS NOT NULL AND false)
-- ============================================================================

-- 1. loyalty_ledger_deny_update
DROP POLICY IF EXISTS loyalty_ledger_deny_update ON loyalty_ledger;
CREATE POLICY loyalty_ledger_deny_update ON loyalty_ledger
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

-- 2. loyalty_ledger_deny_delete
DROP POLICY IF EXISTS loyalty_ledger_deny_delete ON loyalty_ledger;
CREATE POLICY loyalty_ledger_deny_delete ON loyalty_ledger
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 3. player_identity_no_delete
DROP POLICY IF EXISTS player_identity_no_delete ON player_identity;
CREATE POLICY player_identity_no_delete ON player_identity
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 4. promo_program_no_delete
DROP POLICY IF EXISTS promo_program_no_delete ON promo_program;
CREATE POLICY promo_program_no_delete ON promo_program
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 5. promo_coupon_no_delete
DROP POLICY IF EXISTS promo_coupon_no_delete ON promo_coupon;
CREATE POLICY promo_coupon_no_delete ON promo_coupon
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 6. player_note_deny_update
DROP POLICY IF EXISTS player_note_deny_update ON player_note;
CREATE POLICY player_note_deny_update ON player_note
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

-- 7. player_note_deny_delete
DROP POLICY IF EXISTS player_note_deny_delete ON player_note;
CREATE POLICY player_note_deny_delete ON player_note
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 8. player_tag_deny_delete
DROP POLICY IF EXISTS player_tag_deny_delete ON player_tag;
CREATE POLICY player_tag_deny_delete ON player_tag
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- ============================================================================
-- P2-5: Add WITH CHECK to player_tag UPDATE policy
-- Source USING clause: 20260121145502_adr029_player_tag_table.sql (lines 89-100)
-- ============================================================================

DROP POLICY IF EXISTS player_tag_update ON player_tag;
CREATE POLICY player_tag_update ON player_tag
  FOR UPDATE USING (
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
    casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
