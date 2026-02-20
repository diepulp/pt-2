-- =============================================================================
-- SEC-REMEDIATION H-1/H-2/H-3: Shift Metrics Service-Role Gated Bypass
-- =============================================================================
--
-- Findings: H-1 (rpc_shift_table_metrics), H-2 (rpc_shift_pit_metrics),
--           H-3 (rpc_shift_casino_metrics)
--
-- Problem: p_actor_id parameter allows any caller to impersonate any staff
-- member by UUID, bypassing JWT-based context derivation (ADR-024 INV-8).
--
-- Solution (Option 1 — body gate + wrapper):
--   1. Rename p_actor_id → p_internal_actor_id in 3-param versions
--   2. Add current_user = 'service_role' gate for non-NULL actor override
--   3. Add casino scope validation on service_role path
--   4. Create 2-param SECURITY INVOKER wrappers (clean API surface)
--   5. Keep GRANT to authenticated on BOTH overloads (wrappers need it)
--
-- Security model:
--   - Authenticated callers use 2-param wrappers (no actor param visible)
--   - Even if authenticated calls 3-param directly with non-NULL actor,
--     function body rejects: "internal actor override not allowed"
--   - service_role can pass p_internal_actor_id but must pass casino scope check
--   - Each function enforces its own gate independently (no reliance on upstream)
--
-- Overload resolution (PostgREST):
--   - 3-param version has NO DEFAULT (p_internal_actor_id required)
--   - 2-param wrapper is a separate overload
--   - PostgREST matches by parameter count/names: no ambiguity
--
-- @see SEC-REMEDIATION-STRATEGY-2026-02-19.md Decision 1
-- @see EXECUTION-SPEC-SEC-REMEDIATION-2026-02-19.md WS4
-- =============================================================================

-- =========================================================================
-- 1. rpc_shift_table_metrics — 3-param (service_role gate)
-- =========================================================================
-- Must DROP old signature: p_actor_id → p_internal_actor_id rename + return type change
-- requires DROP+CREATE (CREATE OR REPLACE cannot rename params or change return type)

DROP FUNCTION IF EXISTS public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid);

