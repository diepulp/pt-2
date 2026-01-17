-- ============================================================================
-- Migration: ADR-026 rpc_start_or_resume_visit
-- ============================================================================
-- Purpose: Implement SECURITY DEFINER RPC for gaming-day-scoped visit management
--
-- This RPC:
--   1. Resumes an existing active visit for the current gaming day (resumed=true)
--   2. OR closes stale visits from prior gaming days and creates new visit (is_new=true)
--   3. Handles race conditions via unique_violation exception handling
--   4. Writes audit_log entry for rollover events
--
-- Reference: ADR-026-gaming-day-scoped-visits.md, EXECUTION-SPEC-ADR-026-PATCH.md
-- Security:
--   - SECURITY DEFINER with SET search_path TO 'public'
--   - Calls set_rls_context_from_staff() at start (ADR-024)
--   - Derives casino_id/actor_id from context (INV-8: no spoofable params)
--   - Uses compute_gaming_day() canonical timezone-aware RPC (INV-1)
--
-- Invariants:
--   INV-1: Visit gaming_day computed via compute_gaming_day(casino_id, now())
--   INV-2: At most one active visit per (casino_id, player_id, gaming_day) tuple
--   INV-4: Stale visit closure is automatic on new gaming day seat action
--   INV-5: visit_group_id preserves multi-day player history linkage
--   INV-6: Rating slips do not span gaming days (closed at rollover)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_start_or_resume_visit(
  p_player_id uuid
) RETURNS TABLE(
  visit public.visit,
  is_new boolean,
  resumed boolean,
  gaming_day date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_gaming_day date;
  v_existing public.visit;
  v_stale_group uuid;
  v_stale_visit_ids uuid[];
  v_closed_slip_count int := 0;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 1: Context Injection (ADR-024 Required)
  -- Derives actor_id, casino_id, staff_role from auth.uid() binding to staff
  -- ═══════════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 2: Derive Context (NOT from parameters - ADR-024 INV-8)
  -- ═══════════════════════════════════════════════════════════════════════════
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set (app.casino_id required)';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 3: Compute Gaming Day (canonical timezone-aware RPC - INV-1)
  -- ═══════════════════════════════════════════════════════════════════════════
  v_gaming_day := compute_gaming_day(v_casino_id, now());

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 4: Check for existing active visit for this gaming day
  -- If found, return it (resume scenario)
  -- ═══════════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing
    FROM public.visit v
   WHERE v.casino_id = v_casino_id
     AND v.player_id = p_player_id
     AND v.gaming_day = v_gaming_day
     AND v.ended_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    -- Return existing visit (resumed)
    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 5: Close stale active visits from prior gaming days (INV-4)
  -- Capture visit_group_id for continuity (INV-5)
  -- ═══════════════════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 6: Close rating slips for stale visits (INV-6)
  -- Rating slips do not span gaming days
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_stale_visit_ids IS NOT NULL AND array_length(v_stale_visit_ids, 1) > 0 THEN
    -- Close any open/paused rating slips on stale visits
    WITH closed_slips AS (
      UPDATE public.rating_slip rs
         SET status = 'closed',
             end_time = now()
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 7: Create new visit (race safe via unique index)
  -- Use visit_group_id from stale visit or generate new one (INV-5)
  -- ═══════════════════════════════════════════════════════════════════════════
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
    -- Race condition: another request created the visit first
    -- Retrieve the existing visit (this is idempotent)
    SELECT * INTO v_existing
      FROM public.visit v
     WHERE v.casino_id = v_casino_id
       AND v.player_id = p_player_id
       AND v.gaming_day = v_gaming_day
       AND v.ended_at IS NULL
     LIMIT 1;

    -- If still not found (shouldn't happen), raise error
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RACE_CONDITION: Could not create or find visit after unique_violation';
    END IF;

    -- Return as resumed since another request created it
    visit := v_existing;
    is_new := false;
    resumed := true;
    gaming_day := v_gaming_day;
    RETURN NEXT;
    RETURN;
  END;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 8: Write audit log for rollover (if stale visits were closed)
  -- ═══════════════════════════════════════════════════════════════════════════
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
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_start_or_resume_visit(uuid) IS
  'ADR-026: Start a new gaming-day-scoped visit or resume an existing one. '
  'SECURITY DEFINER with ADR-024 context injection. '
  'Automatically closes stale visits from prior gaming days and their rating slips. '
  'Returns visit record with is_new/resumed flags and gaming_day.';

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.rpc_start_or_resume_visit(uuid) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
