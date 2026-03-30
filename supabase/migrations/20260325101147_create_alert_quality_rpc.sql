-- =============================================================================
-- Migration: Alert Quality RPC (PRD-056 WS10)
-- Description: rpc_get_alert_quality — SECURITY INVOKER aggregate telemetry.
--              Pattern C RLS on shift_alert enforces casino scope.
-- Reference: ADR-046, PRD-056 §4.3
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_alert_quality(
  p_start  date,
  p_end    date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_alerts', count(*),
    'acknowledged_count', count(*) FILTER (WHERE sa.status = 'acknowledged'),
    'false_positive_count', count(aa.id) FILTER (WHERE aa.is_false_positive),
    'median_acknowledge_latency_ms', percentile_cont(0.5) WITHIN GROUP
      (ORDER BY EXTRACT(EPOCH FROM (aa.created_at - sa.created_at)) * 1000)
  ) INTO v_result
  FROM public.shift_alert sa
  LEFT JOIN public.alert_acknowledgment aa ON sa.id = aa.alert_id
  WHERE sa.gaming_day BETWEEN p_start AND p_end;
  -- RLS enforces casino_id scope (SECURITY INVOKER)

  RETURN v_result;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.rpc_get_alert_quality(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_alert_quality(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_alert_quality(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_alert_quality(date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
