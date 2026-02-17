-- ============================================================================
-- Migration: PRD-027 Temporal RPCs + MTL Trigger Fix + Legacy Lockdown
-- ============================================================================
-- Purpose: Standardize gaming day resolution through database RPCs.
--   1. Migrate Layer 1 compute_gaming_day from time to interval param
--   2. Create compute_gaming_day_for_casino() — Layer 2 RLS-context wrapper
--   3. Create rpc_current_gaming_day() — Layer 3 client-callable RPC
--   4. Create rpc_gaming_day_range() — Layer 3 range RPC
--   5. Fix trg_mtl_entry_set_gaming_day() — remove inline logic, call Layer 1
--   6. Lock down legacy compute_gaming_day(uuid, timestamptz) — REVOKE from anon/authenticated
--
-- References: PRD-027, TEMP-001, TEMP-002, TEMP-003, ADR-024, ADR-018
-- Governance: ADR-024 INV-8 (no casino_id on client RPCs), ADR-018 (SECURITY DEFINER)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Migrate Layer 1 — compute_gaming_day(time) → compute_gaming_day(interval)
-- ============================================================================
-- The old signature uses `time` but canonical spec requires `interval`.
-- Since CREATE OR REPLACE cannot change parameter types, we must DROP + CREATE.
-- Layer 1 currently has ZERO callers (all triggers were migrated to Layer 2
-- in 20260116184731_fix_gaming_day_timezone_triggers.sql).

-- Defensive: only drop if the time overload exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'compute_gaming_day'
      AND pg_get_function_identity_arguments(p.oid) = 'ts timestamp with time zone, gstart time without time zone'
  ) THEN
    EXECUTE 'DROP FUNCTION public.compute_gaming_day(ts timestamptz, gstart time)';
  END IF;
END $$;

-- Create canonical Layer 1 with interval parameter
CREATE OR REPLACE FUNCTION public.compute_gaming_day(
  p_ts timestamptz,
  p_gaming_day_start interval
) RETURNS date
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (date_trunc('day', p_ts - p_gaming_day_start) + p_gaming_day_start)::date
$fn$;

COMMENT ON FUNCTION public.compute_gaming_day(timestamptz, interval) IS
  'TEMP-001 Layer 1: Pure math gaming day computation. IMMUTABLE. '
  'Subtracts gaming_day_start offset, truncates to day, adds offset back. '
  'Callers must convert casino-local timestamp before calling. '
  'PRD-027: Migrated from time to interval parameter.';


-- ============================================================================
-- STEP 2: Create compute_gaming_day_for_casino() — Layer 2 canonical wrapper
-- ============================================================================
-- Reads RLS context (app.casino_id) — NO side effects (does not set context).
-- Fails closed if app.casino_id is missing.
-- Schema-qualified table references throughout.

