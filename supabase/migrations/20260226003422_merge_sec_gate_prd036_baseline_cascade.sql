-- =============================================================================
-- Migration: Merge SEC-REMEDIATION gates + PRD-036 Opening Baseline Cascade
-- =============================================================================
--
-- Problem: Security migration 20260219235613 dropped and recreated
--   rpc_shift_table_metrics without PRD-036 logic, reverting to pre-PRD-036
--   behavior: no par fallback, no provenance columns, wrong sign convention.
--
-- Fix: Recreate all shift metrics RPCs preserving BOTH:
--   - SEC-REMEDIATION: service_role gate, p_internal_actor_id, casino scope check
--   - PRD-036: ranked opening baseline cascade, provenance columns, correct sign
--
-- Changes from 20260219235613:
--   1. tables CTE now selects par_total_cents, par_updated_at from gaming_table
--   2. opening_snapshots CTE replaced with opening_baseline (LATERAL cascade)
--   3. Return type adds 4 provenance columns (26 total vs 22)
--   4. Win/loss sign convention fixed: (closing - opening) - fills + credits
--   5. missing_opening_snapshot uses legacy_snapshot_id (pre-window only)
--
-- @see INVESTIGATION-SHIFT-DASHBOARD-DATA-FLOW-2026-02-25.md
-- @see PRD-036-shift-winloss-opening-baseline-v0.1.md
-- @see SEC-REMEDIATION-STRATEGY-2026-02-19.md
-- =============================================================================

-- =========================================================================
-- 1. rpc_shift_table_metrics — 3-param (service_role gate + PRD-036 cascade)
-- =========================================================================
-- Must DROP: return type changes (22 → 26 columns)

