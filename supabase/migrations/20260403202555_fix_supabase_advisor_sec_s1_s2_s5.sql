-- ============================================================================
-- Migration: Fix Supabase Advisor SEC-S1, SEC-S2, SEC-S5
-- Created: 2026-04-03
-- Source: SUPABASE-ADVISOR-REPORT-2026-04-02.md
-- ============================================================================
-- SEC-S1: mtl_gaming_day_summary SECURITY DEFINER view — recreate as INVOKER
-- SEC-S2: company/staff_pin_attempts have RLS enabled but no policies
--         Both are intentional deny-by-default; add explicit denial policies
--         to silence the advisor lint and document intent.
-- SEC-S5: mv_loyalty_balance_reconciliation exposed to anon/authenticated
--         REVOKE SELECT from anon, authenticated.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SEC-S1: Recreate mtl_gaming_day_summary as SECURITY INVOKER
-- The view currently uses SECURITY DEFINER (Postgres default for views),
-- which bypasses the querying user's RLS policies. Recreating with
-- SECURITY INVOKER ensures the view respects the caller's RLS context.
-- ============================================================================

DROP VIEW IF EXISTS mtl_gaming_day_summary;

CREATE VIEW mtl_gaming_day_summary
WITH (security_invoker = true)
AS
SELECT
  e.casino_id,
  e.patron_uuid,
  p.first_name AS patron_first_name,
  p.last_name AS patron_last_name,
  p.birth_date AS patron_date_of_birth,
  e.gaming_day,
  -- Cash-in aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE 0 END), 0) AS total_in,
  COUNT(CASE WHEN e.direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN e.direction = 'in' THEN e.amount END) AS max_single_in,
  MIN(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS first_in_at,
  MAX(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS last_in_at,
  -- Cash-out aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'out' THEN e.amount ELSE 0 END), 0) AS total_out,
  COUNT(CASE WHEN e.direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN e.direction = 'out' THEN e.amount END) AS max_single_out,
  MIN(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS first_out_at,
  MAX(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS last_out_at,
  -- Overall
  COALESCE(SUM(e.amount), 0) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry e
LEFT JOIN player p ON e.patron_uuid = p.id
WHERE e.gaming_day IS NOT NULL
GROUP BY e.casino_id, e.patron_uuid, p.first_name, p.last_name, p.birth_date, e.gaming_day;

COMMENT ON VIEW mtl_gaming_day_summary IS
  'Aggregates MTL entries per patron per gaming day with patron names and DOB. '
  'Uses occurred_at for timestamps. Authoritative surface for Tier 2 compliance badges (CTR/AML). '
  'SECURITY INVOKER: respects caller RLS context (SEC-S1 remediation).';

-- ============================================================================
-- SEC-S2: Add explicit denial policies to company and staff_pin_attempts
--
-- Both tables intentionally use deny-by-default (RLS enabled, no permissive
-- policies). Adding explicit denial policies documents this intent and
-- silences the Supabase advisor lint 0008.
--
-- company: Metadata table, access via service_role/SECURITY DEFINER RPCs only.
-- staff_pin_attempts: Rate-limit state, access via SECURITY DEFINER RPCs only.
-- ============================================================================

-- company: explicit SELECT denial for authenticated (all access via service_role)
CREATE POLICY company_deny_all
  ON public.company
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY company_deny_all ON public.company IS
  'Explicit deny-all for authenticated role (PRD-025 lockdown). '
  'All access via service_role and SECURITY DEFINER RPCs. SEC-S2 remediation.';

-- staff_pin_attempts: explicit denial for authenticated
-- (all access via rpc_increment_pin_attempt / rpc_clear_pin_attempts)
CREATE POLICY staff_pin_attempts_deny_all
  ON public.staff_pin_attempts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY staff_pin_attempts_deny_all ON public.staff_pin_attempts IS
  'Explicit deny-all for authenticated role. All access via SECURITY DEFINER RPCs '
  '(rpc_increment_pin_attempt, rpc_clear_pin_attempts). SEC-S2 remediation.';

-- ============================================================================
-- SEC-S5: REVOKE SELECT on mv_loyalty_balance_reconciliation
-- Materialized view should not be exposed via PostgREST API.
-- ============================================================================

REVOKE SELECT ON public.mv_loyalty_balance_reconciliation FROM anon;
REVOKE SELECT ON public.mv_loyalty_balance_reconciliation FROM authenticated;

-- Grant to service_role only (for admin/reporting scripts)
GRANT SELECT ON public.mv_loyalty_balance_reconciliation TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