CREATE OR REPLACE FUNCTION public.compute_gaming_day_for_casino(
  p_ts timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_timezone text;
  v_gaming_day_start interval;
  v_local_ts timestamptz;
BEGIN
  -- Read casino_id from RLS context — fail closed if missing
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: app.casino_id not set — call set_rls_context_from_staff() first'
      USING ERRCODE = 'P0001';
  END IF;

  -- Fetch casino settings (schema-qualified)
  SELECT
    cs.timezone,
    cs.gaming_day_start_time::interval
  INTO v_timezone, v_gaming_day_start
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', v_casino_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Convert timestamp to casino-local time, then delegate to Layer 1
  v_local_ts := p_ts AT TIME ZONE v_timezone;

  RETURN public.compute_gaming_day(v_local_ts, COALESCE(v_gaming_day_start, interval '06:00'));
END;
$$;

COMMENT ON FUNCTION public.compute_gaming_day_for_casino(timestamptz) IS
  'TEMP-001 Layer 2: Casino-scoped gaming day wrapper. STABLE, SECURITY DEFINER. '
  'Reads app.casino_id from RLS context (does NOT set context). '
  'Fails closed if context is missing. Delegates to Layer 1 compute_gaming_day(). '
  'PRD-027: New canonical wrapper — replaces direct use of compute_gaming_day(uuid, timestamptz).';

-- Permissions: only callable by functions that have already set context
-- Not directly client-callable (clients use rpc_current_gaming_day instead)
REVOKE ALL ON FUNCTION public.compute_gaming_day_for_casino(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_gaming_day_for_casino(timestamptz) TO authenticated;


-- ============================================================================
-- STEP 3: Create rpc_current_gaming_day() — Layer 3 client-callable RPC
-- ============================================================================
-- Sets RLS context via set_rls_context_from_staff(), then delegates to Layer 2.
-- ADR-024 INV-8: No casino_id parameter.

CREATE OR REPLACE FUNCTION public.rpc_current_gaming_day(
  p_timestamp timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set RLS context (ADR-018, ADR-024)
  PERFORM public.set_rls_context_from_staff();

  -- Delegate to Layer 2 wrapper
  RETURN public.compute_gaming_day_for_casino(p_timestamp);
END;
$$;

COMMENT ON FUNCTION public.rpc_current_gaming_day(timestamptz) IS
  'TEMP-001 Layer 3: Client-callable gaming day RPC. SECURITY DEFINER. '
  'Calls set_rls_context_from_staff() then compute_gaming_day_for_casino(). '
  'ADR-024 INV-8: No casino_id parameter — scope derived from JWT. '
  'PRD-027: Primary temporal RPC for RSC pages and client hooks.';

REVOKE ALL ON FUNCTION public.rpc_current_gaming_day(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_current_gaming_day(timestamptz) TO authenticated;


-- ============================================================================
-- STEP 4: Create rpc_gaming_day_range() — Layer 3 range RPC
-- ============================================================================
-- Returns (start_gd, end_gd) for weekly trend queries.
-- Eliminates JS "weeks ago" date math (TEMP-003 banned pattern).

CREATE OR REPLACE FUNCTION public.rpc_gaming_day_range(
  p_weeks int DEFAULT 4,
  p_end_timestamp timestamptz DEFAULT now()
) RETURNS TABLE(start_gd date, end_gd date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_end_gd date;
BEGIN
  -- Set RLS context (ADR-018, ADR-024)
  PERFORM public.set_rls_context_from_staff();

  -- Compute end gaming day via Layer 2
  v_end_gd := public.compute_gaming_day_for_casino(p_end_timestamp);

  -- Return range: start = end - (weeks * 7 days)
  RETURN QUERY SELECT
    (v_end_gd - (p_weeks * 7))::date AS start_gd,
    v_end_gd AS end_gd;
END;
$$;

COMMENT ON FUNCTION public.rpc_gaming_day_range(int, timestamptz) IS
  'TEMP-001 Layer 3: Gaming day range RPC for weekly trend queries. SECURITY DEFINER. '
  'Returns {start_gd, end_gd} where start_gd = end_gd - (p_weeks * 7). '
  'Eliminates JS getWeeksAgoDate() pattern (TEMP-003). '
  'PRD-027: Replaces client-side date arithmetic for Player 360 weekly series.';

REVOKE ALL ON FUNCTION public.rpc_gaming_day_range(int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_gaming_day_range(int, timestamptz) TO authenticated;


-- ============================================================================
-- STEP 5: Fix trg_mtl_entry_set_gaming_day() — call Layer 1, no inline logic
-- ============================================================================
-- The MTL trigger has NEW.casino_id available, so it uses Layer 1 directly
-- with a settings lookup (no wrapper needed).
-- Caller contract: triggers → Layer 1 + settings lookup.
-- Uses occurred_at per 20260103004320_prd005_mtl_occurred_at_and_guards.sql.

CREATE OR REPLACE FUNCTION public.trg_mtl_entry_set_gaming_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gaming_day_start interval;
  v_timezone text;
  v_local_ts timestamptz;
BEGIN
  -- Fetch casino settings (schema-qualified)
  SELECT
    cs.gaming_day_start_time::interval,
    COALESCE(cs.timezone, 'America/Los_Angeles')
  INTO v_gaming_day_start, v_timezone
  FROM public.casino_settings cs
  WHERE cs.casino_id = NEW.casino_id;

  -- Convert occurred_at to casino-local time (paper-form UX: occurred_at, not created_at)
  v_local_ts := COALESCE(NEW.occurred_at, now()) AT TIME ZONE v_timezone;

  -- Delegate to Layer 1 canonical function — no inline boundary logic
  NEW.gaming_day := public.compute_gaming_day(
    v_local_ts,
    COALESCE(v_gaming_day_start, interval '06:00')
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_mtl_entry_set_gaming_day() IS
  'PRD-027: Computes gaming_day via Layer 1 compute_gaming_day(). '
  'Uses occurred_at (paper-form UX). Fetches gaming_day_start_time from public.casino_settings. '
  'Caller contract: triggers use Layer 1 directly with settings lookup. '
  'Replaces inline boundary logic (TEMP-003 violation fix).';


-- ============================================================================
-- STEP 6: Lock down legacy compute_gaming_day(uuid, timestamptz)
-- ============================================================================
-- The Layer 2 overload that accepts p_casino_id is kept for internal callers
-- (other SECURITY DEFINER functions/triggers that already have casino_id).
-- REVOKE from anon/authenticated so it's invisible to PostgREST API schema.
-- Internal callers run as function owner, so REVOKE does not affect them.

REVOKE EXECUTE ON FUNCTION public.compute_gaming_day(uuid, timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.compute_gaming_day(uuid, timestamptz) IS
  'INTERNAL ONLY — Layer 2 legacy overload with explicit casino_id parameter. '
  'Not client-callable (REVOKE''d from anon/authenticated). '
  'Internal triggers and SECURITY DEFINER functions may still call this. '
  'Clients must use rpc_current_gaming_day() instead (ADR-024 INV-8). '
  'PRD-027: Locked down to prevent new client adoption.';


-- ============================================================================
-- NOTIFY POSTGREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================
-- After applying, run:
--   npm run db:types
-- Verify:
--   1. rpc_current_gaming_day appears in generated types
--   2. rpc_gaming_day_range appears in generated types
--   3. compute_gaming_day(uuid, timestamptz) does NOT appear (REVOKE'd)
--   4. compute_gaming_day_for_casino appears in generated types
-- Test:
--   SELECT rpc_current_gaming_day();  -- should return today's gaming day (requires auth context)
--   SELECT * FROM rpc_gaming_day_range(4);  -- should return {start_gd, end_gd}
