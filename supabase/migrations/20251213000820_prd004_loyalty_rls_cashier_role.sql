-- ═══════════════════════════════════════════════════════════════════════════
-- PRD-004: Add cashier role to LoyaltyService RLS policies
--
-- Reference: PRD-004 FR-17 (comp issuance requires pit_boss, cashier, admin)
-- Reference: docs/20-architecture/specs/PRD-004/RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md
-- Pattern: ADR-015 Pattern C (Hybrid context + JWT fallback)
-- Status: Proposed
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SUMMARY:
-- Cashiers need ability to issue comp redemptions (debits) and initialize
-- player loyalty records on first transaction. This migration adds 'cashier'
-- to the role gates in loyalty_ledger and player_loyalty RLS policies.
--
-- SECURITY MODEL:
-- - Cashiers can: redeem points, initialize balances, read ledger/balances
-- - Cashiers cannot: approve overdraw, issue manual credits, adjust/reverse
-- - Role enforcement: RLS policies + explicit RPC validation (defense-in-depth)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: loyalty_ledger - Add cashier role to insert policy
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger;

CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    -- Verify role (pit_boss, admin, or cashier)
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

COMMENT ON POLICY loyalty_ledger_insert ON loyalty_ledger IS
  'ADR-015 Pattern C: Allow ledger inserts for pit_boss, admin, cashier (PRD-004). Cashier role added 2025-12-13 per FR-17 (comp issuance).';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: player_loyalty - Add cashier role to insert/update policies
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty;

CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    -- Verify role (pit_boss, admin, or cashier)
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

COMMENT ON POLICY player_loyalty_insert ON player_loyalty IS
  'ADR-015 Pattern C: Allow balance initialization for pit_boss, admin, cashier (PRD-004). Cashier role added 2025-12-13 for first-transaction upsert.';

DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty;

CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    -- Verify role (pit_boss, admin, or cashier)
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

COMMENT ON POLICY player_loyalty_update ON player_loyalty IS
  'ADR-015 Pattern C: Allow balance updates for pit_boss, admin, cashier (PRD-004). Cashier role added 2025-12-13 for redemption balance updates.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Verify policies exist with correct roles:
-- SELECT policyname, cmd, qual::text
-- FROM pg_policies
-- WHERE tablename IN ('loyalty_ledger', 'player_loyalty')
-- ORDER BY tablename, policyname;
--
-- Expected: All policies show role IN ('pit_boss', 'admin', 'cashier')
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Test cashier can insert ledger entry (requires valid context):
--
-- SELECT set_rls_context(
--   p_actor_id := '<cashier-staff-id>',
--   p_casino_id := '<casino-id>',
--   p_staff_role := 'cashier',
--   p_correlation_id := 'test-cashier-ledger-insert'
-- );
--
-- INSERT INTO loyalty_ledger (casino_id, player_id, points_earned, reason, metadata)
-- VALUES ('<casino-id>', '<player-id>', -500, 'mid_session', '{"test": true}'::jsonb)
-- RETURNING id;
--
-- Expected: Success (returns ledger entry ID)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Test dealer cannot insert (should fail):
--
-- SELECT set_rls_context(
--   p_actor_id := '<dealer-staff-id>',
--   p_casino_id := '<casino-id>',
--   p_staff_role := 'dealer',
--   p_correlation_id := 'test-dealer-ledger-insert'
-- );
--
-- INSERT INTO loyalty_ledger (casino_id, player_id, points_earned, reason, metadata)
-- VALUES ('<casino-id>', '<player-id>', 100, 'mid_session', '{"test": true}'::jsonb);
--
-- Expected: ERROR: new row violates row-level security policy
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Test cashier can update player_loyalty balance:
--
-- SELECT set_rls_context(
--   p_actor_id := '<cashier-staff-id>',
--   p_casino_id := '<casino-id>',
--   p_staff_role := 'cashier',
--   p_correlation_id := 'test-cashier-balance-update'
-- );
--
-- UPDATE player_loyalty
-- SET current_balance = current_balance - 500,
--     updated_at = now()
-- WHERE player_id = '<player-id>' AND casino_id = '<casino-id>'
-- RETURNING current_balance;
--
-- Expected: Success (returns updated balance)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Test cross-casino isolation (cashier cannot access other casino):
--
-- SELECT set_rls_context(
--   p_actor_id := '<cashier-staff-id>',
--   p_casino_id := '<casino-a-id>',
--   p_staff_role := 'cashier',
--   p_correlation_id := 'test-cross-casino-isolation'
-- );
--
-- -- Try to read Casino B ledger entries
-- SELECT count(*) FROM loyalty_ledger WHERE casino_id = '<casino-b-id>';
--
-- Expected: 0 (RLS filters out rows from other casinos)
--
-- -- Try to insert into Casino B ledger
-- INSERT INTO loyalty_ledger (casino_id, player_id, points_earned, reason, metadata)
-- VALUES ('<casino-b-id>', '<player-id>', 100, 'mid_session', '{"test": true}'::jsonb);
--
-- Expected: ERROR: new row violates row-level security policy
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Migration metadata
COMMENT ON TABLE loyalty_ledger IS
  'Append-only ledger for loyalty point transactions. RLS enforces casino scoping. Cashier role added 2025-12-13 (PRD-004).';

COMMENT ON TABLE player_loyalty IS
  'Player loyalty balance cache per casino. RLS enforces casino scoping. Cashier role added 2025-12-13 (PRD-004).';
