-- =============================================================================
-- Migration: New Alert RPCs (PRD-056 WS3)
-- Description: rpc_persist_anomaly_alerts (UPSERT + dedup + cooldown)
--              rpc_acknowledge_alert (role-gated, atomic state transition)
-- Reference: ADR-018, ADR-024 INV-8, ADR-030, ADR-046 §Security Model
-- SEC Note: C1 tenant isolation, C2 role gate, C3 actor binding,
--           C4 forward-only state, C5 cooldown floor, C7 RPC-only mutation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: rpc_persist_anomaly_alerts (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_persist_anomaly_alerts(
  p_gaming_day  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id    uuid;
  v_actor_id     uuid;
  v_cooldown     int;
  v_target_day   date;
  v_gaming_day_start time;
  v_window_start timestamptz;
  v_window_end   timestamptz;
  v_tz           text;
  v_persisted    int := 0;
  v_suppressed   int := 0;
  v_rec          record;
BEGIN
  -- ── 1. Context derivation (ADR-024 INV-8 — no p_casino_id param) ──────
  PERFORM public.set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id',  true), '')::uuid;

  -- ── 2. Authorization check ────────────────────────────────────────────
  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. Cooldown config (floor = 5 minutes, SEC Note C5) ──────────────
  v_cooldown := GREATEST(5, COALESCE(
    (SELECT (cs.alert_thresholds ->> 'cooldown_minutes')::int
     FROM public.casino_settings cs
     WHERE cs.casino_id = v_casino_id),
    60
  ));

  -- ── 4. Target gaming day + time window ────────────────────────────────
  SELECT cs.gaming_day_start_time, cs.timezone
  INTO v_gaming_day_start, v_tz
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  v_target_day := COALESCE(
    p_gaming_day,
    public.compute_gaming_day(now(), v_gaming_day_start)
  );

  -- Compute window boundaries for the target gaming day
  v_window_start := (v_target_day::timestamp + v_gaming_day_start) AT TIME ZONE v_tz;
  v_window_end   := ((v_target_day + 1)::timestamp + v_gaming_day_start) AT TIME ZONE v_tz;

  -- ── 5. Evaluate anomalies via existing RPC ────────────────────────────
  FOR v_rec IN
    SELECT *
    FROM public.rpc_get_anomaly_alerts(v_window_start, v_window_end)
    WHERE is_anomaly = true
  LOOP
    -- ── 6. Cooldown check ────────────────────────────────────────────────
    IF EXISTS (
      SELECT 1 FROM public.shift_alert
      WHERE casino_id = v_casino_id
        AND table_id = v_rec.table_id
        AND metric_type = v_rec.metric_type
        AND gaming_day = v_target_day
        AND updated_at > now() - (v_cooldown || ' minutes')::interval
    ) THEN
      v_suppressed := v_suppressed + 1;
      CONTINUE;
    END IF;

    -- ── 7. UPSERT with dedup ────────────────────────────────────────────
    INSERT INTO public.shift_alert (
      casino_id, table_id, metric_type, gaming_day,
      status, severity, observed_value,
      baseline_median, baseline_mad, deviation_score,
      direction, message, updated_at
    ) VALUES (
      v_casino_id, v_rec.table_id, v_rec.metric_type, v_target_day,
      'open',
      CASE
        WHEN v_rec.severity = 'critical' THEN 'high'
        WHEN v_rec.severity = 'warn'     THEN 'medium'
        ELSE 'low'
      END,
      v_rec.observed_value,
      v_rec.baseline_median, v_rec.baseline_mad, v_rec.deviation_score,
      v_rec.direction, v_rec.message, now()
    )
    ON CONFLICT (casino_id, table_id, metric_type, gaming_day)
    DO UPDATE SET
      severity       = EXCLUDED.severity,
      observed_value = EXCLUDED.observed_value,
      baseline_median = EXCLUDED.baseline_median,
      baseline_mad   = EXCLUDED.baseline_mad,
      deviation_score = EXCLUDED.deviation_score,
      direction      = EXCLUDED.direction,
      message        = EXCLUDED.message,
      updated_at     = now();

    v_persisted := v_persisted + 1;
  END LOOP;

  -- ── 8. Return result ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'persisted_count', v_persisted,
    'suppressed_count', v_suppressed,
    'gaming_day', v_target_day
  );
END;
$$;

-- ADR-018: Explicit owner for SECURITY DEFINER
ALTER FUNCTION public.rpc_persist_anomaly_alerts(date) OWNER TO postgres;

-- Grants (DA P1-1): authenticated + service_role only
REVOKE ALL ON FUNCTION public.rpc_persist_anomaly_alerts(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_persist_anomaly_alerts(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_persist_anomaly_alerts(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_persist_anomaly_alerts(date) TO service_role;


-- ---------------------------------------------------------------------------
-- 2. RPC: rpc_acknowledge_alert (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_alert(
  p_alert_id         uuid,
  p_notes            text DEFAULT NULL,
  p_is_false_positive boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id      uuid;
  v_actor_id       uuid;
  v_staff_role     text;
  v_current_status text;
  v_updated_id     uuid;
BEGIN
  -- ── 1. Context derivation (ADR-024 INV-8 — no p_casino_id param) ──────
  PERFORM public.set_rls_context_from_staff();
  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',  true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ── 2. Authorization check ────────────────────────────────────────────
  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. Role gate (SEC Note C2: pit_boss/admin only) ──────────────────
  IF v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'SHIFT_ACKNOWLEDGE_UNAUTHORIZED'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. Existence check ────────────────────────────────────────────────
  SELECT status INTO v_current_status
  FROM public.shift_alert
  WHERE id = p_alert_id
    AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_ALERT_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 5. Idempotent re-ack (already acknowledged/resolved = no-op) ─────
  IF v_current_status != 'open' THEN
    RETURN jsonb_build_object(
      'alert_id', p_alert_id,
      'status', v_current_status,
      'acknowledged_by', v_actor_id,
      'already_acknowledged', true
    );
  END IF;

  -- ── 6. Atomic state transition (SEC Note C4: forward-only) ───────────
  UPDATE public.shift_alert
  SET status = 'acknowledged',
      updated_at = now()
  WHERE id = p_alert_id
    AND casino_id = v_casino_id
    AND status = 'open'
  RETURNING id INTO v_updated_id;

  -- ── 7. Audit trail (SEC Note C3: actor binding from app.actor_id) ────
  INSERT INTO public.alert_acknowledgment (
    casino_id, alert_id, acknowledged_by, notes, is_false_positive
  ) VALUES (
    v_casino_id, p_alert_id, v_actor_id, p_notes, COALESCE(p_is_false_positive, false)
  );

  -- ── 8. Return result ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'alert_id', p_alert_id,
    'status', 'acknowledged',
    'acknowledged_by', v_actor_id,
    'already_acknowledged', false
  );
END;
$$;

-- ADR-018: Explicit owner for SECURITY DEFINER
ALTER FUNCTION public.rpc_acknowledge_alert(uuid, text, boolean) OWNER TO postgres;

-- Grants (DA P1-1): authenticated + service_role only
REVOKE ALL ON FUNCTION public.rpc_acknowledge_alert(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_acknowledge_alert(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_alert(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_alert(uuid, text, boolean) TO service_role;


-- ---------------------------------------------------------------------------
-- PostgREST reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
