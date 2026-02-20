-- ============================================================================
-- Migration: PRD-036 Shift Metrics Opening Baseline — Ranked Fallback
-- Created: 2026-02-19
-- PRD Reference: docs/10-prd/PRD-036-shift-winloss-opening-baseline-v0.1.md
-- Purpose: Replace single opening_snapshots CTE with ranked baseline cascade
--          (A/B→C→D→E), add provenance columns, fix win/loss sign convention.
--
-- Changes:
--   1. Replace opening_snapshots CTE with opening_baseline using LATERAL joins
--   2. Add return columns: opening_source, opening_bankroll_cents, opening_at,
--      coverage_type
--   3. Fix win/loss formula: (closing - opening) - fills + credits
--   4. Legacy opening_* columns preserved for transitional wiring
-- ============================================================================

BEGIN;

-- Must DROP first because RETURNS TABLE columns are changing (cannot ALTER)
DROP FUNCTION IF EXISTS public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid);

CREATE FUNCTION public.rpc_shift_table_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_actor_id uuid DEFAULT NULL
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
  -- ADR-024: Context Injection with Service Role Bypass for Testing
  -- =======================================================================
  IF p_actor_id IS NOT NULL THEN
    SELECT s.id, s.casino_id, s.role::text
    INTO v_context_actor_id, v_context_casino_id, v_context_staff_role
    FROM public.staff s
    WHERE s.id = p_actor_id
      AND s.status = 'active';

    IF v_context_actor_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Staff % not found or inactive', p_actor_id
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
  'Compute per-table shift metrics for a time window. '
  'PRD-036: Ranked opening baseline cascade (snapshot→par→in-window→none). '
  'Returns provenance columns: opening_source, opening_bankroll_cents, opening_at, coverage_type. '
  'Win/loss sign convention: (closing - opening) - fills + credits (casino accounting). '
  'win_loss_inventory = bankroll delta minus fills plus credits. '
  'win_loss_estimated = win_loss_inventory + estimated_drop_buyins. '
  'RATED_ADJUSTMENT telemetry rolls into estimated_drop_rated_cents. '
  'metric_grade is always ESTIMATE (count room integration deferred). '
  'telemetry_quality: GOOD_COVERAGE (grind logged), LOW_COVERAGE (rated/adjustment only), NONE.';

NOTIFY pgrst, 'reload schema';

COMMIT;
