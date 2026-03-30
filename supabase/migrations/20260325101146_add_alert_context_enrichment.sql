-- =============================================================================
-- Migration: Context Enrichment for rpc_get_anomaly_alerts (PRD-056 WS8)
-- Description: Add session_count, peak_deviation, recommended_action to return type.
--              DROP + CREATE required because return type is changing.
--              Includes all WS2 readiness logic (DA P2-3).
-- Reference: ADR-046 §10, DA P0-1 (bl CTE casino_id retained)
-- =============================================================================

-- Must DROP because PostgreSQL cannot change return type via CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.rpc_get_anomaly_alerts(timestamptz, timestamptz);

CREATE FUNCTION public.rpc_get_anomaly_alerts(
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
  message               text,
  -- WS8 enrichment columns
  session_count         int,
  peak_deviation        numeric,
  recommended_action    text
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

  -- [DA P0-1] Explicit casino_id filter — tenant-safe in DEFINER calling chains
  bl AS (
    SELECT DISTINCT ON (b.table_id, b.metric_type)
      b.table_id, b.metric_type,
      b.gaming_day  AS bl_day,
      b.median_value AS med,
      b.mad_value    AS mad,
      b.sample_count AS sc,
      b.last_error   AS last_err
    FROM public.table_metric_baseline b
    WHERE b.casino_id = v_casino_id
    ORDER BY b.table_id, b.metric_type, b.gaming_day DESC
  ),

  -- WS8: Active session counts per table
  sessions AS (
    SELECT ts.table_id, COUNT(*)::int AS sess_count
    FROM public.table_session ts
    WHERE ts.casino_id = v_casino_id
      AND ts.ended_at IS NULL
    GROUP BY ts.table_id
  ),

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
      -- 5-state readiness (WS2 + compute_failed)
      CASE
        WHEN bl.last_err IS NOT NULL           THEN 'compute_failed'
        WHEN bl.table_id IS NULL               THEN 'missing'
        WHEN bl.bl_day < v_target_day          THEN 'stale'
        WHEN bl.sc < v_min_hist                THEN 'insufficient_data'
        ELSE 'ready'
      END AS rs,
      CASE
        WHEN bl.table_id IS NULL OR bl.bl_day < v_target_day OR bl.sc < v_min_hist
             OR bl.last_err IS NOT NULL
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
      END::numeric AS thresh,
      -- WS8: session count
      COALESCE(s.sess_count, 0) AS sess_count
    FROM live l
    LEFT JOIN bl ON l.table_id = bl.table_id AND l.mt = bl.metric_type
    LEFT JOIN sessions s ON l.table_id = s.table_id
  ),

  -- WS8: Peak deviation per table (max deviation_score across all metrics)
  peak_devs AS (
    SELECT
      e.table_id,
      MAX(
        CASE
          WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total' THEN NULL
          WHEN e.mt = 'hold_percent'                       THEN e.abs_dev
          WHEN e.mad > 0                                   THEN e.abs_dev / e.mad
          WHEN e.thresh IS NOT NULL AND e.thresh > 0       THEN e.abs_dev / e.thresh
          ELSE NULL
        END
      ) AS peak_dev
    FROM eval e
    GROUP BY e.table_id
  )

  SELECT
    e.table_id,
    e.table_label,
    e.mt                                                      AS metric_type,
    e.rs                                                      AS readiness_state,
    e.ov                                                      AS observed_value,
    e.med                                                     AS baseline_median,
    e.mad                                                     AS baseline_mad,

    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.mt = 'hold_percent'                              THEN e.abs_dev
      WHEN e.mad > 0                                          THEN e.abs_dev / e.mad
      WHEN e.thresh IS NOT NULL AND e.thresh > 0              THEN e.abs_dev / e.thresh
      ELSE NULL
    END::numeric                                              AS deviation_score,

    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN false
      WHEN e.mt = 'hold_percent' THEN
        (e.ov < v_hold_lo OR e.ov > v_hold_hi OR e.abs_dev > v_hold_dev_pp)
      ELSE
        (e.thresh IS NOT NULL AND e.abs_dev > e.thresh)
    END                                                       AS is_anomaly,

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

    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.ov > COALESCE(e.med, 0)                          THEN 'above'
      WHEN e.ov < COALESCE(e.med, 0)                          THEN 'below'
      ELSE NULL
    END::text                                                 AS direction,

    e.thresh                                                  AS threshold_value,
    e.bl_day                                                  AS baseline_gaming_day,
    e.sc::int                                                 AS baseline_sample_count,

    CASE
      WHEN e.rs = 'compute_failed'   THEN 'Baseline computation failed'
      WHEN e.rs = 'missing'          THEN 'No baseline available'
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
    END::text                                                 AS message,

    -- WS8 enrichment columns
    e.sess_count                                              AS session_count,
    pd.peak_dev                                               AS peak_deviation,
    -- recommended_action: based on severity
    CASE
      WHEN e.rs != 'ready' OR e.mt = 'cash_obs_total'        THEN NULL
      WHEN e.mt = 'hold_percent' AND (e.ov < v_hold_lo OR e.ov > v_hold_hi)
        THEN 'investigate'
      WHEN e.mt IN ('drop_total', 'win_loss_cents') AND e.mad > 0 AND e.abs_dev / e.mad > 4
        THEN 'investigate'
      WHEN e.mt IN ('drop_total', 'win_loss_cents') AND e.mad > 0 AND e.abs_dev / e.mad > 3
        THEN 'monitor'
      WHEN e.thresh IS NOT NULL AND e.abs_dev > e.thresh
        THEN 'acknowledge'
      ELSE NULL
    END::text                                                 AS recommended_action

  FROM eval e
  LEFT JOIN peak_devs pd ON e.table_id = pd.table_id;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_anomaly_alerts(timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
