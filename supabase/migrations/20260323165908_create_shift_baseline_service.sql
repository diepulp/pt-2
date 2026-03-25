-- =============================================================================
-- Migration: Create Shift Baseline Service (PRD-055)
-- Description: table_metric_baseline with ADR-015 Pattern C hybrid RLS,
--              rpc_compute_rolling_baseline (DEFINER), rpc_get_anomaly_alerts (INVOKER)
-- Reference: ADR-015, ADR-046, ADR-018, ADR-024, ADR-040
-- RLS_REVIEW_COMPLETE: 4 policies follow Pattern C hybrid (VERIFIED_SAFE)
-- =============================================================================
-- Creates:
--   1. table_metric_baseline — stores rolling statistical baselines
--   2. rpc_compute_rolling_baseline — SECURITY DEFINER compute RPC
--   3. rpc_get_anomaly_alerts — SECURITY INVOKER alert read RPC
--   4. Pattern C RLS + DELETE denial on table_metric_baseline
--
-- ADR refs: ADR-046 (stored computation), ADR-018 (DEFINER governance),
--           ADR-024 (authoritative context), ADR-040 (identity provenance)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: table_metric_baseline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.table_metric_baseline (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id      uuid        NOT NULL REFERENCES public.casino(id),
  table_id       uuid        NOT NULL REFERENCES public.gaming_table(id),
  metric_type    text        NOT NULL CHECK (metric_type IN (
                               'drop_total', 'hold_percent', 'cash_obs_total', 'win_loss_cents'
                             )),
  gaming_day     date        NOT NULL,
  window_days    int         NOT NULL,
  median_value   numeric     NOT NULL,
  mad_value      numeric     NOT NULL,  -- scaled MAD (x1.4826)
  sample_count   int         NOT NULL,
  min_value      numeric,
  max_value      numeric,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  computed_by    uuid        REFERENCES public.staff(id)  -- from app.actor_id (ADR-024 INV-8)
);

