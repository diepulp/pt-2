-- ============================================================================
-- Migration: Fix visit_financial_summary Security Invoker
-- Created: 2025-12-16 16:03:32
-- Purpose: Convert SECURITY DEFINER view to SECURITY INVOKER for RLS compliance
-- Issue: Supabase DB Advisor lint 0010_security_definer_view
-- Reference: https://supabase.com/docs/guides/database/database-advisors
-- ============================================================================
--
-- PROBLEM:
-- The view public.visit_financial_summary was created without specifying
-- security_invoker=true, causing PostgreSQL to default to SECURITY DEFINER.
-- This means the view executes with the privileges of the view creator,
-- potentially bypassing RLS policies on the underlying player_financial_transaction
-- table.
--
-- SOLUTION:
-- Alter the view to use security_invoker=true. This ensures:
-- 1. RLS policies on player_financial_transaction are enforced
-- 2. The view runs with the permissions of the querying user
-- 3. Casino-scoped data isolation is maintained (Pattern C compliance)
--
-- ADR-015 COMPLIANCE:
-- The underlying player_financial_transaction table uses Pattern C (Hybrid)
-- RLS with transaction context + JWT fallback. SECURITY INVOKER ensures
-- these policies are respected when querying through the view.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Alter existing view to use SECURITY INVOKER
-- ============================================================================
-- This is a non-destructive change that modifies the view's security context
-- without changing the view definition itself.

ALTER VIEW public.visit_financial_summary
SET (security_invoker = true);

-- ============================================================================
-- STEP 2: Update view comment to document security configuration
-- ============================================================================

COMMENT ON VIEW public.visit_financial_summary IS
  'Aggregated financial summary per visit. Uses SECURITY INVOKER to enforce RLS from player_financial_transaction. Used by PlayerFinancialService.getVisitSummary() for rating slip modal display.';

COMMIT;

-- ============================================================================
-- VERIFICATION (run manually after migration):
-- ============================================================================
-- SELECT
--   c.relname AS view_name,
--   CASE WHEN c.reloptions @> ARRAY['security_invoker=true']
--        THEN 'SECURITY INVOKER'
--        ELSE 'SECURITY DEFINER'
--   END AS security_mode
-- FROM pg_class c
-- JOIN pg_namespace n ON c.relnamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND c.relname = 'visit_financial_summary'
--   AND c.relkind = 'v';
-- ============================================================================
