-- ============================================================================
-- Migration: Staff PIN rate-limit attempts table
-- Created: 20260210112437
-- Purpose: DB-backed rate limiting for PIN verification (replaces in-memory)
-- Bounded Context: CasinoService (Foundational) — operational rate-limit state, follows audit_log precedent
-- ============================================================================

CREATE TABLE public.staff_pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  attempt_count int NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  window_start timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_staff_pin_attempts_window
  ON public.staff_pin_attempts (casino_id, staff_id, window_start);

CREATE INDEX ix_staff_pin_attempts_window_start
  ON public.staff_pin_attempts (window_start DESC);

COMMENT ON TABLE public.staff_pin_attempts IS
  'Tracks PIN verification attempts per staff member per 15-minute window. '
  'window_start is a floored bucket (date_trunc to 15min), NOT raw now(). '
  'Expired entries (>30 min) pruned lazily inside rpc_increment_pin_attempt().';

-- Atomic increment RPC for race-safe attempt counting.
-- ADR-024 INV-7: calls set_rls_context_from_staff() as first statement.
-- ADR-024 INV-8: no spoofable params — derives staff_id/casino_id from context.
-- ADR-018: SECURITY DEFINER with REVOKE/GRANT privilege lockdown.
-- Includes lazy cleanup of expired windows (>30 min) — Issue A fix.
CREATE FUNCTION public.rpc_increment_pin_attempt()
RETURNS TABLE (attempt_count int, is_limited boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id  uuid;
  v_casino_id uuid;
  v_count     int;
  v_now       timestamptz := now();
  -- Floor to 15-minute bucket: e.g. 14:07 → 14:00, 14:16 → 14:15
  v_window    timestamptz := date_trunc('hour', v_now)
    + (floor(extract(minute FROM v_now)::int / 15) * 15) * interval '1 minute';
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- Derive identity from authoritative context (INV-8: no spoofable params)
  v_staff_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_staff_id IS NULL OR v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- LAZY CLEANUP: prune expired windows (>30 minutes old)
  -- Scoped to calling staff only — no cross-tenant data manipulation.
  -- ═══════════════════════════════════════════════════════════════════════
  DELETE FROM public.staff_pin_attempts
  WHERE staff_id = v_staff_id
    AND casino_id = v_casino_id
    AND window_start < v_now - interval '30 minutes';

  -- ═══════════════════════════════════════════════════════════════════════
  -- ATOMIC UPSERT: increment attempt count within current 15-min bucket
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.staff_pin_attempts (
    casino_id, staff_id, window_start, attempt_count, last_attempt_at
  ) VALUES (v_casino_id, v_staff_id, v_window, 1, v_now)
  ON CONFLICT (casino_id, staff_id, window_start) DO UPDATE
  SET
    attempt_count = staff_pin_attempts.attempt_count + 1,
    last_attempt_at = v_now
  RETURNING staff_pin_attempts.attempt_count INTO v_count;

  RETURN QUERY SELECT v_count, v_count >= 5;
END;
$$;

COMMENT ON FUNCTION public.rpc_increment_pin_attempt() IS
  'Atomically increment PIN attempt count within a 15-minute bucket. '
  'ADR-024 INV-7/INV-8 compliant: calls set_rls_context_from_staff(), no spoofable params. '
  'Includes lazy cleanup of expired windows (>30 min). Returns (attempt_count, is_limited).';

-- ADR-018: SECURITY DEFINER privilege lockdown
REVOKE ALL ON FUNCTION public.rpc_increment_pin_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_increment_pin_attempt() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_increment_pin_attempt() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEAR ATTEMPTS RPC: Called on successful PIN verify to reset attempt count.
-- Same ADR-024 INV-7/INV-8 pattern: zero params, identity from context.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public.rpc_clear_pin_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id  uuid;
  v_casino_id uuid;
BEGIN
  PERFORM public.set_rls_context_from_staff();

  v_staff_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_staff_id IS NULL OR v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.staff_pin_attempts
  WHERE staff_id = v_staff_id
    AND casino_id = v_casino_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_clear_pin_attempts() IS
  'Clear all PIN attempt records for the calling staff member on successful verify. '
  'ADR-024 INV-7/INV-8 compliant: calls set_rls_context_from_staff(), no spoofable params.';

REVOKE ALL ON FUNCTION public.rpc_clear_pin_attempts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_clear_pin_attempts() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_clear_pin_attempts() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE ACCESS CONTROL: No direct DML on staff_pin_attempts.
-- All access via SECURITY DEFINER RPCs (rpc_increment_pin_attempt,
-- rpc_clear_pin_attempts). RLS is enabled but no policies are defined —
-- this means authenticated role has ZERO direct access (RLS defaults to
-- deny-all when enabled with no matching policy).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.staff_pin_attempts ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke direct DML even if RLS were somehow bypassed
REVOKE ALL ON public.staff_pin_attempts FROM authenticated;
REVOKE ALL ON public.staff_pin_attempts FROM anon;

NOTIFY pgrst, 'reload schema';