DROP FUNCTION IF EXISTS public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.rpc_shift_table_metrics(timestamptz, timestamptz);

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
  -- Legacy opening fields (transitional — use provenance fields for new code)
  opening_snapshot_id uuid,
  opening_snapshot_at timestamptz,
  opening_bankroll_total_cents bigint,
  -- Closing snapshot
  closing_snapshot_id uuid,
  closing_snapshot_at timestamptz,
  closing_bankroll_total_cents bigint,
  -- Fills and credits
  fills_total_cents bigint,
  credits_total_cents bigint,
  -- Drop custody
  drop_custody_present boolean,
  -- Telemetry
  estimated_drop_rated_cents bigint,
  estimated_drop_grind_cents bigint,
  estimated_drop_buyins_cents bigint,
  telemetry_quality text,
  telemetry_notes text,
  -- Win/Loss (PRD-036: sign convention fixed)
  win_loss_inventory_cents bigint,
  win_loss_estimated_cents bigint,
  metric_grade text,
  -- Exception flags
  missing_opening_snapshot boolean,
  missing_closing_snapshot boolean,
  -- PRD-036: Opening baseline provenance
  opening_source text,
  opening_bankroll_cents bigint,
  opening_at timestamptz,
  coverage_type text
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
      gt.pit AS tbl_pit,
      gt.par_total_cents AS tbl_par_total_cents,
      gt.par_updated_at AS tbl_par_updated_at
    FROM public.gaming_table gt
    WHERE gt.casino_id = v_context_casino_id
      AND gt.status = 'active'
  ),

  -- =====================================================================
  -- PRD-036: Ranked Opening Baseline Cascade
  -- Source A/B: Latest pre-window snapshot (prior boundary count)
  -- Source C:   gaming_table.par_total_cents (bootstrap from par target)
  -- Source D:   Earliest snapshot within window (partial coverage fallback)
  -- Source E:   NULL (no baseline available)
  -- =====================================================================
  opening_baseline AS (
    SELECT
      t.tbl_id AS table_id,
      -- Ranked cascade for opening bankroll
      COALESCE(
        pre.bankroll_total_cents,
        t.tbl_par_total_cents::bigint,
        inw.bankroll_total_cents
      ) AS opening_bankroll_cents,
      -- Provenance: which source was used
      CASE
        WHEN pre.bankroll_total_cents IS NOT NULL THEN 'snapshot:prior_count'
        WHEN t.tbl_par_total_cents IS NOT NULL THEN 'bootstrap:par_target'
        WHEN inw.bankroll_total_cents IS NOT NULL THEN 'fallback:earliest_in_window'
        ELSE 'none'
      END AS opening_source,
      -- Timestamp of the source used
      CASE
        WHEN pre.bankroll_total_cents IS NOT NULL THEN pre.snapshot_at
        WHEN t.tbl_par_total_cents IS NOT NULL THEN t.tbl_par_updated_at
        WHEN inw.bankroll_total_cents IS NOT NULL THEN inw.snapshot_at
        ELSE NULL
      END AS opening_at,
      -- Coverage type
      CASE
        WHEN pre.bankroll_total_cents IS NOT NULL THEN 'full'
        WHEN t.tbl_par_total_cents IS NOT NULL THEN 'full'
        WHEN inw.bankroll_total_cents IS NOT NULL THEN 'partial'
        ELSE 'unknown'
      END AS coverage_type,
      -- Legacy transitional fields (Sources C/D: snapshot_id MUST remain NULL)
      pre.snapshot_id AS legacy_snapshot_id,
      pre.snapshot_at AS legacy_snapshot_at,
      pre.bankroll_total_cents AS legacy_bankroll_total_cents
    FROM tables t
    LEFT JOIN LATERAL (
      -- Source A/B: latest pre-window snapshot
      SELECT
        tis.id AS snapshot_id,
        tis.created_at AS snapshot_at,
        chipset_total_cents(tis.chipset) AS bankroll_total_cents
      FROM public.table_inventory_snapshot tis
      WHERE tis.casino_id = v_context_casino_id
        AND tis.table_id = t.tbl_id
        AND tis.created_at <= p_window_start
      ORDER BY tis.created_at DESC
      LIMIT 1
    ) pre ON TRUE
    LEFT JOIN LATERAL (
      -- Source D: earliest in-window snapshot
      SELECT
        tis.id AS snapshot_id,
        tis.created_at AS snapshot_at,
        chipset_total_cents(tis.chipset) AS bankroll_total_cents
      FROM public.table_inventory_snapshot tis
      WHERE tis.casino_id = v_context_casino_id
        AND tis.table_id = t.tbl_id
        AND tis.created_at > p_window_start
        AND tis.created_at < p_window_end
      ORDER BY tis.created_at ASC
      LIMIT 1
    ) inw ON TRUE
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

    -- Legacy opening fields (NULL for Sources C/D/E per PRD-036 rule)
    ob.legacy_snapshot_id AS opening_snapshot_id,
    ob.legacy_snapshot_at AS opening_snapshot_at,
    ob.legacy_bankroll_total_cents AS opening_bankroll_total_cents,

    cs.snapshot_id AS closing_snapshot_id,
    cs.snapshot_at AS closing_snapshot_at,
    cs.bankroll_total_cents AS closing_bankroll_total_cents,

    COALESCE(fa.fills_total, 0)::bigint AS fills_total_cents,
    COALESCE(ca.credits_total, 0)::bigint AS credits_total_cents,

    COALESCE(dc.has_drop, FALSE) AS drop_custody_present,

    COALESCE(ta.rated_cents, 0)::bigint AS estimated_drop_rated_cents,
    COALESCE(ta.grind_cents, 0)::bigint AS estimated_drop_grind_cents,
    COALESCE(ta.total_cents, 0)::bigint AS estimated_drop_buyins_cents,

    -- Telemetry quality
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

    -- PRD-036: Win/loss with FIXED sign convention
    -- Formula: (closing - opening) - fills + credits
    -- Uses ranked baseline opening (not just pre-window snapshot)
    -- NULL when opening_bankroll_cents IS NULL OR closing snapshot missing
    CASE
      WHEN ob.opening_bankroll_cents IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - ob.opening_bankroll_cents)
        - COALESCE(fa.fills_total, 0)
        + COALESCE(ca.credits_total, 0)
      ELSE NULL
    END::bigint AS win_loss_inventory_cents,

    CASE
      WHEN ob.opening_bankroll_cents IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - ob.opening_bankroll_cents)
        - COALESCE(fa.fills_total, 0)
        + COALESCE(ca.credits_total, 0)
        + COALESCE(ta.total_cents, 0)
      ELSE NULL
    END::bigint AS win_loss_estimated_cents,

    'ESTIMATE'::text AS metric_grade,

    -- missing_opening_snapshot: TRUE when no pre-window snapshot exists
    -- (does NOT consider par/in-window fallbacks — legacy flag)
    (ob.legacy_snapshot_id IS NULL) AS missing_opening_snapshot,
    (cs.snapshot_id IS NULL) AS missing_closing_snapshot,

    -- PRD-036: Provenance columns
    ob.opening_source::text AS opening_source,
    ob.opening_bankroll_cents AS opening_bankroll_cents,
    ob.opening_at AS opening_at,
    ob.coverage_type::text AS coverage_type

  FROM tables t
  LEFT JOIN opening_baseline ob ON ob.table_id = t.tbl_id
  LEFT JOIN closing_snapshots cs ON cs.table_id = t.tbl_id
  LEFT JOIN fills_agg fa ON fa.table_id = t.tbl_id
  LEFT JOIN credits_agg ca ON ca.table_id = t.tbl_id
  LEFT JOIN drop_custody dc ON dc.table_id = t.tbl_id
  LEFT JOIN telemetry_agg ta ON ta.table_id = t.tbl_id
  ORDER BY t.tbl_pit NULLS LAST, t.tbl_label;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) IS
  'Merged SEC-REMEDIATION H-1 + PRD-036: Per-table shift metrics with service_role-gated '
  'actor override AND ranked opening baseline cascade (snapshot→par→in-window→none). '
  'Returns provenance columns: opening_source, opening_bankroll_cents, opening_at, coverage_type. '
  'Win/loss sign convention: (closing - opening) - fills + credits (casino accounting). '
  'p_internal_actor_id is a dead switch for authenticated callers — non-NULL requires service_role.';


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
  missing_closing_snapshot boolean,
  opening_source text,
  opening_bankroll_cents bigint,
  opening_at timestamptz,
  coverage_type text
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
-- Pit/casino rollups delegate to rpc_shift_table_metrics internally.
-- Their own return types do NOT change (no per-table provenance at rollup level).
-- However, they must be recreated because the inner SELECT * picks up the new
-- column count from rpc_shift_table_metrics, and the WHERE clause references
-- column names that must match.

