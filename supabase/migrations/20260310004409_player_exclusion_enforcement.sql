-- =====================================================================
-- EXEC-050 WS6: Player Exclusion Enforcement Guards
--
-- 1. rpc_get_player_exclusion_status — SECURITY DEFINER RPC wrapper
-- 2. rpc_start_or_resume_visit — Add exclusion check (STEP 2.5)
--
-- Cross-context: VisitService RPC amended to call PlayerService helper.
-- =====================================================================

-- =====================================================================
-- 1. RPC Wrapper: rpc_get_player_exclusion_status
--    SECURITY DEFINER, ADR-024 compliant (derives casino_id from context).
-- =====================================================================

-- Drop any existing version to prevent phantom overloads
DROP FUNCTION IF EXISTS public.rpc_get_player_exclusion_status(uuid);

CREATE OR REPLACE FUNCTION public.rpc_get_player_exclusion_status(
  p_player_id uuid
)
RETURNS text  -- 'blocked' | 'alert' | 'watchlist' | 'clear'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_casino_id uuid;
  v_status text;
BEGIN
  -- Context injection (ADR-024)
  PERFORM set_rls_context_from_staff();

  -- Derive casino_id from context (ADR-024 INV-8: never from parameters)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- INTERNAL helper call — single source of truth (AUDIT-C3)
  v_status := get_player_exclusion_status(p_player_id, v_casino_id);

  RETURN v_status;
END;
$function$;

COMMENT ON FUNCTION public.rpc_get_player_exclusion_status(uuid) IS
  'ADR-042: Get collapsed exclusion status for a player. SECURITY DEFINER, derives casino_id from context (ADR-024).';

-- Privilege posture: REVOKE ALL, then GRANT to authenticated
REVOKE ALL ON FUNCTION public.rpc_get_player_exclusion_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_player_exclusion_status(uuid) TO authenticated, service_role;

-- =====================================================================
-- 2. Amend rpc_start_or_resume_visit — Add exclusion enforcement
--    Adds STEP 2.5 between context derivation and gaming day computation.
--    Adds exclusion_warning to return columns (AUDIT-C5: optional text).
-- =====================================================================

-- Must use CREATE OR REPLACE with updated signature
DROP FUNCTION IF EXISTS public.rpc_start_or_resume_visit(uuid);