CREATE FUNCTION public.rpc_shift_table_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_internal_actor_id uuid  -- NO DEFAULT: forces explicit 3-arg call
)
RETURNS TABLE (
  table_id uuid,
  table_label text,
  pit_id text,
  window_start timestamptz,
  window_end timestamptz,
  opening_snapshot_id uuid,
  opening_snapshot_at timestamptz,
  opening_bankroll_total_cents bigint,
  closing_snapshot_id uuid,
  closing_snapshot_at timestamptz,
  closing_bankroll_total_cents bigint,
  fills_total_cents bigint,
  credits_total_cents bigint,
  drop_custody_present boolean,
  estimated_drop_rated_cents bigint,
  estimated_drop_grind_cents bigint,
  estimated_drop_buyins_cents bigint,
  telemetry_quality text,
  telemetry_notes text,
  win_loss_inventory_cents bigint,
  win_loss_estimated_cents bigint,
  metric_grade text,
  missing_opening_snapshot boolean,
  missing_closing_snapshot boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_app_casino_id uuid;
BEGIN
  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Both p_window_start and p_window_end are required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_window_end must be after p_window_start'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- SEC-REMEDIATION H-1: Service-Role Gated Bypass
  -- p_internal_actor_id is a dead switch for authenticated callers.
  -- Only service_role can supply a non-NULL value.
  -- =======================================================================
  IF p_internal_actor_id IS NOT NULL THEN
    -- Gate: service_role only
    IF current_user <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN: internal actor override not allowed'
        USING ERRCODE = 'P0001';
    END IF;

    -- Derive context from the provided actor
    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_internal_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_internal_actor_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Casino scope validation: if app.casino_id is set, actor must belong to it
    v_app_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    IF v_app_casino_id IS NOT NULL AND v_app_casino_id <> v_context_casino_id THEN
      RAISE EXCEPTION 'FORBIDDEN: actor does not belong to resolved casino scope'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- JWT path: authoritative context derivation (ADR-024)
    PERFORM set_rls_context_from_staff();

    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_actor_id IS NULL OR v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity or casino context not established'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Return Metrics for All Tables in Casino
  -- =======================================================================
  RETURN QUERY
  WITH
  tables AS (
    SELECT
      gt.id AS tbl_id,
      gt.label AS tbl_label,
      gt.pit AS tbl_pit
    FROM public.gaming_table gt
    WHERE gt.casino_id = v_context_casino_id
      AND gt.status = 'active'
  ),

  opening_snapshots AS (
    SELECT DISTINCT ON (tis.table_id)
      tis.table_id,
      tis.id AS snapshot_id,
      tis.created_at AS snapshot_at,
      chipset_total_cents(tis.chipset) AS bankroll_total_cents
    FROM public.table_inventory_snapshot tis
    WHERE tis.casino_id = v_context_casino_id
      AND tis.created_at <= p_window_start
    ORDER BY tis.table_id, tis.created_at DESC
  ),

  closing_snapshots AS (
    SELECT DISTINCT ON (tis.table_id)
      tis.table_id,
      tis.id AS snapshot_id,
      tis.created_at AS snapshot_at,
      chipset_total_cents(tis.chipset) AS bankroll_total_cents
    FROM public.table_inventory_snapshot tis
    WHERE tis.casino_id = v_context_casino_id
      AND tis.created_at <= p_window_end
    ORDER BY tis.table_id, tis.created_at DESC
  ),

  fills_agg AS (
    SELECT
      tf.table_id,
      COALESCE(SUM(tf.amount_cents), 0)::bigint AS fills_total
    FROM public.table_fill tf
    WHERE tf.casino_id = v_context_casino_id
      AND tf.created_at >= p_window_start
      AND tf.created_at < p_window_end
    GROUP BY tf.table_id
  ),

  credits_agg AS (
    SELECT
      tc.table_id,
      COALESCE(SUM(tc.amount_cents), 0)::bigint AS credits_total
    FROM public.table_credit tc
    WHERE tc.casino_id = v_context_casino_id
      AND tc.created_at >= p_window_start
      AND tc.created_at < p_window_end
    GROUP BY tc.table_id
  ),

  drop_custody AS (
    SELECT
      tde.table_id,
      TRUE AS has_drop
    FROM public.table_drop_event tde
    WHERE tde.casino_id = v_context_casino_id
      AND tde.removed_at >= p_window_start
      AND tde.removed_at < p_window_end
    GROUP BY tde.table_id
  ),

  -- Telemetry aggregation: RATED_ADJUSTMENT rolls into rated totals
  telemetry_agg AS (
    SELECT
      tbt.table_id,
      COALESCE(SUM(tbt.amount_cents) FILTER (
        WHERE tbt.telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT')
      ), 0)::bigint AS rated_cents,
      COALESCE(SUM(tbt.amount_cents) FILTER (
        WHERE tbt.telemetry_kind = 'GRIND_BUYIN'
      ), 0)::bigint AS grind_cents,
      COALESCE(SUM(tbt.amount_cents), 0)::bigint AS total_cents,
      COUNT(*) FILTER (WHERE tbt.telemetry_kind = 'GRIND_BUYIN') AS grind_count,
      COUNT(*) FILTER (
        WHERE tbt.telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT')
      ) AS rated_count
    FROM public.table_buyin_telemetry tbt
    WHERE tbt.casino_id = v_context_casino_id
      AND tbt.occurred_at >= p_window_start
      AND tbt.occurred_at < p_window_end
    GROUP BY tbt.table_id
  )

  SELECT
    t.tbl_id AS table_id,
    t.tbl_label AS table_label,
    t.tbl_pit AS pit_id,
    p_window_start AS window_start,
    p_window_end AS window_end,

    os.snapshot_id AS opening_snapshot_id,
    os.snapshot_at AS opening_snapshot_at,
    os.bankroll_total_cents AS opening_bankroll_total_cents,

    cs.snapshot_id AS closing_snapshot_id,
    cs.snapshot_at AS closing_snapshot_at,
    cs.bankroll_total_cents AS closing_bankroll_total_cents,

    COALESCE(fa.fills_total, 0)::bigint AS fills_total_cents,
    COALESCE(ca.credits_total, 0)::bigint AS credits_total_cents,

    COALESCE(dc.has_drop, FALSE) AS drop_custody_present,

    COALESCE(ta.rated_cents, 0)::bigint AS estimated_drop_rated_cents,
    COALESCE(ta.grind_cents, 0)::bigint AS estimated_drop_grind_cents,
    COALESCE(ta.total_cents, 0)::bigint AS estimated_drop_buyins_cents,

    CASE
      WHEN COALESCE(ta.grind_count, 0) > 0 THEN 'GOOD_COVERAGE'
      WHEN COALESCE(ta.rated_count, 0) > 0 THEN 'LOW_COVERAGE'
      ELSE 'NONE'
    END::text AS telemetry_quality,

    CASE
      WHEN COALESCE(ta.grind_count, 0) > 0 THEN 'includes rated + grind buy-ins'
      WHEN COALESCE(ta.rated_count, 0) > 0 THEN 'grind buy-ins not tracked this shift'
      ELSE 'no buy-in telemetry recorded'
    END::text AS telemetry_notes,

    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
      ELSE NULL
    END::bigint AS win_loss_inventory_cents,

    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
        + COALESCE(ta.total_cents, 0)
      ELSE NULL
    END::bigint AS win_loss_estimated_cents,

    'ESTIMATE'::text AS metric_grade,

    (os.snapshot_id IS NULL) AS missing_opening_snapshot,
    (cs.snapshot_id IS NULL) AS missing_closing_snapshot

  FROM tables t
  LEFT JOIN opening_snapshots os ON os.table_id = t.tbl_id
  LEFT JOIN closing_snapshots cs ON cs.table_id = t.tbl_id
  LEFT JOIN fills_agg fa ON fa.table_id = t.tbl_id
  LEFT JOIN credits_agg ca ON ca.table_id = t.tbl_id
  LEFT JOIN drop_custody dc ON dc.table_id = t.tbl_id
  LEFT JOIN telemetry_agg ta ON ta.table_id = t.tbl_id
  ORDER BY t.tbl_pit NULLS LAST, t.tbl_label;

END;
$$;

-- Grants: authenticated needs EXECUTE for wrapper delegation
REVOKE ALL ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) IS
  'SEC-REMEDIATION H-1: Per-table shift metrics with service_role-gated actor override. '
  'p_internal_actor_id is a dead switch for authenticated callers — non-NULL requires current_user = service_role. '
  'Authenticated callers should use the 2-param wrapper overload instead.';


