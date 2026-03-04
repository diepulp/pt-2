-- ============================================================================
-- Migration: PRD-041 Phase D — FloorLayout Validate-to-Derive
-- Created: 2026-03-03
-- PRD Reference: docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md
-- ADR Reference: ADR-024 (authoritative context derivation)
-- Purpose: Remove p_casino_id from 2 FloorLayout RPCs. Casino scope derived
--          from set_rls_context_from_staff() session vars (v_casino_id).
-- Bounded Context: FloorLayoutService
-- ============================================================================

-- ============================================================================
-- 1. rpc_create_floor_layout — remove p_casino_id
-- ============================================================================

-- DROP old signature (exact param types for phantom overload prevention)
DROP FUNCTION IF EXISTS public.rpc_create_floor_layout(uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_create_floor_layout(
  p_name text,
  p_description text
) RETURNS floor_layout
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_layout_id uuid;
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot create floor layouts', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout (casino_id, name, description, created_by)
  VALUES (v_casino_id, p_name, p_description, v_context_actor_id)
  RETURNING id INTO v_layout_id;

  INSERT INTO public.floor_layout_version (layout_id, version_no, created_by)
  VALUES (v_layout_id, 1, v_context_actor_id);

  RETURN (SELECT fl FROM public.floor_layout fl WHERE fl.id = v_layout_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_floor_layout(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_floor_layout(text, text) TO authenticated, service_role;

-- ============================================================================
-- 2. rpc_activate_floor_layout — remove p_casino_id
-- ============================================================================

-- DROP old signature
DROP FUNCTION IF EXISTS public.rpc_activate_floor_layout(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_activate_floor_layout(
  p_layout_version_id uuid,
  p_request_id text
) RETURNS floor_layout_activation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result floor_layout_activation;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract the validated context
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Staff role authorization
  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot activate floor layouts', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) VALUES (
    v_casino_id, p_layout_version_id, v_context_actor_id, p_request_id
  )
  ON CONFLICT (casino_id, activation_request_id) DO UPDATE
    SET layout_version_id = EXCLUDED.layout_version_id,
        activated_by = EXCLUDED.activated_by,
        activated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_activate_floor_layout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_floor_layout(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';
