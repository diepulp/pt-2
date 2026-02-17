-- ============================================================================
-- Migration: rpc_set_staff_pin — self-contained SECURITY DEFINER RPC
-- Created: 20260210134652
-- Purpose: Fix setPinAction silent RLS failure (ISSUE-SET-PIN-SILENT-RLS-FAILURE)
--
-- Root cause: Template 2b policies (session-var-only, no JWT COALESCE fallback)
-- silently fail when context injection and DML run as separate PostgREST
-- requests (separate transactions). Transaction-local set_config() does not
-- persist across HTTP requests.
--
-- Fix: Self-contained RPC that (1) injects context and (2) performs the write
-- within the same function/transaction. RAISEs on 0 rows affected.
--
-- ADR-030 D5 (INV-030-7): Template 2b writes must use self-contained RPCs.
-- ADR-024 INV-7: calls set_rls_context_from_staff() as first statement.
-- ADR-024 INV-8: no spoofable params — derives staff_id/casino_id from context.
-- ADR-018: SECURITY DEFINER with REVOKE/GRANT privilege lockdown.
--
-- Bounded Context: CasinoService (Foundational) — owns staff table
-- Pattern: Follows rpc_increment_pin_attempt / rpc_clear_pin_attempts precedent
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_set_staff_pin(p_pin_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id  uuid;
  v_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7)
  -- Same transaction — session vars available for the UPDATE below.
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
  -- WRITE: update pin_hash for the calling staff member only
  -- Row-level gating: id + casino_id + active status
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.staff
     SET pin_hash = p_pin_hash
   WHERE id = v_staff_id
     AND casino_id = v_casino_id
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PIN update rejected (0 rows affected)'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_set_staff_pin(text) IS
  'Set PIN hash for the calling staff member. Self-contained RPC: injects context '
  'and writes in the same transaction (ADR-030 D5 INV-030-7). '
  'ADR-024 INV-7/INV-8 compliant: calls set_rls_context_from_staff(), no spoofable params. '
  'p_pin_hash must be pre-hashed (bcrypt) by the server action.';

-- ADR-018: SECURITY DEFINER privilege lockdown
REVOKE ALL ON FUNCTION public.rpc_set_staff_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_set_staff_pin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_staff_pin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