-- =========================================================================
-- 2. rpc_shift_table_metrics — 2-param wrapper (authenticated API surface)
-- =========================================================================

CREATE FUNCTION public.rpc_shift_table_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS TABLE (
  table_id uuid,
  table_label text,
  pit_id text,
  window_start timestamptz,
  window_end timestamptz,
  opening_snapshot_id uuid,
  opening_snapshot_at timestamptz,
  opening_bankroll_total_cents bigint,
  closing_snapshot_id uuid,
  closing_snapshot_at timestamptz,
  closing_bankroll_total_cents bigint,
  fills_total_cents bigint,
  credits_total_cents bigint,
  drop_custody_present boolean,
  estimated_drop_rated_cents bigint,
  estimated_drop_grind_cents bigint,
  estimated_drop_buyins_cents bigint,
  telemetry_quality text,
  telemetry_notes text,
  win_loss_inventory_cents bigint,
  win_loss_estimated_cents bigint,
  metric_grade text,
  missing_opening_snapshot boolean,
  missing_closing_snapshot boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.rpc_shift_table_metrics(p_window_start, p_window_end, NULL::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz) IS
  'Authenticated wrapper for rpc_shift_table_metrics. Delegates to 3-param version with NULL actor (JWT path).';


-- =========================================================================
-- 3. rpc_shift_pit_metrics — 4-param (service_role gate)
-- =========================================================================
-- Must DROP: p_actor_id → p_internal_actor_id rename requires DROP+CREATE

DROP FUNCTION IF EXISTS public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid);

