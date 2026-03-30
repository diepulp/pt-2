-- =============================================================================
-- Migration: Alert Maturity Schema (PRD-056 WS1)
-- Description: shift_alert + alert_acknowledgment tables with Pattern C RLS,
--              DELETE denial, RPC-only mutation posture. ALTER table_metric_baseline
--              to add last_error. Cooldown seed.
-- Reference: ADR-015, ADR-046, ADR-018, ADR-024, ADR-030
-- RLS_REVIEW_COMPLETE: Pattern C hybrid SELECT-only + DELETE denial (VERIFIED_SAFE)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALTER table_metric_baseline — add last_error column
-- ---------------------------------------------------------------------------
ALTER TABLE public.table_metric_baseline
ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.table_metric_baseline.last_error IS
  'Last computation error message (truncated to 500 chars by RPC). '
  'NULL = healthy. Populated by rpc_compute_rolling_baseline EXCEPTION handler.';

-- ---------------------------------------------------------------------------
-- 2. Table: shift_alert
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_alert (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid        NOT NULL REFERENCES public.casino(id),
  table_id        uuid        NOT NULL REFERENCES public.gaming_table(id),
  metric_type     text        NOT NULL,
  gaming_day      date        NOT NULL,
  status          text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity        text        NOT NULL
                              CHECK (severity IN ('low', 'medium', 'high')),
  observed_value  numeric     NOT NULL,
  baseline_median numeric,
  baseline_mad    numeric,
  deviation_score numeric,
  direction       text        CHECK (direction IN ('above', 'below')),
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Dedup key: one alert per (casino, table, metric, gaming_day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_alert_dedup
  ON public.shift_alert (casino_id, table_id, metric_type, gaming_day);

-- Read path: admin alerts page queries by (casino, gaming_day, status)
CREATE INDEX IF NOT EXISTS idx_shift_alert_casino_day_status
  ON public.shift_alert (casino_id, gaming_day, status);

COMMENT ON TABLE public.shift_alert IS
  'Persistent anomaly alerts with forward-only state machine (open → acknowledged → resolved). '
  'Mutation via RPCs only — no direct INSERT/UPDATE policies for authenticated role. '
  'PRD-056 (C-2).';

-- ---------------------------------------------------------------------------
-- 3. Table: alert_acknowledgment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_acknowledgment (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid        NOT NULL REFERENCES public.casino(id),
  alert_id        uuid        NOT NULL REFERENCES public.shift_alert(id),
  acknowledged_by uuid        NOT NULL REFERENCES public.staff(id),
  notes           text,
  is_false_positive boolean   NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Join path: lookup acknowledgment by alert
CREATE INDEX IF NOT EXISTS idx_alert_ack_alert_id
  ON public.alert_acknowledgment (alert_id);

COMMENT ON TABLE public.alert_acknowledgment IS
  'Append-only audit trail for alert acknowledgments. '
  'One record per acknowledgment action — no UPDATE policy. '
  'PRD-056 (C-2).';

-- ---------------------------------------------------------------------------
-- 4. RLS: Pattern C Hybrid SELECT + DELETE Denial (shift_alert)
-- ---------------------------------------------------------------------------
ALTER TABLE public.shift_alert ENABLE ROW LEVEL SECURITY;

-- SELECT: Pattern C hybrid (ADR-015) — auth guard + session var + JWT fallback
CREATE POLICY shift_alert_select_casino_scope ON public.shift_alert
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- DELETE denied — forward-only state machine, no deletes (PRD-056 §4.1)
CREATE POLICY shift_alert_no_deletes ON public.shift_alert
  FOR DELETE
  TO authenticated
  USING (false);

-- No INSERT/UPDATE policies — RPC-only mutation surface (SEC Note C7)

-- ---------------------------------------------------------------------------
-- 5. RLS: Pattern C Hybrid SELECT + DELETE Denial (alert_acknowledgment)
-- ---------------------------------------------------------------------------
ALTER TABLE public.alert_acknowledgment ENABLE ROW LEVEL SECURITY;

-- SELECT: Pattern C hybrid (ADR-015)
CREATE POLICY alert_ack_select_casino_scope ON public.alert_acknowledgment
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- DELETE denied — append-only audit trail
CREATE POLICY alert_ack_no_deletes ON public.alert_acknowledgment
  FOR DELETE
  TO authenticated
  USING (false);

-- No INSERT/UPDATE policies — RPC-only mutation surface

-- ---------------------------------------------------------------------------
-- 6. Grant posture (DA P1-1)
-- ---------------------------------------------------------------------------
-- shift_alert: authenticated can SELECT only (via RLS), no direct mutations
REVOKE ALL ON TABLE public.shift_alert FROM PUBLIC;
REVOKE ALL ON TABLE public.shift_alert FROM anon;
GRANT SELECT ON TABLE public.shift_alert TO authenticated;

-- alert_acknowledgment: same posture
REVOKE ALL ON TABLE public.alert_acknowledgment FROM PUBLIC;
REVOKE ALL ON TABLE public.alert_acknowledgment FROM anon;
GRANT SELECT ON TABLE public.alert_acknowledgment TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cooldown seed (DA P1-2)
-- ---------------------------------------------------------------------------
UPDATE public.casino_settings
SET alert_thresholds = alert_thresholds || '{"cooldown_minutes": 60}'::jsonb
WHERE NOT (alert_thresholds ? 'cooldown_minutes');

-- ---------------------------------------------------------------------------
-- 8. PostgREST reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
