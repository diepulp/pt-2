-- ============================================================================
-- Migration: Fix PERF-P3 — Multiple permissive UPDATE policies on staff
-- Created: 2026-04-03
-- Source: SUPABASE-ADVISOR-REPORT-2026-04-02.md (PERF-P3)
-- Markers: ADR-015, ADR-030, RLS_REVIEW_COMPLETE
-- ============================================================================
-- The staff table has two permissive UPDATE policies:
--   1. staff_update (admin-only, session-var-only, from ADR-030 hardening)
--   2. staff_update_own_pin (self-service PIN, from PRD-029)
--
-- Multiple permissive policies for the same role/action are OR'd together,
-- which widens access and adds planner overhead. Convert staff_update_own_pin
-- to RESTRICTIVE so it only applies when the row matches (self-only check).
--
-- However, RESTRICTIVE policies are AND'd with ALL permissive policies.
-- A RESTRICTIVE self-only check would block admin updates to other staff.
-- Instead, consolidate into a single permissive UPDATE that handles both:
--   - Admin: can update any staff in their casino
--   - Self: can update own row (PIN only, enforced by column-level GRANT)
-- ============================================================================

BEGIN;

-- Drop both existing UPDATE policies
DROP POLICY IF EXISTS staff_update ON staff;
DROP POLICY IF EXISTS staff_update_own_pin ON staff;

-- Consolidated UPDATE policy: admin OR self-service
-- Admin path: session-var-only (ADR-030 D4 Template 2b)
-- Self path: matches own user_id, same casino, active status
CREATE POLICY staff_update ON staff
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      -- Path A: Admin can update any staff in their casino
      (
        NULLIF((SELECT current_setting('app.casino_id', true)), '') IS NOT NULL
        AND NULLIF((SELECT current_setting('app.actor_id', true)), '') IS NOT NULL
        AND casino_id = (SELECT current_setting('app.casino_id', true))::uuid
        AND NULLIF((SELECT current_setting('app.staff_role', true)), '') IN ('admin')
      )
      OR
      -- Path B: Self-service (PIN update via column-level GRANT)
      (
        (SELECT auth.uid()) = user_id
        AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
        AND status = 'active'
      )
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      -- Path A: Admin
      (
        NULLIF((SELECT current_setting('app.casino_id', true)), '') IS NOT NULL
        AND NULLIF((SELECT current_setting('app.actor_id', true)), '') IS NOT NULL
        AND casino_id = (SELECT current_setting('app.casino_id', true))::uuid
        AND NULLIF((SELECT current_setting('app.staff_role', true)), '') IN ('admin')
      )
      OR
      -- Path B: Self-service
      (
        (SELECT auth.uid()) = user_id
        AND casino_id = NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid
      )
    )
  );

COMMENT ON POLICY staff_update ON staff IS
  'Consolidated UPDATE: admin (full row via service_role) OR self-service (pin_hash only via column-level GRANT). '
  'ADR-030 D4 compliant — session-var-only, no JWT fallback. PERF-P3 remediation.';

COMMIT;

NOTIFY pgrst, 'reload schema';
