-- ============================================================================
-- Migration: PRD-033 Immutability RLS Enforcement
-- Description: Replace permissive UPDATE policies with status-gated versions
-- Reference: ADR-015, PRD-033, RLS_REVIEW_COMPLETE
-- Created: 2026-02-17
-- PRD Reference: docs/10-prd/PRD-033-cashier-workflow-mvp-v0.md
-- Purpose: Replace permissive UPDATE policies on table_fill and table_credit
--          with status-gated versions. Once a fill/credit is confirmed, it
--          becomes immutable via RLS. Only SECURITY DEFINER RPCs can perform
--          the requested→confirmed transition.
--
-- table_fill:   Existing UPDATE policy had no role gate. New policy adds
--               status='requested' + pit_boss/admin role restriction.
-- table_credit: Existing UPDATE policy had pit_boss/admin role gate via
--               gaming_table join. New policy adds status='requested'.
-- table_drop_event: No UPDATE policy exists — already safe.
-- ============================================================================

-- ============================================================================
-- 1. table_fill: Replace UPDATE policy — status-gated + role-gated
-- ============================================================================
-- Existing policy (from 20251220164609): auth.uid() IS NOT NULL + staff join
-- for casino scope. NO role gate, NO status check.
DROP POLICY IF EXISTS table_fill_update ON table_fill;

CREATE POLICY table_fill_update ON table_fill
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND status = 'requested'
    AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.user_id = (select auth.uid())
      AND s.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- ============================================================================
-- 2. table_credit: Replace UPDATE policy — add status gate
-- ============================================================================
-- Existing policy (from 20251220164609): auth.uid() IS NOT NULL + gaming_table
-- join for casino scope + pit_boss/admin role gate. NO status check.
DROP POLICY IF EXISTS table_credit_update ON table_credit;

CREATE POLICY table_credit_update ON table_credit
  FOR UPDATE USING (
    (select auth.uid()) IS NOT NULL
    AND status = 'requested'
    AND EXISTS (
      SELECT 1 FROM gaming_table gt
      WHERE gt.id = table_credit.table_id
      AND gt.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- table_drop_event: No UPDATE policy exists — already safe.
-- Only SECURITY DEFINER rpc_acknowledge_drop_received can modify cage_received_* columns.

NOTIFY pgrst, 'reload schema';