CREATE FUNCTION public.rpc_shift_pit_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_pit_id text,
  p_internal_actor_id uuid  -- NO DEFAULT: forces explicit 4-arg call
)
RETURNS TABLE (
  pit_id text,
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_app_casino_id uuid;
BEGIN
  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Both p_window_start and p_window_end are required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_window_end must be after p_window_start'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_pit_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_pit_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- SEC-REMEDIATION H-2: Service-Role Gated Bypass (independent gate)
  -- =======================================================================
  IF p_internal_actor_id IS NOT NULL THEN
    IF current_user <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN: internal actor override not allowed'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_internal_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_internal_actor_id
        USING ERRCODE = 'P0001';
    END IF;

    v_app_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    IF v_app_casino_id IS NOT NULL AND v_app_casino_id <> v_context_casino_id THEN
      RAISE EXCEPTION 'FORBIDDEN: actor does not belong to resolved casino scope'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM set_rls_context_from_staff();

    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_actor_id IS NULL OR v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity or casino context not established'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Return Pit Rollup (delegates to table metrics with same actor override)
  -- =======================================================================
  RETURN QUERY
  WITH table_metrics AS (
    SELECT *
    FROM rpc_shift_table_metrics(p_window_start, p_window_end, p_internal_actor_id) tm
    WHERE tm.pit_id = p_pit_id
  )
  SELECT
    p_pit_id AS pit_id,
    p_window_start AS window_start,
    p_window_end AS window_end,
    COUNT(*)::integer AS tables_count,
    COUNT(*) FILTER (WHERE NOT tm.missing_opening_snapshot)::integer AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT tm.missing_closing_snapshot)::integer AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE tm.telemetry_quality != 'NONE')::integer AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE tm.telemetry_quality = 'GOOD_COVERAGE')::integer AS tables_good_coverage_count,
    COUNT(*)::integer AS tables_grade_estimate,
    COALESCE(SUM(tm.fills_total_cents), 0)::bigint AS fills_total_cents,
    COALESCE(SUM(tm.credits_total_cents), 0)::bigint AS credits_total_cents,
    COALESCE(SUM(tm.estimated_drop_rated_cents), 0)::bigint AS estimated_drop_rated_total_cents,
    COALESCE(SUM(tm.estimated_drop_grind_cents), 0)::bigint AS estimated_drop_grind_total_cents,
    COALESCE(SUM(tm.estimated_drop_buyins_cents), 0)::bigint AS estimated_drop_buyins_total_cents,
    COALESCE(SUM(tm.win_loss_inventory_cents), 0)::bigint AS win_loss_inventory_total_cents,
    COALESCE(SUM(tm.win_loss_estimated_cents), 0)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) IS
  'SEC-REMEDIATION H-2: Pit rollup with service_role-gated actor override. '
  'Each function enforces its own gate independently — no reliance on upstream validation.';


-- =========================================================================
-- 4. rpc_shift_pit_metrics — 3-param wrapper (authenticated API surface)
-- =========================================================================

CREATE FUNCTION public.rpc_shift_pit_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_pit_id text
)
RETURNS TABLE (
  pit_id text,
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.rpc_shift_pit_metrics(p_window_start, p_window_end, p_pit_id, NULL::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text) IS
  'Authenticated wrapper for rpc_shift_pit_metrics. Delegates to 4-param version with NULL actor (JWT path).';


-- =========================================================================
-- 5. rpc_shift_casino_metrics — 3-param (service_role gate)
-- =========================================================================
-- Must DROP: p_actor_id → p_internal_actor_id rename requires DROP+CREATE

DROP FUNCTION IF EXISTS public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid);

