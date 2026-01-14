-- =====================================================
-- Migration: rpc_shift_table_metrics
-- Created: 2026-01-14
-- Workstream: WS4 - ADDENDUM-TBL-RUNDOWN
-- Purpose: Compute per-table shift metrics with dual-stream win/loss
-- Dependencies: WS1 (table_buyin_telemetry), WS3 (chipset_total_cents)
-- Source: ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md
-- =====================================================
--
-- This RPC computes shift metrics for all tables in the caller's casino:
--   - Opening/closing bankroll from snapshots
--   - Fills and credits aggregation
--   - Buy-in telemetry (rated + grind) aggregation
--   - Dual-stream win/loss computation
--   - Telemetry quality flags
--
-- Computation Rules (MVP):
--   win_loss_inventory = (closing - opening) + fills - credits
--   win_loss_estimated = win_loss_inventory + estimated_drop_buyins
--   metric_grade = 'ESTIMATE' always (count room deferred)
--
-- Security: SECURITY INVOKER with set_rls_context_from_staff()
-- =====================================================

BEGIN;

-- ============================================================================
-- RPC: rpc_shift_table_metrics
-- ============================================================================
-- Purpose: Compute per-table shift metrics for a given time window
-- Returns: Set of rows with detailed metrics per table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_shift_table_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_actor_id uuid DEFAULT NULL  -- Optional: for service-role testing bypass
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
    -- Service role bypass: derive context from provided actor_id
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
    -- Production path: Derive staff identity from JWT + staff table binding
    PERFORM set_rls_context_from_staff();

    -- Extract the validated context
    v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
    v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

    -- Check authentication (only for JWT path)
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
  -- Get all tables for the casino
  tables AS (
    SELECT
      gt.id AS tbl_id,
      gt.label AS tbl_label,
      gt.pit AS tbl_pit
    FROM public.gaming_table gt
    WHERE gt.casino_id = v_context_casino_id
      AND gt.status = 'active'
  ),

  -- Opening snapshot: latest snapshot created_at <= window_start for each table
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

  -- Closing snapshot: latest snapshot created_at <= window_end for each table
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

  -- Fills aggregation within window
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

  -- Credits aggregation within window
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

  -- Drop custody check (any drop event in window)
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

  -- Telemetry aggregation within window (from table_buyin_telemetry)
  telemetry_agg AS (
    SELECT
      tbt.table_id,
      COALESCE(SUM(tbt.amount_cents) FILTER (WHERE tbt.telemetry_kind = 'RATED_BUYIN'), 0)::bigint AS rated_cents,
      COALESCE(SUM(tbt.amount_cents) FILTER (WHERE tbt.telemetry_kind = 'GRIND_BUYIN'), 0)::bigint AS grind_cents,
      COALESCE(SUM(tbt.amount_cents), 0)::bigint AS total_cents,
      COUNT(*) FILTER (WHERE tbt.telemetry_kind = 'GRIND_BUYIN') AS grind_count,
      COUNT(*) FILTER (WHERE tbt.telemetry_kind = 'RATED_BUYIN') AS rated_count
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

    -- Opening snapshot
    os.snapshot_id AS opening_snapshot_id,
    os.snapshot_at AS opening_snapshot_at,
    os.bankroll_total_cents AS opening_bankroll_total_cents,

    -- Closing snapshot
    cs.snapshot_id AS closing_snapshot_id,
    cs.snapshot_at AS closing_snapshot_at,
    cs.bankroll_total_cents AS closing_bankroll_total_cents,

    -- Fills and credits
    COALESCE(fa.fills_total, 0)::bigint AS fills_total_cents,
    COALESCE(ca.credits_total, 0)::bigint AS credits_total_cents,

    -- Drop custody
    COALESCE(dc.has_drop, FALSE) AS drop_custody_present,

    -- Telemetry
    COALESCE(ta.rated_cents, 0)::bigint AS estimated_drop_rated_cents,
    COALESCE(ta.grind_cents, 0)::bigint AS estimated_drop_grind_cents,
    COALESCE(ta.total_cents, 0)::bigint AS estimated_drop_buyins_cents,

    -- Telemetry quality (based on grind tracking activity)
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

    -- Win/Loss: inventory-based (tray delta + movements)
    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
      ELSE NULL
    END::bigint AS win_loss_inventory_cents,

    -- Win/Loss: estimated (inventory + telemetry buy-ins)
    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
        + COALESCE(ta.total_cents, 0)
      ELSE NULL
    END::bigint AS win_loss_estimated_cents,

    -- Metric grade: always ESTIMATE for MVP
    'ESTIMATE'::text AS metric_grade,

    -- Exception flags
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

-- Grant permissions
REVOKE ALL ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) IS
  'ADDENDUM-TBL-RUNDOWN WS4: Compute per-table shift metrics for a time window. '
  'Returns opening/closing bankroll, fills, credits, telemetry (rated + grind), and dual-stream win/loss. '
  'win_loss_inventory = (closing - opening) + fills - credits. '
  'win_loss_estimated = win_loss_inventory + estimated_drop_buyins. '
  'metric_grade is always ESTIMATE (count room integration deferred). '
  'telemetry_quality: GOOD_COVERAGE (grind logged), LOW_COVERAGE (rated only), NONE.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
