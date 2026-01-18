-- ============================================================================
-- ADR-027 WS3: RPC - Table Rundown Computation
-- ============================================================================
-- Implements rpc_compute_table_rundown and rpc_post_table_drop_total.
--
-- Key behaviors (PATCHED spec):
-- 1. Drop posting persists drop_total_cents AND sets drop_posted_at
-- 2. Rundown returns NULL for table_win_cents when drop is not posted
-- 3. Opening/closing totals come from table_inventory_snapshot.total_cents
--
-- Bounded Context: TableContextService (SRM v4.10.0)
-- ADR References: ADR-027 (visibility slice), ADR-024 (context injection)
-- ============================================================================

-- ============================================================================
-- rpc_post_table_drop_total - Persist drop amount and mark as posted
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_post_table_drop_total(
  p_session_id uuid,
  p_drop_total_cents integer
) RETURNS public.table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_session public.table_session;
BEGIN
  -- ADR-024: Context injection
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Missing casino context'
      USING ERRCODE = 'P0001',
            HINT = 'Casino context not set. Ensure staff is authenticated.';
  END IF;

  -- Update session with drop total and mark as posted
  UPDATE public.table_session
     SET drop_total_cents = p_drop_total_cents,
         drop_posted_at = now()
   WHERE id = p_session_id
     AND casino_id = v_casino_id
   RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not in casino scope'
      USING ERRCODE = 'P0002',
            HINT = 'Verify session exists and belongs to the current casino';
  END IF;

  RETURN v_session;
END;
$$;

COMMENT ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) IS
  'Posts the drop total for a table session and marks drop_posted_at. Visibility slice (ADR-027).';

GRANT EXECUTE ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) TO authenticated;

-- ============================================================================
-- rpc_compute_table_rundown - Compute rundown components and optional win
-- ============================================================================
-- Returns NULL for table_win_cents when drop is not posted (PATCHED behavior)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_compute_table_rundown(
  p_session_id uuid
) RETURNS TABLE(
  session_id uuid,
  opening_total_cents integer,
  closing_total_cents integer,
  fills_total_cents integer,
  credits_total_cents integer,
  drop_total_cents integer,
  table_win_cents integer,
  drop_posted_at timestamptz,
  table_bank_mode table_bank_mode,
  need_total_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_session public.table_session;
  v_opening integer;
  v_closing integer;
BEGIN
  -- ADR-024: Context injection
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Missing casino context'
      USING ERRCODE = 'P0001',
            HINT = 'Casino context not set. Ensure staff is authenticated.';
  END IF;

  -- Get session with casino scope validation
  SELECT *
    INTO v_session
    FROM public.table_session
   WHERE id = p_session_id
     AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not in casino scope'
      USING ERRCODE = 'P0002',
            HINT = 'Verify session exists and belongs to the current casino';
  END IF;

  -- Opening snapshot total (prefer total_cents column, fallback to chipset JSON math)
  SELECT COALESCE(tis.total_cents,
    (SELECT COALESCE(SUM((value->>'count')::int * key::int), 0)
     FROM jsonb_each(tis.chipset))::integer
  ) INTO v_opening
  FROM public.table_inventory_snapshot tis
  WHERE tis.session_id = p_session_id
    AND tis.snapshot_type IN ('OPENING', 'open')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  -- If no session_id match, try via opening_inventory_snapshot_id
  IF v_opening IS NULL AND v_session.opening_inventory_snapshot_id IS NOT NULL THEN
    SELECT COALESCE(tis.total_cents,
      (SELECT COALESCE(SUM((value->>'count')::int * key::int), 0)
       FROM jsonb_each(tis.chipset))::integer
    ) INTO v_opening
    FROM public.table_inventory_snapshot tis
    WHERE tis.id = v_session.opening_inventory_snapshot_id;
  END IF;

  -- Closing snapshot total
  SELECT COALESCE(tis.total_cents,
    (SELECT COALESCE(SUM((value->>'count')::int * key::int), 0)
     FROM jsonb_each(tis.chipset))::integer
  ) INTO v_closing
  FROM public.table_inventory_snapshot tis
  WHERE tis.session_id = p_session_id
    AND tis.snapshot_type IN ('CLOSING', 'close')
  ORDER BY tis.created_at DESC
  LIMIT 1;

  -- If no session_id match, try via closing_inventory_snapshot_id
  IF v_closing IS NULL AND v_session.closing_inventory_snapshot_id IS NOT NULL THEN
    SELECT COALESCE(tis.total_cents,
      (SELECT COALESCE(SUM((value->>'count')::int * key::int), 0)
       FROM jsonb_each(tis.chipset))::integer
    ) INTO v_closing
    FROM public.table_inventory_snapshot tis
    WHERE tis.id = v_session.closing_inventory_snapshot_id;
  END IF;

  -- Return component totals (even if count pending)
  session_id := v_session.id;
  opening_total_cents := COALESCE(v_opening, 0);
  closing_total_cents := COALESCE(v_closing, 0);
  fills_total_cents := COALESCE(v_session.fills_total_cents, 0);
  credits_total_cents := COALESCE(v_session.credits_total_cents, 0);
  drop_total_cents := v_session.drop_total_cents;
  drop_posted_at := v_session.drop_posted_at;
  table_bank_mode := v_session.table_bank_mode;
  need_total_cents := v_session.need_total_cents;

  -- PATCHED: Honest win - only compute when drop is posted AND drop_total exists
  -- Formula: win = closing + credits + drop - opening - fills
  IF v_session.drop_posted_at IS NULL OR v_session.drop_total_cents IS NULL THEN
    table_win_cents := NULL;
  ELSE
    table_win_cents :=
      COALESCE(v_closing, 0)
      + COALESCE(v_session.credits_total_cents, 0)
      + v_session.drop_total_cents
      - COALESCE(v_opening, 0)
      - COALESCE(v_session.fills_total_cents, 0);
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_compute_table_rundown(uuid) IS
  'Returns rundown components and win/loss. Returns table_win_cents=NULL when drop is not posted (ADR-027 PATCHED).';

GRANT EXECUTE ON FUNCTION public.rpc_compute_table_rundown(uuid) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