-- UPSERT key: one baseline per (casino, table, metric, gaming_day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_baseline_upsert_key
  ON public.table_metric_baseline (casino_id, table_id, metric_type, gaming_day);

-- Read pattern: lookup by casino + gaming_day (most recent first)
CREATE INDEX IF NOT EXISTS idx_baseline_casino_day
  ON public.table_metric_baseline (casino_id, gaming_day DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS: Pattern C Hybrid + DELETE Denial
-- ---------------------------------------------------------------------------
ALTER TABLE public.table_metric_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY baseline_select_casino_scope ON public.table_metric_baseline
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY baseline_insert_casino_scope ON public.table_metric_baseline
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY baseline_update_casino_scope ON public.table_metric_baseline
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- DELETE denied — no business reason for deletes (PRD-055 §4.1)
CREATE POLICY baseline_no_deletes ON public.table_metric_baseline
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);


-- ---------------------------------------------------------------------------
-- 3. RPC: rpc_compute_rolling_baseline (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- Computes 7-day rolling median + MAD for per-table operational metrics.
-- Calls source RPCs (INVOKER) under DEFINER privilege — casino isolation
-- relies on WHERE clauses inside source RPCs (SEC_NOTE C4), not RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_compute_rolling_baseline(
  p_gaming_day  date DEFAULT NULL,
  p_table_id    uuid DEFAULT NULL
)
RETURNS TABLE (
  tables_processed  int,
  metrics_computed  int,
  gaming_day        date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id        uuid;
  v_actor_id         uuid;
  v_staff_role       text;
  v_target_day       date;
  v_window_days      int;
  v_gaming_day_start time;
  v_tz               text;
  v_d                date;
  v_day_start        timestamptz;
  v_day_end          timestamptz;
  v_tables_out       int;
  v_metrics_out      int;
BEGIN
  -- ── 1. Context derivation (ADR-024 INV-7) ──────────────────────────────
  PERFORM public.set_rls_context_from_staff();
  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ── 2. Role gate ───────────────────────────────────────────────────────
  IF v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: pit_boss or admin role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. Read casino settings ────────────────────────────────────────────
  SELECT
    cs.gaming_day_start_time,
    cs.timezone,
    COALESCE((cs.alert_thresholds -> 'baseline' ->> 'window_days')::int, 7)
  INTO v_gaming_day_start, v_tz, v_window_days
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  IF v_gaming_day_start IS NULL OR v_tz IS NULL THEN
    RAISE EXCEPTION 'Casino settings not configured for casino %', v_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. Target gaming day ───────────────────────────────────────────────
  v_target_day := COALESCE(
    p_gaming_day,
    public.compute_gaming_day(now(), v_gaming_day_start)
  );

  -- ── 5. Accumulate daily metrics ────────────────────────────────────────
  DROP TABLE IF EXISTS _baseline_daily;
  CREATE TEMP TABLE _baseline_daily (
    table_id     uuid     NOT NULL,
    metric_type  text     NOT NULL,
    gaming_day   date     NOT NULL,
    metric_value numeric  NOT NULL
  );

  FOR i IN 1..v_window_days LOOP
    v_d := v_target_day - i;
    -- Gaming day window: [start_time on day D, start_time on day D+1)
    v_day_start := (v_d::timestamp + v_gaming_day_start) AT TIME ZONE v_tz;
    v_day_end   := ((v_d + 1)::timestamp + v_gaming_day_start) AT TIME ZONE v_tz;

    -- Table metrics: drop, win_loss, hold — single RPC call per day
    INSERT INTO _baseline_daily (table_id, metric_type, gaming_day, metric_value)
    SELECT m.table_id, v.mt, v_d, v.mv
    FROM public.rpc_shift_table_metrics(v_day_start, v_day_end) m
    CROSS JOIN LATERAL (VALUES
      ('drop_total',    m.estimated_drop_buyins_cents::numeric),
      ('win_loss_cents', m.win_loss_inventory_cents::numeric),
      ('hold_percent',  CASE
                          WHEN m.estimated_drop_buyins_cents > 0
                          THEN (m.win_loss_inventory_cents::numeric
                                / m.estimated_drop_buyins_cents * 100)
                          ELSE NULL  -- FR-16: exclude zero-drop days
                        END)
    ) AS v(mt, mv)
    WHERE m.telemetry_quality != 'NONE'             -- FR-14: exclude telemetry-deficient
      AND (p_table_id IS NULL OR m.table_id = p_table_id)
      AND v.mv IS NOT NULL;

    -- Cash observations
    INSERT INTO _baseline_daily (table_id, metric_type, gaming_day, metric_value)
    SELECT c.table_id, 'cash_obs_total', v_d, c.cash_out_observed_estimate_total::numeric
    FROM public.rpc_shift_cash_obs_table(v_day_start, v_day_end, p_table_id) c
    WHERE c.cash_out_observed_estimate_total IS NOT NULL;

  END LOOP;

  -- ── 6. Compute median + MAD per (table, metric) ────────────────────────
  WITH medians AS (
    SELECT
      bd.table_id,
      bd.metric_type,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY bd.metric_value) AS median_value,
      COUNT(*)::int  AS sample_count,
      MIN(bd.metric_value) AS min_value,
      MAX(bd.metric_value) AS max_value
    FROM _baseline_daily bd
    GROUP BY bd.table_id, bd.metric_type
  ),
  deviations AS (
    SELECT
      bd.table_id,
      bd.metric_type,
      ABS(bd.metric_value - med.median_value) AS abs_dev
    FROM _baseline_daily bd
    JOIN medians med
      ON bd.table_id = med.table_id
     AND bd.metric_type = med.metric_type
  ),
  mads AS (
    SELECT
      dev.table_id,
      dev.metric_type,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY dev.abs_dev) * 1.4826 AS mad_value
    FROM deviations dev
    GROUP BY dev.table_id, dev.metric_type
  )
  INSERT INTO public.table_metric_baseline (
    casino_id, table_id, metric_type, gaming_day, window_days,
    median_value, mad_value, sample_count, min_value, max_value,
    computed_at, computed_by
  )
  SELECT
    v_casino_id,
    med.table_id,
    med.metric_type,
    v_target_day,
    v_window_days,
    med.median_value,
    COALESCE(m.mad_value, 0),
    med.sample_count,
    med.min_value,
    med.max_value,
    now(),
    v_actor_id
  FROM medians med
  JOIN mads m ON med.table_id = m.table_id AND med.metric_type = m.metric_type
  ON CONFLICT (casino_id, table_id, metric_type, gaming_day)
  DO UPDATE SET
    window_days   = EXCLUDED.window_days,
    median_value  = EXCLUDED.median_value,
    mad_value     = EXCLUDED.mad_value,
    sample_count  = EXCLUDED.sample_count,
    min_value     = EXCLUDED.min_value,
    max_value     = EXCLUDED.max_value,
    computed_at   = EXCLUDED.computed_at,
    computed_by   = EXCLUDED.computed_by;

  -- ── 7. Result summary ──────────────────────────────────────────────────
  GET DIAGNOSTICS v_metrics_out = ROW_COUNT;
  SELECT COUNT(DISTINCT bd.table_id)::int INTO v_tables_out FROM _baseline_daily bd;

  DROP TABLE IF EXISTS _baseline_daily;

  RETURN QUERY SELECT COALESCE(v_tables_out, 0), COALESCE(v_metrics_out, 0), v_target_day;
END;
$$;

-- ADR-018: Explicit owner for SECURITY DEFINER
ALTER FUNCTION public.rpc_compute_rolling_baseline(date, uuid) OWNER TO postgres;

-- Grants: authenticated + service_role only
REVOKE ALL ON FUNCTION public.rpc_compute_rolling_baseline(date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_compute_rolling_baseline(date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_compute_rolling_baseline(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_compute_rolling_baseline(date, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. RPC: rpc_get_anomaly_alerts (SECURITY INVOKER)
-- ---------------------------------------------------------------------------
-- Reads stored baselines + live shift metrics. Evaluates anomaly per metric:
--   drop_total / win_loss_cents: MAD multiplier method
--   hold_percent:                range-bound method (extreme_low/high, deviation_pp)
--   cash_obs_total:              no eval (static threshold authority retained)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_anomaly_alerts(
  p_window_start  timestamptz,
  p_window_end    timestamptz
)
RETURNS TABLE (
  table_id              uuid,
  table_label           text,
  metric_type           text,
  readiness_state       text,
  observed_value        numeric,
  baseline_median       numeric,
  baseline_mad          numeric,
  deviation_score       numeric,
  is_anomaly            boolean,
  severity              text,
  direction             text,
  threshold_value       numeric,
  baseline_gaming_day   date,
  baseline_sample_count int,
  message               text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id        uuid;
  v_target_day       date;
  v_gaming_day_start time;
  v_tz               text;
  v_min_hist         int;
  v_drop_mult        numeric;
  v_drop_fb          numeric;
  v_hold_dev_pp      numeric;
  v_hold_lo          numeric;
  v_hold_hi          numeric;
  v_wl_mult          numeric;
  v_wl_fb            numeric;
BEGIN
  -- ── Context ─────────────────────────────────────────────────────────────
  PERFORM public.set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  -- ── Config ──────────────────────────────────────────────────────────────
  SELECT
    cs.gaming_day_start_time,
    cs.timezone,
    COALESCE((cs.alert_thresholds -> 'baseline'              ->> 'min_history_days')::int,     3),
    COALESCE((cs.alert_thresholds -> 'drop_anomaly'          ->> 'mad_multiplier')::numeric,   3),
    COALESCE((cs.alert_thresholds -> 'drop_anomaly'          ->> 'fallback_percent')::numeric, 50),
    COALESCE((cs.alert_thresholds -> 'hold_deviation'        ->> 'deviation_pp')::numeric,     10),
    COALESCE((cs.alert_thresholds -> 'hold_deviation'        ->> 'extreme_low')::numeric,      -5),
    COALESCE((cs.alert_thresholds -> 'hold_deviation'        ->> 'extreme_high')::numeric,     40),
    COALESCE((cs.alert_thresholds -> 'promo_issuance_spike'  ->> 'mad_multiplier')::numeric,   3),
    COALESCE((cs.alert_thresholds -> 'promo_issuance_spike'  ->> 'fallback_percent')::numeric, 100)
  INTO v_gaming_day_start, v_tz, v_min_hist,
       v_drop_mult, v_drop_fb, v_hold_dev_pp, v_hold_lo, v_hold_hi,
       v_wl_mult, v_wl_fb
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  v_target_day := public.compute_gaming_day(now(), v_gaming_day_start);

  -- ── Evaluate ────────────────────────────────────────────────────────────
  RETURN QUERY
  WITH
  -- Source RPC calls (materialized = single call each)
  live_tm AS MATERIALIZED (
    SELECT
      tm.table_id, tm.table_label,
      tm.estimated_drop_buyins_cents,
      tm.win_loss_inventory_cents,
      tm.telemetry_quality
    FROM public.rpc_shift_table_metrics(p_window_start, p_window_end) tm
  ),
  live_co AS MATERIALIZED (
    SELECT
      co.table_id, co.table_label,
      co.cash_out_observed_estimate_total
    FROM public.rpc_shift_cash_obs_table(p_window_start, p_window_end, NULL) co
  ),

  -- Unpivot into (table, metric, observed_value)
  live AS (
    SELECT ltm.table_id, ltm.table_label, v.mt, v.ov
    FROM live_tm ltm
    CROSS JOIN LATERAL (VALUES
      ('drop_total'::text,     ltm.estimated_drop_buyins_cents::numeric),
      ('win_loss_cents'::text,  ltm.win_loss_inventory_cents::numeric),
      ('hold_percent'::text,   CASE
                                 WHEN ltm.estimated_drop_buyins_cents > 0
                                 THEN (ltm.win_loss_inventory_cents::numeric
                                       / ltm.estimated_drop_buyins_cents * 100)
                                 ELSE NULL
                               END)
    ) AS v(mt, ov)
    WHERE ltm.telemetry_quality != 'NONE' AND v.ov IS NOT NULL

    UNION ALL

    SELECT lco.table_id, lco.table_label, 'cash_obs_total'::text,
           lco.cash_out_observed_estimate_total::numeric
    FROM live_co lco
    WHERE lco.cash_out_observed_estimate_total IS NOT NULL
  ),

  -- Most recent baseline per (table, metric) — RLS enforces casino scope
  bl AS (
    SELECT DISTINCT ON (b.table_id, b.metric_type)
      b.table_id, b.metric_type,
      b.gaming_day  AS bl_day,
      b.median_value AS med,
      b.mad_value    AS mad,
      b.sample_count AS sc
    FROM public.table_metric_baseline b
    ORDER BY b.table_id, b.metric_type, b.gaming_day DESC
  ),

  -- Join + readiness + pre-compute absolute deviation & threshold
  eval AS (
    SELECT
      l.table_id,
      l.table_label,
      l.mt,
      l.ov,
      bl.med,
      bl.mad,
      bl.bl_day,
      bl.sc,
      ABS(l.ov - COALESCE(bl.med, 0)) AS abs_dev,
      -- Readiness state (ADR-046 §8)
      CASE
        WHEN bl.table_id IS NULL                THEN 'missing'
        WHEN bl.bl_day < v_target_day           THEN 'stale'
        WHEN bl.sc < v_min_hist                 THEN 'insufficient_data'
        ELSE 'ready'
      END AS rs,
      -- Threshold (metric-specific)
      CASE
        WHEN bl.table_id IS NULL OR bl.bl_day < v_target_day OR bl.sc < v_min_hist
          THEN NULL
        WHEN l.mt = 'cash_obs_total' THEN NULL
        WHEN l.mt = 'hold_percent'   THEN v_hold_dev_pp
        WHEN l.mt = 'drop_total' THEN
          CASE WHEN bl.mad > 0    THEN v_drop_mult * bl.mad
               WHEN bl.med != 0  THEN ABS(bl.med) * v_drop_fb / 100
               ELSE NULL END
        WHEN l.mt = 'win_loss_cents' THEN
          CASE WHEN bl.mad > 0    THEN v_wl_mult * bl.mad
               WHEN bl.med != 0  THEN ABS(bl.med) * v_wl_fb / 100
               ELSE NULL END
        ELSE NULL
      END::numeric AS thresh
    FROM live l
    LEFT JOIN bl ON l.table_id = bl.table_id AND l.mt = bl.metric_type
  )

  SELECT
    e.table_id,
    e.table_label,
    e.mt                                                      AS metric_type,
    e.rs                                                      AS readiness_state,
    e.ov                                                      AS observed_value,
    e.med                                                     AS baseline_median,
    e.mad                                                     AS baseline_mad,

    -- deviation_score
    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.mt = 'hold_percent'                              THEN e.abs_dev
      WHEN e.mad > 0                                          THEN e.abs_dev / e.mad
      WHEN e.thresh IS NOT NULL AND e.thresh > 0              THEN e.abs_dev / e.thresh
      ELSE NULL
    END::numeric                                              AS deviation_score,

    -- is_anomaly (FR-11: only for ready baselines)
    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN false
      WHEN e.mt = 'hold_percent' THEN
        (e.ov < v_hold_lo OR e.ov > v_hold_hi OR e.abs_dev > v_hold_dev_pp)
      ELSE
        (e.thresh IS NOT NULL AND e.abs_dev > e.thresh)
    END                                                       AS is_anomaly,

    -- severity
    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.mt = 'hold_percent' THEN
        CASE
          WHEN e.ov < v_hold_lo OR e.ov > v_hold_hi          THEN 'critical'
          WHEN e.abs_dev > v_hold_dev_pp                      THEN 'warn'
          ELSE NULL
        END
      WHEN e.mt IN ('drop_total', 'win_loss_cents') THEN
        CASE
          WHEN e.mad > 0 AND e.abs_dev / e.mad > 4           THEN 'critical'
          WHEN e.mad > 0 AND e.abs_dev / e.mad > 3           THEN 'warn'
          WHEN e.mad > 0 AND e.abs_dev / e.mad > 2           THEN 'info'
          WHEN e.mad = 0 AND e.thresh IS NOT NULL
               AND e.abs_dev > e.thresh                       THEN 'warn'
          ELSE NULL
        END
      ELSE NULL
    END::text                                                 AS severity,

    -- direction
    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.ov > COALESCE(e.med, 0)                          THEN 'above'
      WHEN e.ov < COALESCE(e.med, 0)                          THEN 'below'
      ELSE NULL
    END::text                                                 AS direction,

    e.thresh                                                  AS threshold_value,
    e.bl_day                                                  AS baseline_gaming_day,
    e.sc::int                                                 AS baseline_sample_count,

    -- message
    CASE
      WHEN e.rs = 'missing'           THEN 'No baseline available'
      WHEN e.rs = 'stale'            THEN 'Baseline stale (last: ' || e.bl_day::text || ')'
      WHEN e.rs = 'insufficient_data' THEN
        'Baseline building (' || e.sc::text || '/' || v_min_hist::text || ' days)'
      WHEN e.mt = 'cash_obs_total'   THEN 'Static threshold authority'
      WHEN e.mt = 'hold_percent'
           AND (e.ov < v_hold_lo OR e.ov > v_hold_hi)
        THEN 'Hold % ' || CASE WHEN e.ov < v_hold_lo THEN 'below extreme low' ELSE 'above extreme high' END
      WHEN e.thresh IS NOT NULL AND e.abs_dev > e.thresh
        THEN replace(e.mt, '_', ' ') || ' '
             || CASE WHEN e.ov > e.med THEN 'above' ELSE 'below' END
             || ' baseline'
      ELSE 'Within normal range'
    END::text                                                 AS message

  FROM eval e;
END;
$$;

-- Grants: authenticated + service_role only
REVOKE ALL ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. PostgREST reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
