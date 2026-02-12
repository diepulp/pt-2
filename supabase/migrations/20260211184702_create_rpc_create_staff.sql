-- ============================================================================
-- Migration: PRD-034 WS1 — rpc_create_staff (SECURITY DEFINER)
-- Created: 2026-02-11 18:00:00
-- PRD Reference: docs/10-prd/PRD-034-rls-write-path-remediation-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-034/EXECUTION-SPEC-PRD-034.md
-- ADR References: ADR-024 (INV-7, INV-8), ADR-018 (SECURITY DEFINER),
--                 ADR-030 (D4 write-path session-var enforcement)
-- Markers: ADR-024, ADR-030, ADR-018
--
-- Purpose:
--   Fix active production bug: POST /api/v1/casino/staff did PostgREST DML
--   against Category A table `staff`, which fails silently under transaction
--   pooling. This RPC replaces direct INSERT with a SECURITY DEFINER function
--   that calls set_rls_context_from_staff() for authoritative context.
-- ============================================================================

-- ==========================================================================
-- rpc_create_staff (SECURITY DEFINER)
--
-- Admin-only. Calls set_rls_context_from_staff() for context (INV-7).
-- Derives casino_id from session var (INV-8 — no casino_id parameter).
-- Inserts into staff table + audit_log within same transaction.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_staff(
  p_first_name  text,
  p_last_name   text,
  p_role        staff_role,
  p_employee_id text DEFAULT NULL
)
RETURNS TABLE (id uuid, first_name text, last_name text, role text, status text, employee_id text, casino_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_id   uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (INV-7: all client-callable RPCs must call this)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADMIN ROLE CHECK — only admins can create staff
  -- ═══════════════════════════════════════════════════════════════════════
  IF NULLIF(current_setting('app.staff_role', true), '') != 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive context (authoritative, not from parameters — INV-8)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_first_name IS NULL OR trim(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required'
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  IF p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'last_name is required'
      USING ERRCODE = '22023';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT STAFF — handle constraint violations
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.staff (
      first_name, last_name, role, employee_id, casino_id, status
    ) VALUES (
      trim(p_first_name),
      trim(p_last_name),
      p_role,
      NULLIF(trim(p_employee_id), ''),
      v_casino_id,
      'active'
    )
    RETURNING staff.id INTO v_staff_id;
  EXCEPTION
    WHEN check_violation THEN  -- 23514
      RAISE EXCEPTION 'Staff role constraint violation: %', SQLERRM
        USING ERRCODE = '23514';
    WHEN unique_violation THEN  -- 23505
      RAISE EXCEPTION 'Staff member already exists: %', SQLERRM
        USING ERRCODE = '23505';
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AUDIT LOG — staff_created event
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'casino',
    v_actor_id,
    'staff_created',
    jsonb_build_object(
      'staff_id', v_staff_id,
      'first_name', trim(p_first_name),
      'last_name', trim(p_last_name),
      'role', p_role::text,
      'employee_id', NULLIF(trim(p_employee_id), '')
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — created staff record
  -- ═══════════════════════════════════════════════════════════════════════
  RETURN QUERY
  SELECT
    s.id,
    s.first_name,
    s.last_name,
    s.role::text,
    s.status::text,
    s.employee_id,
    s.casino_id
  FROM public.staff s
  WHERE s.id = v_staff_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_create_staff(text, text, staff_role, text) IS
  'PRD-034: Create staff member via SECURITY DEFINER RPC. Admin-only via '
  'set_rls_context_from_staff() (INV-7). Derives casino_id from context (INV-8). '
  'Replaces broken PostgREST DML on Category A staff table.';

-- Explicit owner (ADR-018: SECURITY DEFINER must have explicit owner)
ALTER FUNCTION public.rpc_create_staff(text, text, staff_role, text) OWNER TO postgres;

-- Grants: only authenticated (not anon, not PUBLIC)
REVOKE ALL ON FUNCTION public.rpc_create_staff(text, text, staff_role, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_staff(text, text, staff_role, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_staff(text, text, staff_role, text) TO authenticated;

-- PostgREST schema reload
NOTIFY pgrst, 'reload schema';
