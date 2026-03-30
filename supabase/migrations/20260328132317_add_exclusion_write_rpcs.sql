-- ============================================================================
-- ISS-EXCL-001: Player Exclusion Write RPCs (RLS Boundary Repair)
-- Created: 2026-03-28
-- Purpose: Two SECURITY DEFINER RPCs that bundle context injection + DML
--          in a single transaction, fixing the RLS 42501 failure where
--          SET LOCAL vars expired between separate HTTP requests.
--
-- ADR References:
--   ADR-018: SECURITY DEFINER governance (Template 5)
--   ADR-024: Authoritative context derivation (INV-8: no spoofable params)
--   ADR-030: Auth pipeline hardening (D4: session-var-only writes)
--
-- Tables affected: player_exclusion (critical table per ADR-030 D4)
-- ============================================================================

-- ============================================================================
-- 1. rpc_create_player_exclusion
--    Creates a new exclusion record. casino_id and created_by derived from
--    RLS context (not parameters). Requires pit_boss or admin role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_player_exclusion(
  p_player_id       uuid,
  p_exclusion_type  text,
  p_enforcement     text,
  p_reason          text,
  p_effective_from  timestamptz DEFAULT NULL,
  p_effective_until timestamptz DEFAULT NULL,
  p_review_date     timestamptz DEFAULT NULL,
  p_external_ref    text        DEFAULT NULL,
  p_jurisdiction    text        DEFAULT NULL
)
RETURNS SETOF player_exclusion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
BEGIN
  -- STEP 1: Context injection (ADR-024, ADR-018 Template 5)
  PERFORM set_rls_context_from_staff();

  -- STEP 2: Derive context from session vars (ADR-024 INV-8: NOT from parameters)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role',  true), '');

  -- STEP 3: Validate context is set (ADR-030 INV-030-5)
  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 4: Role authorization — pit_boss or admin only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role "%" cannot create exclusions', COALESCE(v_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 5: INSERT with context-derived fields
  RETURN QUERY
  INSERT INTO player_exclusion (
    player_id, casino_id, created_by,
    exclusion_type, enforcement, reason,
    effective_from, effective_until, review_date,
    external_ref, jurisdiction
  ) VALUES (
    p_player_id, v_casino_id, v_actor_id,
    p_exclusion_type, p_enforcement, p_reason,
    COALESCE(p_effective_from, now()), p_effective_until, p_review_date,
    p_external_ref, p_jurisdiction
  )
  RETURNING *;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) IS
  'ISS-EXCL-001: Create player exclusion. SECURITY DEFINER, derives casino_id/created_by from RLS context (ADR-024). Requires pit_boss or admin role.';

-- Privilege posture: REVOKE all, GRANT to authenticated + service_role
REVOKE ALL ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_player_exclusion(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) TO authenticated, service_role;


-- ============================================================================
-- 2. rpc_lift_player_exclusion
--    Lifts (soft-deletes) an existing exclusion. actor_id derived from RLS
--    context (not parameters). Requires admin role only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_lift_player_exclusion(
  p_exclusion_id  uuid,
  p_lift_reason   text
)
RETURNS SETOF player_exclusion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_existing   RECORD;
  v_count      int;
BEGIN
  -- STEP 1: Context injection (ADR-024, ADR-018 Template 5)
  PERFORM set_rls_context_from_staff();

  -- STEP 2: Derive context from session vars (ADR-024 INV-8: NOT from parameters)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role',  true), '');

  -- STEP 3: Validate context is set (ADR-030 INV-030-5)
  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 4: Role authorization — admin only
  IF v_staff_role IS NULL OR v_staff_role != 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: role "%" cannot lift exclusions', COALESCE(v_staff_role, 'none')
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 5: Validate lift_reason is non-empty
  IF TRIM(COALESCE(p_lift_reason, '')) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: lift_reason is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 6: Pre-check for clean domain errors
  SELECT id, lifted_at, casino_id INTO v_existing
  FROM player_exclusion WHERE id = p_exclusion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: exclusion does not exist'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.casino_id != v_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: cross-casino access denied'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.lifted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: exclusion already lifted'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 7: UPDATE with tenant guard + active-row guard in WHERE
  RETURN QUERY
  UPDATE player_exclusion
  SET lifted_at    = now(),
      lifted_by    = v_actor_id,
      lift_reason  = p_lift_reason
  WHERE id         = p_exclusion_id
    AND casino_id  = v_casino_id
    AND lifted_at  IS NULL
  RETURNING *;

  -- STEP 8: Post-update consistency check
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'INTERNAL_ERROR: pre-check and DML disagree — possible race condition'
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.rpc_lift_player_exclusion(uuid, text) IS
  'ISS-EXCL-001: Lift (soft-delete) player exclusion. SECURITY DEFINER, derives actor_id from RLS context (ADR-024). Requires admin role. Sets lifted_at, lifted_by, lift_reason.';

-- Privilege posture: REVOKE all, GRANT to authenticated + service_role
REVOKE ALL ON FUNCTION public.rpc_lift_player_exclusion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_lift_player_exclusion(uuid, text) TO authenticated, service_role;


-- ============================================================================
-- 3. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