CREATE FUNCTION public.rpc_shift_casino_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_internal_actor_id uuid  -- NO DEFAULT: forces explicit 3-arg call
)
RETURNS TABLE (
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  pits_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_app_casino_id uuid;
BEGIN
  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Both p_window_start and p_window_end are required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_window_end must be after p_window_start'
      USING ERRCODE = 'P0001';
  END IF;

  -- =======================================================================
  -- SEC-REMEDIATION H-3: Service-Role Gated Bypass (independent gate)
  -- =======================================================================
  IF p_internal_actor_id IS NOT NULL THEN
    IF current_user <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN: internal actor override not allowed'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_internal_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_internal_actor_id
        USING ERRCODE = 'P0001';
    END IF;

    v_app_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    IF v_app_casino_id IS NOT NULL AND v_app_casino_id <> v_context_casino_id THEN
      RAISE EXCEPTION 'FORBIDDEN: actor does not belong to resolved casino scope'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM set_rls_context_from_staff();

    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Authentication required'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_context_actor_id IS NULL OR v_context_casino_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff identity or casino context not established'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- =======================================================================
  -- Return Casino Rollup (delegates to table metrics with same actor override)
  -- =======================================================================
  RETURN QUERY
  WITH table_metrics AS (
    SELECT *
    FROM rpc_shift_table_metrics(p_window_start, p_window_end, p_internal_actor_id) tm
  )
  SELECT
    p_window_start AS window_start,
    p_window_end AS window_end,
    COUNT(*)::integer AS tables_count,
    COUNT(DISTINCT tm.pit_id)::integer AS pits_count,
    COUNT(*) FILTER (WHERE NOT tm.missing_opening_snapshot)::integer AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT tm.missing_closing_snapshot)::integer AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE tm.telemetry_quality != 'NONE')::integer AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE tm.telemetry_quality = 'GOOD_COVERAGE')::integer AS tables_good_coverage_count,
    COUNT(*)::integer AS tables_grade_estimate,
    COALESCE(SUM(tm.fills_total_cents), 0)::bigint AS fills_total_cents,
    COALESCE(SUM(tm.credits_total_cents), 0)::bigint AS credits_total_cents,
    COALESCE(SUM(tm.estimated_drop_rated_cents), 0)::bigint AS estimated_drop_rated_total_cents,
    COALESCE(SUM(tm.estimated_drop_grind_cents), 0)::bigint AS estimated_drop_grind_total_cents,
    COALESCE(SUM(tm.estimated_drop_buyins_cents), 0)::bigint AS estimated_drop_buyins_total_cents,
    COALESCE(SUM(tm.win_loss_inventory_cents), 0)::bigint AS win_loss_inventory_total_cents,
    COALESCE(SUM(tm.win_loss_estimated_cents), 0)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) IS
  'SEC-REMEDIATION H-3: Casino rollup with service_role-gated actor override. '
  'Each function enforces its own gate independently — no reliance on upstream validation.';


-- =========================================================================
-- 6. rpc_shift_casino_metrics — 2-param wrapper (authenticated API surface)
-- =========================================================================

CREATE FUNCTION public.rpc_shift_casino_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS TABLE (
  window_start timestamptz,
  window_end timestamptz,
  tables_count integer,
  pits_count integer,
  tables_with_opening_snapshot integer,
  tables_with_closing_snapshot integer,
  tables_with_telemetry_count integer,
  tables_good_coverage_count integer,
  tables_grade_estimate integer,
  fills_total_cents bigint,
  credits_total_cents bigint,
  estimated_drop_rated_total_cents bigint,
  estimated_drop_grind_total_cents bigint,
  estimated_drop_buyins_total_cents bigint,
  win_loss_inventory_total_cents bigint,
  win_loss_estimated_total_cents bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.rpc_shift_casino_metrics(p_window_start, p_window_end, NULL::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz) IS
  'Authenticated wrapper for rpc_shift_casino_metrics. Delegates to 3-param version with NULL actor (JWT path).';


-- =========================================================================
-- Verification Queries (run post-migration to confirm)
-- =========================================================================
-- 1. No p_actor_id remnants in shift metrics RPCs:
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_shift_%'
--      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_id%';
--    → Must return 0 rows
--
-- 2. Wrapper overloads exist:
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_shift_%'
--    ORDER BY p.proname, args;
--    → Should show 2 overloads per function (with/without uuid param)
--
-- 3. Naming consistency check:
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--    WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_shift_%'
--      AND pg_get_function_identity_arguments(p.oid) ILIKE '%internal_actor%';
--    → Should show 3 rows (one per internal function)
