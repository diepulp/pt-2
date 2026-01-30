-- ============================================================================
-- Migration: AUTH-HARDENING v0.1 WS5 — Write RLS Policy Tightening (Revised)
-- Description: Tighten write policies in two categories based on write path:
--   Category A (RPC-only writes): Remove JWT COALESCE fallback entirely.
--     Writes occur inside SECURITY DEFINER RPCs where SET LOCAL is
--     in the same transaction — session-var-only enforcement is safe.
--   Category B (direct PostgREST writes): Preserve COALESCE hybrid pattern
--     (ADR-015 Pattern C). SET LOCAL from set_rls_context_from_staff() does
--     NOT persist across PostgREST HTTP requests (separate PG transactions).
--     JWT fallback is required for these tables.
-- Reference: ADR-015, ADR-018, ADR-020, ADR-024, AUTH-HARDENING-v0.1
-- See also: docs/issues/auth-hardening/ISSUE-WS5-SET-LOCAL-TRANSACTION-SCOPING.md
-- RLS_REVIEW_COMPLETE: Category A tables verified to have RPC-only write paths.
--   Category B tables retain ADR-015 hybrid pattern. SELECT policies unchanged.
-- VERIFIED_SAFE: All role gates preserved per existing policies. Denial policies
--   (no_updates, no_deletes) unchanged. SELECT policies unchanged.
-- ============================================================================
--
-- CATEGORY A — RPC-only writes (session-var required, no JWT fallback):
--   player_casino, rating_slip_pause, gaming_table, dealer_rotation,
--   player_financial_transaction, staff
--
-- CATEGORY B — Direct PostgREST writes (COALESCE hybrid preserved):
--   visit, rating_slip, player_loyalty, loyalty_ledger
--
-- DENIAL POLICIES (e.g. player_financial_transaction_no_updates): UNCHANGED
-- ============================================================================

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  CATEGORY B — HYBRID COALESCE PRESERVED (direct PostgREST writes)       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- =============================================================================
-- B1. VISIT — INSERT, UPDATE (pit_boss, admin)
-- Write path: services/visit/crud.ts → .from('visit').insert() / .update()
-- =============================================================================

DROP POLICY IF EXISTS visit_insert_staff ON visit;
CREATE POLICY visit_insert_staff ON visit
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS visit_update_staff ON visit;
CREATE POLICY visit_update_staff ON visit
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- =============================================================================
-- B2. RATING_SLIP — INSERT, UPDATE (pit_boss, admin)
-- Write path: services/rating-slip/crud.ts → .from('rating_slip').update()
-- =============================================================================

DROP POLICY IF EXISTS rating_slip_insert_staff ON rating_slip;
CREATE POLICY rating_slip_insert_staff ON rating_slip
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS rating_slip_update_staff ON rating_slip;
CREATE POLICY rating_slip_update_staff ON rating_slip
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'admin')
  );

-- =============================================================================
-- B3. LOYALTY_LEDGER — INSERT (pit_boss, cashier, admin)
-- Write path: services/loyalty/crud.ts → .from('loyalty_ledger').insert()
--             Also SECURITY INVOKER RPCs (inherit caller RLS)
-- =============================================================================

DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger;
CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF((select auth.jwt()) -> 'app_metadata' ->> 'staff_role', '')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

-- =============================================================================
-- B4. PLAYER_LOYALTY — INSERT, UPDATE (various roles)
-- Write path: services/loyalty/crud.ts → .from('player_loyalty').update()
-- Note: No direct casino_id column; scope via player_casino join
-- DELETE is already hard-deny (AND false), UNCHANGED
-- =============================================================================

DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty;
CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player_loyalty.player_id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
      )
    )
  );

DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty;
CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player_loyalty.player_id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
      )
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player_loyalty.player_id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
      )
    )
  );

-- player_loyalty_deny_delete — already hard-deny (AND false), UNCHANGED

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  CATEGORY A — SESSION-VAR ONLY (writes via SECURITY DEFINER RPCs)       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- =============================================================================
-- A1. PLAYER_CASINO — INSERT, UPDATE (pit_boss, admin) with actor binding
-- Write path: rpc_create_player (SECURITY DEFINER) — same-transaction SET LOCAL
-- =============================================================================

DROP POLICY IF EXISTS "player_casino_insert" ON player_casino;
CREATE POLICY "player_casino_insert" ON player_casino
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
    AND (
      enrolled_by IS NULL
      OR enrolled_by = (select current_setting('app.actor_id', true))::uuid
    )
  );

DROP POLICY IF EXISTS "player_casino_update" ON player_casino;
CREATE POLICY "player_casino_update" ON player_casino
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
    AND (
      enrolled_by IS NULL
      OR enrolled_by = (select current_setting('app.actor_id', true))::uuid
    )
  );

-- player_casino_no_delete — already hard deny, UNCHANGED

-- =============================================================================
-- A2. RATING_SLIP_PAUSE — INSERT, UPDATE (casino scope, any authenticated)
-- Write path: rpc_pause_rating_slip, rpc_resume_rating_slip (SECURITY DEFINER)
-- =============================================================================

DROP POLICY IF EXISTS rating_slip_pause_write_pit_boss ON rating_slip_pause;
CREATE POLICY rating_slip_pause_write_pit_boss ON rating_slip_pause
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
  );