DROP FUNCTION IF EXISTS public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid);
DROP FUNCTION IF EXISTS public.rpc_shift_pit_metrics(timestamptz, timestamptz, text);

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
    SUM(tm.win_loss_inventory_cents)::bigint AS win_loss_inventory_total_cents,
    SUM(tm.win_loss_estimated_cents)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_pit_metrics(timestamptz, timestamptz, text, uuid) IS
  'SEC-REMEDIATION H-2 + PRD-036: Pit rollup with service_role-gated actor override. '
  'Delegates to rpc_shift_table_metrics (which includes opening baseline cascade). '
  'Win/loss uses SUM (preserves NULL when all tables NULL).';


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

DROP FUNCTION IF EXISTS public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.rpc_shift_casino_metrics(timestamptz, timestamptz);

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
    SUM(tm.win_loss_inventory_cents)::bigint AS win_loss_inventory_total_cents,
    SUM(tm.win_loss_estimated_cents)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics tm;

END;
$$;

REVOKE ALL ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_casino_metrics(timestamptz, timestamptz, uuid) IS
  'SEC-REMEDIATION H-3 + PRD-036: Casino rollup with service_role-gated actor override. '
  'Delegates to rpc_shift_table_metrics (which includes opening baseline cascade). '
  'Win/loss uses SUM (preserves NULL when all tables NULL).';


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
-- Notify PostgREST to reload schema cache
-- =========================================================================
NOTIFY pgrst, 'reload schema';
