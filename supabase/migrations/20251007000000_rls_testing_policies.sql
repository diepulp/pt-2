-- =====================================================================
-- RLS Testing & Development Policies
-- Purpose: Add permissive policies for service role and testing scenarios
-- =====================================================================
-- ⚠️  WARNING: DEVELOPMENT/TESTING ONLY - NOT FOR PRODUCTION
-- This migration adds permissive service_role policies to bypass RLS
-- for automated testing. Deploy with caution in production environments.
-- =====================================================================

-- === CORE TABLES =====================================================

-- Add service role bypass policies for all core tables
-- Service role is used in tests and server-side operations

DROP POLICY IF EXISTS "service_role_all_player" ON player;
CREATE POLICY "service_role_all_player"
  ON player
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_visit" ON visit;
CREATE POLICY "service_role_all_visit"
  ON visit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_ratingslip" ON ratingslip;
CREATE POLICY "service_role_all_ratingslip"
  ON ratingslip
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_casino" ON casino;
CREATE POLICY "service_role_all_casino"
  ON casino
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- === PLAYER FINANCIAL TRANSACTION ====================================

-- The "Service role can manage all transactions" policy already exists
-- in 20251006234748_create_player_financial_transaction.sql
-- No changes needed for player_financial_transaction

-- === NOTES ===========================================================

-- ▪ Service role policies allow unrestricted access for:
--   - Automated tests using service_role key
--   - Server-side operations requiring admin access
--   - Development and debugging scenarios
-- ▪ Existing staff_access_policy remains for authenticated users
-- ▪ Production deployments should use service_role key sparingly
-- ▪ Consider environment-specific policies for stricter production security