CREATE OR REPLACE FUNCTION public.rpc_start_or_resume_visit(
  p_player_id uuid
) RETURNS TABLE(
  visit public.visit,
  is_new boolean,
  resumed boolean,
  gaming_day date,
  exclusion_warning text  -- ADR-042: null for clear/monitor, warning message for soft_alert
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_gaming_day date;
  v_existing public.visit;
  v_stale_group uuid;
  v_stale_visit_ids uuid[];
  v_closed_slip_count int := 0;
  v_exclusion_status text;  -- ADR-042
BEGIN
  -- =========================================================================
  -- STEP 1: Context Injection (ADR-024 Required)
  -- =========================================================================
  PERFORM set_rls_context_from_staff();

  -- =========================================================================
  -- STEP 2: Derive Context (NOT from parameters - ADR-024 INV-8)
  -- =========================================================================
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set (app.casino_id required)';
  END IF;

  -- =========================================================================
  -- STEP 2.5: Exclusion Enforcement (ADR-042)
  -- Check before any database mutations.
  -- hard_block: RAISE EXCEPTION (non-bypassable)
  -- soft_alert: Set warning in return payload
  -- monitor/clear: No action
  -- =========================================================================
  v_exclusion_status := get_player_exclusion_status(p_player_id, v_casino_id);

  IF v_exclusion_status = 'blocked' THEN
    RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion';
  END IF;

  -- =========================================================================
  -- STEP 3: Compute Gaming Day (canonical timezone-aware RPC - INV-1)
  -- =========================================================================
  v_gaming_day := compute_gaming_day(v_casino_id, now());

  -- =========================================================================
  -- STEP 4: Check for existing active visit for this gaming day
  -- =========================================================================
  SELECT * INTO v_existing
    FROM public.visit v
   WHERE v.casino_id = v_casino_id
     AND v.player_id = p_player_id
     AND v.gaming_day = v_gaming_day
     AND v.ended_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    exclusion_warning := CASE
      WHEN v_exclusion_status = 'alert' THEN 'Player has active soft_alert exclusion'
      ELSE NULL
    END;
    RETURN NEXT;
    RETURN;
  END IF;

  -- =========================================================================
  -- STEP 5: Close stale active visits from prior gaming days (INV-4)
  -- =========================================================================
  SELECT v.visit_group_id, ARRAY_AGG(v.id)
    INTO v_stale_group, v_stale_visit_ids
    FROM public.visit v
   WHERE v.casino_id = v_casino_id
     AND v.player_id = p_player_id
     AND v.ended_at IS NULL
     AND v.gaming_day <> v_gaming_day
   GROUP BY v.visit_group_id
   ORDER BY MAX(v.started_at) DESC
   LIMIT 1;

  -- =========================================================================
  -- STEP 6: Close rating slips for stale visits (INV-6)
  -- ADR-039 D3: Stale slips get computed_theo_cents = 0 (abandoned, no meaningful theo)
  -- =========================================================================
  IF v_stale_visit_ids IS NOT NULL AND array_length(v_stale_visit_ids, 1) > 0 THEN
    WITH closed_slips AS (
      UPDATE public.rating_slip rs
         SET status = 'closed',
             end_time = now(),
             -- Stale slips: computed_theo_cents = 0 (abandoned, no meaningful theo)
             computed_theo_cents = 0
       WHERE rs.casino_id = v_casino_id
         AND rs.status IN ('open', 'paused')
         AND rs.visit_id = ANY(v_stale_visit_ids)
       RETURNING rs.id
    )
    SELECT COUNT(*) INTO v_closed_slip_count FROM closed_slips;

    -- Close the stale visits
    UPDATE public.visit
       SET ended_at = now()
     WHERE id = ANY(v_stale_visit_ids);
  END IF;

  -- =========================================================================
  -- STEP 7: Create new visit (race safe via unique index)
  -- =========================================================================
  BEGIN
    INSERT INTO public.visit (
      casino_id,
      player_id,
      started_at,
      gaming_day,
      visit_group_id
    )
    VALUES (
      v_casino_id,
      p_player_id,
      now(),
      v_gaming_day,
      COALESCE(v_stale_group, gen_random_uuid())
    )
    RETURNING * INTO v_existing;

  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.visit v
     WHERE v.casino_id = v_casino_id
       AND v.player_id = p_player_id
       AND v.gaming_day = v_gaming_day
       AND v.ended_at IS NULL
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RACE_CONDITION: Could not create or find visit after unique_violation';
    END IF;

    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    exclusion_warning := CASE
      WHEN v_exclusion_status = 'alert' THEN 'Player has active soft_alert exclusion'
      ELSE NULL
    END;
    RETURN NEXT;
    RETURN;
  END;

  -- =========================================================================
  -- STEP 8: Write audit log for rollover
  -- =========================================================================
  IF v_stale_visit_ids IS NOT NULL AND array_length(v_stale_visit_ids, 1) > 0 THEN
    INSERT INTO public.audit_log (
      casino_id,
      actor_id,
      action,
      domain,
      details
    )
    VALUES (
      v_casino_id,
      v_actor_id,
      'visit_rollover',
      'visit',
      jsonb_build_object(
        'gaming_day', v_gaming_day,
        'new_visit_id', v_existing.id,
        'closed_visit_ids', v_stale_visit_ids,
        'closed_slip_count', v_closed_slip_count
      )
    );
  END IF;

  -- Return new visit
  visit := v_existing;
  is_new := true;
  resumed := false;
  gaming_day := v_gaming_day;
  exclusion_warning := CASE
    WHEN v_exclusion_status = 'alert' THEN 'Player has active soft_alert exclusion'
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_start_or_resume_visit(uuid) IS
  'ADR-026: Start/resume visit. ADR-039 D3: stale slips get computed_theo_cents=0. ADR-042: exclusion enforcement.';

GRANT EXECUTE ON FUNCTION public.rpc_start_or_resume_visit(uuid) TO authenticated;

-- =====================================================================
-- 3. PostgREST schema reload
-- =====================================================================

NOTIFY pgrst, 'reload schema';
