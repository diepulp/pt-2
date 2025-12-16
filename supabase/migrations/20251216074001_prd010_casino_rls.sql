-- =====================================================
-- Migration: Casino Table RLS - PRD-010 Workstream WS1
-- Created: 2025-12-16 07:40:01
-- Purpose: Enable RLS on casino table with read-only hybrid policy
-- PRD: PRD-010 RLS MVP Hardening
-- ADR: ADR-015 (Pattern C Hybrid), ADR-020 (Track A MVP)
-- Security: SEC-001 Template 1 (Read Access Hybrid)
-- =====================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM (PRD-010):
-- The casino table currently has NO RLS enabled. This is a P0 security gap.
-- Direct queries to the casino table could leak cross-tenant data:
-- - Casino names from other properties
-- - Company associations
-- - Configuration visibility
--
-- While staff can only query their own casino through staff.casino_id
-- relationship, the lack of RLS on the casino table itself creates a
-- potential data leakage vector.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Enable RLS on casino table
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE casino ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Read-only policy for authenticated staff (Pattern C Hybrid)
-- ═══════════════════════════════════════════════════════════════════════════

-- Policy: casino_read_own_casino
-- Pattern: C (Hybrid - Transaction-wrapped with JWT fallback)
-- Scope: Read-only access to user's own casino
-- Template: SEC-001 Template 1 (Read Access Hybrid)
--
-- Security guarantees:
-- 1. User MUST be authenticated (auth.uid() IS NOT NULL)
-- 2. User can ONLY see their own casino (casino.id matches injected casino_id)
-- 3. Connection pooling safe (COALESCE with JWT fallback)
-- 4. No cross-tenant data leakage possible

CREATE POLICY casino_read_own_casino ON casino
  FOR SELECT USING (
    -- Verify authenticated user (auth.uid() from Supabase Auth)
    auth.uid() IS NOT NULL
    -- Verify casino scope (hybrid context resolution per ADR-015 Pattern C)
    AND id = COALESCE(
      -- Primary: Transaction-wrapped context from set_rls_context() RPC
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      -- Fallback: JWT app_metadata.casino_id (connection pooling safe)
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: No direct writes allowed (implicit deny)
-- ═══════════════════════════════════════════════════════════════════════════

-- No INSERT/UPDATE/DELETE policies created.
-- This implements implicit deny for non-service-role operations.
--
-- Rationale:
-- - Casino records are foundational data created during setup
-- - Only service_role should modify casino table (admin tools, migrations)
-- - Runtime operations use casino.id via staff.casino_id relationship
-- - No user-facing operations require direct casino table writes

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Test 1: Verify RLS is enabled
-- Expected: rls_enabled = true
-- Query: SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'casino';

-- Test 2: Verify policy exists
-- Expected: 1 row (casino_read_own_casino)
-- Query: SELECT * FROM pg_policies WHERE tablename = 'casino';

-- Test 3: Test read access (manual)
-- Setup:
--   SELECT set_rls_context(
--     p_actor_id := 'staff-uuid',
--     p_casino_id := 'casino-1-uuid',
--     p_staff_role := 'pit_boss',
--     p_correlation_id := 'test-prd010'
--   );
-- Query: SELECT * FROM casino;
-- Expected: Only casino-1 record returned

-- Test 4: Test cross-casino denial (manual)
-- Setup: Same as Test 3
-- Query: SELECT * FROM casino WHERE id = 'casino-2-uuid';
-- Expected: 0 rows (RLS filters out other casinos)

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════

-- If this migration causes issues, rollback with:
--
-- BEGIN;
-- DROP POLICY IF EXISTS casino_read_own_casino ON casino;
-- ALTER TABLE casino DISABLE ROW LEVEL SECURITY;
-- COMMIT;
--
-- WARNING: This will re-expose the P0 security gap. Only use in emergency.

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUMENTATION UPDATES REQUIRED
-- ═══════════════════════════════════════════════════════════════════════════

-- TODO (post-migration):
-- 1. Update SEC-001-rls-policy-matrix.md:
--    - Add casino table to Policy Matrix (row 1)
--    - Document read-only policy (casino_read_own_casino)
--    - Note: No write policies (implicit deny)
--
-- 2. Update PRD-010-rls-mvp-hardening.md:
--    - Mark WS1 (Casino Table RLS) as complete
--    - Update DoD checklist
--
-- 3. Update ADR-020-rls-track-a-mvp-strategy.md:
--    - Mark "casino table has RLS enabled" as complete
--
-- 4. Create integration test in rls-pooling-safety.integration.test.ts:
--    - Test: Staff A cannot see Casino B record
--    - Test: Hybrid fallback works (JWT without SET LOCAL)

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
