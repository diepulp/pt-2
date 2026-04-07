-- ============================================================================
-- Migration: fix_rls_initplan_company_staff_pin
-- Purpose:   Wrap bare auth.uid() calls in RLS policies with (select auth.uid())
--            to convert per-row evaluation into a single initplan evaluation.
--
-- Advisory:  Supabase Cloud Advisor — Auth RLS InitPlan (WARN)
--            Tables: public.company, public.staff_pin_attempts
--            Policies: company_deny_all, staff_pin_attempts_deny_all
--
-- ADR ref:   ADR-015 (RLS policy patterns, connection pooling)
-- Pattern:   (select auth.uid()) IS NOT NULL — initplan subquery, evaluated once
--
-- RLS_REVIEW_COMPLETE
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. company — company_deny_all
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS company_deny_all ON public.company;

CREATE POLICY company_deny_all
  ON public.company
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL AND false)
  WITH CHECK ((select auth.uid()) IS NOT NULL AND false);

COMMENT ON POLICY company_deny_all ON public.company IS
  'Explicit deny-all for authenticated role (PRD-025 lockdown). '
  'All access via service_role and SECURITY DEFINER RPCs. SEC-S2 remediation. '
  'Uses (select auth.uid()) initplan pattern per ADR-015.';

-- --------------------------------------------------------------------------
-- 2. staff_pin_attempts — staff_pin_attempts_deny_all
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_pin_attempts_deny_all ON public.staff_pin_attempts;

CREATE POLICY staff_pin_attempts_deny_all
  ON public.staff_pin_attempts
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL AND false)
  WITH CHECK ((select auth.uid()) IS NOT NULL AND false);

COMMENT ON POLICY staff_pin_attempts_deny_all ON public.staff_pin_attempts IS
  'Explicit deny-all for authenticated role. All access via SECURITY DEFINER RPCs '
  '(rpc_increment_pin_attempt, rpc_clear_pin_attempts). SEC-S2 remediation. '
  'Uses (select auth.uid()) initplan pattern per ADR-015.';

-- --------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- --------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
