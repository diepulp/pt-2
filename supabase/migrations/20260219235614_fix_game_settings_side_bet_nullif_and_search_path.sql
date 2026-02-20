-- ============================================================================
-- Migration: SEC-REMEDIATION WS6 (P2) – L-1 + L-5 + L-2
-- Description: Fix game_settings_side_bet RLS policies to use NULLIF pattern
--              and remove dead 'manager' role reference. Standardize
--              search_path on all rpc_* SECURITY DEFINER functions.
-- Created: 2026-02-20
-- Reference: SEC-REMEDIATION-2026-02-19, ADR-015, ADR-020, ADR-024
-- ============================================================================

-- ===========================================================================
-- SECTION 1: L-1 + L-5 – game_settings_side_bet RLS policy remediation
-- ---------------------------------------------------------------------------
-- Issues:
--   L-1: current_setting('app.casino_id', true)::uuid without NULLIF fails
--        when the setting is '' (empty string) – '' cannot cast to uuid.
--   L-5: IN ('admin', 'manager') references a dead 'manager' role.
--        The only valid write role is 'admin'.
-- Fix:  Wrap current_setting calls with NULLIF(..., '') before ::uuid cast.
--       Replace IN ('admin', 'manager') with = 'admin'.
-- ===========================================================================

-- 1a. DROP existing policies
DROP POLICY IF EXISTS side_bet_select ON game_settings_side_bet;
DROP POLICY IF EXISTS side_bet_insert ON game_settings_side_bet;
DROP POLICY IF EXISTS side_bet_update ON game_settings_side_bet;

-- 1b. Recreate SELECT policy with NULLIF pattern
CREATE POLICY side_bet_select ON game_settings_side_bet
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
  );

-- 1c. Recreate INSERT policy with NULLIF + admin-only
CREATE POLICY side_bet_insert ON game_settings_side_bet
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt()->'app_metadata')::jsonb->>'staff_role'
    ) = 'admin'
  );

-- 1d. Recreate UPDATE policy with NULLIF + admin-only (USING + WITH CHECK)
CREATE POLICY side_bet_update ON game_settings_side_bet
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt()->'app_metadata')::jsonb->>'staff_role'
    ) = 'admin'
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
  );

-- ===========================================================================
-- SECTION 2: L-2 – search_path standardization for rpc_* SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- Issue:  SECURITY DEFINER functions without explicit search_path are
--         vulnerable to search_path hijacking (CWE-426).
-- Fix:    Dynamic DO block finds all public.rpc_* SECURITY DEFINER functions
--         missing 'pg_catalog' in their search_path and ALTERs them.
--         Runs in a single transaction (Supabase migration runner default).
-- ===========================================================================

DO $$
DECLARE
  rec RECORD;
  alter_sql text;
BEGIN
  FOR rec IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname LIKE 'rpc_%'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_options_to_table(p.proconfig)
        WHERE option_name = 'search_path'
          AND option_value LIKE '%pg_catalog%'
      )
  LOOP
    alter_sql := format(
      'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public',
      rec.proname, rec.args
    );
    EXECUTE alter_sql;
    RAISE NOTICE 'Patched search_path: public.%(%)', rec.proname, rec.args;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PostgREST schema cache reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