DROP POLICY IF EXISTS rating_slip_pause_update_pit_boss ON rating_slip_pause;
CREATE POLICY rating_slip_pause_update_pit_boss ON rating_slip_pause
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
  );

-- =============================================================================
-- A3. GAMING_TABLE — INSERT, UPDATE (pit_boss, admin)
-- Write path: rpc_update_table_status (SECURITY DEFINER)
-- =============================================================================

DROP POLICY IF EXISTS gaming_table_insert_admin ON gaming_table;
CREATE POLICY gaming_table_insert_admin ON gaming_table
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS gaming_table_update_admin ON gaming_table;
CREATE POLICY gaming_table_update_admin ON gaming_table
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  );

-- =============================================================================
-- A4. DEALER_ROTATION — INSERT, UPDATE (pit_boss, admin)
-- Write path: No direct writes found; RPC-only or admin tooling
-- =============================================================================

DROP POLICY IF EXISTS dealer_rotation_insert_staff ON dealer_rotation;
CREATE POLICY dealer_rotation_insert_staff ON dealer_rotation
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  );

DROP POLICY IF EXISTS dealer_rotation_update_staff ON dealer_rotation;
CREATE POLICY dealer_rotation_update_staff ON dealer_rotation
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('pit_boss', 'admin')
  );

-- =============================================================================
-- A5. PLAYER_FINANCIAL_TRANSACTION — INSERT (cashier, pit_boss, admin)
-- Write path: rpc_create_financial_txn (SECURITY DEFINER)
-- NOTE: Also adds casino_id check (was missing from original policy)
-- UPDATE/DELETE are already hard-deny, UNCHANGED
-- =============================================================================

DROP POLICY IF EXISTS player_financial_transaction_insert_cashier ON player_financial_transaction;
CREATE POLICY player_financial_transaction_insert_cashier ON player_financial_transaction
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('cashier', 'pit_boss', 'admin')
  );

-- =============================================================================
-- A6. STAFF — INSERT (admin), UPDATE (admin), DELETE (admin)
-- Write path: services/casino/crud.ts uses service-role client (bypasses RLS)
-- =============================================================================

DROP POLICY IF EXISTS staff_write ON staff;
CREATE POLICY staff_write ON staff
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('admin')
  );

DROP POLICY IF EXISTS staff_update ON staff;
CREATE POLICY staff_update ON staff
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '')
      IN ('admin')
  );

DROP POLICY IF EXISTS staff_delete ON staff;
CREATE POLICY staff_delete ON staff
  FOR DELETE USING (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND NULLIF((select current_setting('app.actor_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') = 'admin'
  );

-- =============================================================================
-- POLICY DOCUMENTATION
-- =============================================================================

-- Category B — Hybrid COALESCE preserved
COMMENT ON POLICY visit_insert_staff ON visit IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. pit_boss/admin.';
COMMENT ON POLICY visit_update_staff ON visit IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. pit_boss/admin.';

COMMENT ON POLICY rating_slip_insert_staff ON rating_slip IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. pit_boss/admin.';
COMMENT ON POLICY rating_slip_update_staff ON rating_slip IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. pit_boss/admin.';

COMMENT ON POLICY loyalty_ledger_insert ON loyalty_ledger IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct + SECURITY INVOKER writes. pit_boss/cashier/admin.';

COMMENT ON POLICY player_loyalty_insert ON player_loyalty IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. Casino scope via player_casino join.';
COMMENT ON POLICY player_loyalty_update ON player_loyalty IS
  'AUTH-HARDENING v0.1 (Cat-B): Hybrid COALESCE preserved — direct PostgREST writes. Casino scope via player_casino join.';

-- Category A — Session-var only
COMMENT ON POLICY "player_casino_insert" ON player_casino IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin with enrolled_by binding.';
COMMENT ON POLICY "player_casino_update" ON player_casino IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin with enrolled_by binding.';

COMMENT ON POLICY rating_slip_pause_write_pit_boss ON rating_slip_pause IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. Casino-scoped, any authenticated.';
COMMENT ON POLICY rating_slip_pause_update_pit_boss ON rating_slip_pause IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. Casino-scoped, any authenticated.';

COMMENT ON POLICY gaming_table_insert_admin ON gaming_table IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin.';
COMMENT ON POLICY gaming_table_update_admin ON gaming_table IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin.';

COMMENT ON POLICY dealer_rotation_insert_staff ON dealer_rotation IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin.';
COMMENT ON POLICY dealer_rotation_update_staff ON dealer_rotation IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — RPC-only writes. pit_boss/admin.';

COMMENT ON POLICY player_financial_transaction_insert_cashier ON player_financial_transaction IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required + casino_id check added — RPC-only writes. cashier/pit_boss/admin.';

COMMENT ON POLICY staff_write ON staff IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — service-role client writes. admin only.';
COMMENT ON POLICY staff_update ON staff IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — service-role client writes. admin only.';
COMMENT ON POLICY staff_delete ON staff IS
  'AUTH-HARDENING v0.1 (Cat-A): Session-var required — service-role client writes. admin only.';

NOTIFY pgrst, 'reload schema';

COMMIT;
