-- Migration: PRD-015 WS4 - Casino Operations RPCs Self-Injection
-- Description: Updates casino operations RPCs to call set_rls_context internally
-- Workstream: WS4 - Casino Operations RPC Layer
-- Reference: ADR-015 Phase 1A, ISSUE-5FE4A689
--
-- Problem:
-- Currently, withServerAction middleware calls set_rls_context in one transaction,
-- then the handler makes separate RPC calls in different transactions.
-- In Supabase's transaction mode pooling (port 6543), each RPC may get a different
-- connection, causing the SET LOCAL context to be lost.
--
-- Solution:
-- Update casino operations RPCs to call set_rls_context internally, ensuring context
-- is injected within the same transaction as the operation.
--
-- Pattern: RPC self-injection (Pattern C compliance with JWT fallback)
--
-- Affected RPCs:
-- - rpc_create_floor_layout
-- - rpc_activate_floor_layout

-- ============================================================================
-- rpc_create_floor_layout - Self-injection update
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_floor_layout(
  p_casino_id uuid,
  p_name text,
  p_description text,
  p_created_by uuid
) RETURNS public.floor_layout
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layout_id uuid;
  v_context_casino_id uuid;
  v_context_staff_role text;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );
  PERFORM set_rls_context(p_created_by, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout (casino_id, name, description, created_by)
  VALUES (p_casino_id, p_name, p_description, p_created_by)
  RETURNING id INTO v_layout_id;

  INSERT INTO public.floor_layout_version (layout_id, version_no, created_by)
  VALUES (v_layout_id, 1, p_created_by);

  RETURN (SELECT fl FROM public.floor_layout fl WHERE fl.id = v_layout_id);
END;
$$;

COMMENT ON FUNCTION rpc_create_floor_layout IS
  'Creates floor layout with initial version. ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility. SEC-006 hardened with Template 5 context validation.';

-- ============================================================================
-- rpc_activate_floor_layout - Self-injection update
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_activate_floor_layout(
  p_casino_id uuid,
  p_layout_version_id uuid,
  p_activated_by uuid,
  p_request_id text
) RETURNS public.floor_layout_activation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result floor_layout_activation;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );
  PERFORM set_rls_context(p_activated_by, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- =======================================================================

  INSERT INTO public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) VALUES (
    p_casino_id, p_layout_version_id, p_activated_by, p_request_id
  )
  ON CONFLICT (casino_id, activation_request_id) DO UPDATE
    SET layout_version_id = EXCLUDED.layout_version_id,
        activated_by = EXCLUDED.activated_by,
        activated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_activate_floor_layout IS
  'Activates floor layout version. ADR-015 Phase 1A: Self-injects RLS context via set_rls_context for connection pooling compatibility. SEC-006 hardened with Template 5 context validation.';

-- ============================================================================
-- Migration Completed
-- ============================================================================
-- Both casino operations RPCs now self-inject RLS context within their transactions.
-- This ensures context persists across Supabase's transaction mode connection pooling.
--
-- Per ADR-015 Phase 1A (RPC self-injection pattern)
--
-- Verification:
-- - These RPCs will now work reliably with Supabase transaction mode pooling (port 6543)
-- - Context is injected via set_rls_context() before any RLS-protected operations
-- - JWT fallback ensures compatibility even when SET LOCAL is unavailable
--
-- Next steps (Phase 3):
-- - Monitor for JWT vs. session variable consistency
-- - Once stable, migrate to JWT-only (Pattern A) by removing SET LOCAL
-- - Update service layer to stop passing redundant context parameters
