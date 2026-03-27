-- ============================================================================
-- ADR-040 WS2: Category B Same-Casino Staff Validation
--
-- Add same-casino staff validation for Category B UUID parameters in
-- chip custody RPCs. Rejects cross-tenant staff references per ADR-040 INV-8b.
--
-- RPCs modified (signatures preserved):
--   - rpc_log_table_drop: p_witnessed_by (unconditional)
--   - rpc_log_table_inventory_snapshot: p_verified_by (NULL-guarded)
--   - rpc_request_table_fill: p_delivered_by, p_received_by (unconditional)
--   - rpc_request_table_credit: p_sent_by, p_received_by (unconditional)
-- ============================================================================

-- ============================================================================
-- 1. rpc_log_table_drop — add Category B validation for p_witnessed_by
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_log_table_drop(uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS table_drop_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_drop_event;
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
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table drops', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- ADR-040 INV-8b: Category B same-casino validation
  -- =======================================================================
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_witnessed_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_witnessed_by;
  END IF;
  -- =======================================================================

  INSERT INTO public.table_drop_event (
    casino_id,
    table_id,
    drop_box_id,
    seal_no,
    removed_by,
    witnessed_by,
    removed_at,
    delivered_at,
    delivered_scan_at,
    gaming_day,
    seq_no,
    note
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_drop_box_id,
    p_seal_no,
    v_context_actor_id,
    p_witnessed_by,
    COALESCE(p_removed_at, now()),
    p_delivered_at,
    p_delivered_scan_at,
    p_gaming_day,
    p_seq_no,
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_table_drop(uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_drop(uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text) TO authenticated, service_role;

-- ============================================================================
-- 2. rpc_log_table_inventory_snapshot — add Category B validation for p_verified_by
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_log_table_inventory_snapshot(uuid, text, jsonb, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents integer DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS table_inventory_snapshot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_result table_inventory_snapshot;
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
    RAISE EXCEPTION 'FORBIDDEN: role % cannot log table inventory snapshots', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- ADR-040 INV-8b: Category B same-casino validation (optional param)
  -- =======================================================================
  IF p_verified_by IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_verified_by AND casino_id = v_casino_id) THEN
      RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_verified_by;
    END IF;
  END IF;
  -- =======================================================================

  INSERT INTO public.table_inventory_snapshot (
    casino_id,
    table_id,
    snapshot_type,
    chipset,
    total_cents,
    counted_by,
    verified_by,
    discrepancy_cents,
    note
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_snapshot_type,
    p_chipset,
    (SELECT COALESCE(SUM((key::int) * (value::int)), 0) * 100
     FROM jsonb_each_text(p_chipset)),
    v_context_actor_id,
    p_verified_by,
    COALESCE(p_discrepancy_cents, 0),
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, text, jsonb, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_table_inventory_snapshot(uuid, text, jsonb, uuid, integer, text) TO authenticated, service_role;

-- ============================================================================
-- 3. rpc_request_table_fill — add Category B validation for p_delivered_by, p_received_by
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id uuid;
  v_result table_fill;
  v_report_finalized boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table fills', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- ADR-040 INV-8b: Category B same-casino validation
  -- =======================================================================
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_delivered_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_delivered_by;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_received_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_received_by;
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- PRD-038: Resolve active session via unique_active_session_per_table
  -- INTO STRICT: fails loud on NO_DATA_FOUND or TOO_MANY_ROWS
  -- =======================================================================
  SELECT id INTO STRICT v_session_id
  FROM table_session
  WHERE casino_id = v_casino_id
    AND gaming_table_id = p_table_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  -- =======================================================================
  -- PRD-038: Insert fill with session_id FK
  -- =======================================================================
  INSERT INTO public.table_fill (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    requested_by,
    delivered_by,
    received_by,
    slip_no,
    request_id,
    status,
    session_id
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_delivered_by,
    p_received_by,
    p_slip_no,
    p_request_id,
    'requested',
    v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  -- =======================================================================
  -- PRD-038 D1: Atomic increment session totals
  -- =======================================================================
  UPDATE table_session
  SET fills_total_cents = COALESCE(fills_total_cents, 0) + p_amount_cents
  WHERE id = v_session_id;

  -- =======================================================================
  -- PRD-038: Late-event detection
  -- If session's rundown report is already finalized, flag it
  -- =======================================================================
  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
  FROM table_rundown_report
  WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    -- Monotonic false -> true (never reset)
    UPDATE table_rundown_report
    SET has_late_events = true
    WHERE table_session_id = v_session_id
      AND has_late_events = false;

    -- Audit trail
    INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_casino_id,
      'table-context',
      v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'fill',
        'event_id', v_result.id,
        'session_id', v_session_id,
        'amount_cents', p_amount_cents
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_fill(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- 4. rpc_request_table_credit — add Category B validation for p_sent_by, p_received_by
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_session_id uuid;
  v_result table_credit;
  v_report_finalized boolean;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Defense-in-depth: casino context must be available
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not available';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_context_staff_role IS NULL OR v_context_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot request table credit', v_context_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- ADR-040 INV-8b: Category B same-casino validation
  -- =======================================================================
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_sent_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_sent_by;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_received_by AND casino_id = v_casino_id) THEN
    RAISE EXCEPTION 'SEC-007: staff % does not belong to casino context', p_received_by;
  END IF;
  -- =======================================================================

  -- =======================================================================
  -- PRD-038: Resolve active session
  -- =======================================================================
  SELECT id INTO STRICT v_session_id
  FROM table_session
  WHERE casino_id = v_casino_id
    AND gaming_table_id = p_table_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');

  -- =======================================================================
  -- PRD-038: Insert credit with session_id FK
  -- =======================================================================
  INSERT INTO public.table_credit (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    authorized_by,
    sent_by,
    received_by,
    slip_no,
    request_id,
    status,
    session_id
  )
  VALUES (
    v_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    v_context_actor_id,
    p_sent_by,
    p_received_by,
    p_slip_no,
    p_request_id,
    'requested',
    v_session_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  -- =======================================================================
  -- PRD-038 D1: Atomic increment session totals
  -- =======================================================================
  UPDATE table_session
  SET credits_total_cents = COALESCE(credits_total_cents, 0) + p_amount_cents
  WHERE id = v_session_id;

  -- =======================================================================
  -- PRD-038: Late-event detection
  -- =======================================================================
  SELECT (finalized_at IS NOT NULL) INTO v_report_finalized
  FROM table_rundown_report
  WHERE table_session_id = v_session_id;

  IF v_report_finalized IS TRUE THEN
    UPDATE table_rundown_report
    SET has_late_events = true
    WHERE table_session_id = v_session_id
      AND has_late_events = false;

    INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
    VALUES (
      v_casino_id,
      'table-context',
      v_context_actor_id,
      'LATE_EVENT_AFTER_FINALIZATION',
      jsonb_build_object(
        'event_type', 'credit',
        'event_id', v_result.id,
        'session_id', v_session_id,
        'amount_cents', p_amount_cents
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_table_credit(uuid, jsonb, integer, uuid, uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';
