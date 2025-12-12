-- Migration: ADR-015 Finance RLS Hybrid Upgrade
-- Description: Align player_financial_transaction policies with Pattern C (hybrid) and correct role gates
-- Reference: ADR-015, SEC-001, ISSUE-003
-- VERIFIED_SAFE

BEGIN;

-- Drop existing finance policies to avoid legacy role gates (pit_boss/admin)
DROP POLICY IF EXISTS player_financial_transaction_select ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_insert ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_update ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_delete ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_no_updates ON player_financial_transaction;
DROP POLICY IF EXISTS player_financial_transaction_no_deletes ON player_financial_transaction;

-- Ensure RLS is enabled
ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;

-- Read policy (hybrid, authenticated)
CREATE POLICY player_financial_transaction_select_same_casino
  ON player_financial_transaction
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)
  );

-- Insert policy (role-gated: cashier/admin, hybrid actor + casino)
CREATE POLICY player_financial_transaction_insert_cashier
  ON player_financial_transaction
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE id = COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid)
      AND role IN ('cashier', 'admin')
      AND status = 'active'
      AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)
    )
    AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)
  );

-- Append-only guard: no updates
CREATE POLICY player_financial_transaction_no_updates
  ON player_financial_transaction
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

-- Append-only guard: no deletes
CREATE POLICY player_financial_transaction_no_deletes
  ON player_financial_transaction
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

COMMIT;
