-- =====================================================
-- Migration: Promo Exposure Rollup Queries
-- Created: 2026-01-07 00:18:09
-- PRD: PRD-LOYALTY-PROMO (WS7)
-- Purpose: Live aggregation RPC for shift dashboard promo exposure lens
-- =====================================================
-- This migration creates:
--   1. rpc_promo_exposure_rollup - Live aggregation query for promo exposure metrics
--
-- Ownership: LoyaltyService (owns promo_coupon; provides rollup queries consumed by dashboards)
-- ADR-024 Compliance: SECURITY INVOKER for read-only queries
-- DoD: "Shift rollups updated to include promo exposure + outstanding"
-- =====================================================

BEGIN;

-- ============================================================================
-- STEP 1: RPC - rpc_promo_exposure_rollup (SECURITY INVOKER per ADR-018)
-- ============================================================================
-- Live aggregation query for promo exposure metrics.
-- Used by shift dashboards for "Promo Lens" section (separate from cash KPIs).
-- Parameters:
--   p_gaming_day: Filter by gaming day (optional)
--   p_shift_id: Filter by shift (optional, future use)
--   p_from_ts: Filter coupons issued after this time (optional)
--   p_to_ts: Filter coupons issued before this time (optional)
--
-- Returns promo exposure metrics:
--   - total_issued_face_value: Sum of face value for issued coupons in time window
--   - total_issued_patron_risk: Sum of required match wager in time window
--   - outstanding_count: Count of currently issued (uncleared/unvoided) coupons
--   - outstanding_face_value: Sum of face value for outstanding coupons
--   - voided_count: Count of voided coupons in time window
--   - replaced_count: Count of replaced coupons in time window
--   - expiring_soon_count: Count of issued coupons expiring within 24 hours

CREATE OR REPLACE FUNCTION public.rpc_promo_exposure_rollup(
  p_gaming_day date DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_from_ts timestamptz DEFAULT NULL,
  p_to_ts timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Read-only, uses caller's RLS context
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_result jsonb;
  v_issued_stats record;
  v_outstanding_stats record;
  v_status_counts record;
  v_expiring_count bigint;
BEGIN
  -- Extract casino_id from RLS context (set by middleware)
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not available in context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Determine time window
  -- If gaming_day provided, use casino's gaming day boundaries
  -- Otherwise use from_ts/to_ts or default to last 24 hours
  IF p_gaming_day IS NOT NULL THEN
    -- Get gaming day boundaries from casino_settings
    SELECT
      (p_gaming_day::date + cs.gaming_day_start_time::time) AT TIME ZONE cs.timezone,
      (p_gaming_day::date + interval '1 day' + cs.gaming_day_start_time::time) AT TIME ZONE cs.timezone
    INTO v_from_ts, v_to_ts
    FROM casino_settings cs
    WHERE cs.casino_id = v_casino_id;

    -- Fallback if no casino settings
    IF v_from_ts IS NULL THEN
      v_from_ts := p_gaming_day::timestamptz;
      v_to_ts := (p_gaming_day + interval '1 day')::timestamptz;
    END IF;
  ELSE
    v_from_ts := COALESCE(p_from_ts, now() - interval '24 hours');
    v_to_ts := COALESCE(p_to_ts, now());
  END IF;

  -- Calculate issued stats within time window
  SELECT
    COALESCE(COUNT(*), 0)::bigint AS issued_count,
    COALESCE(SUM(face_value_amount), 0)::numeric AS total_face_value,
    COALESCE(SUM(required_match_wager_amount), 0)::numeric AS total_patron_risk
  INTO v_issued_stats
  FROM promo_coupon
  WHERE casino_id = v_casino_id
    AND issued_at >= v_from_ts
    AND issued_at < v_to_ts;

  -- Calculate outstanding (currently issued, not voided/replaced/cleared)
  SELECT
    COALESCE(COUNT(*), 0)::bigint AS outstanding_count,
    COALESCE(SUM(face_value_amount), 0)::numeric AS outstanding_face_value
  INTO v_outstanding_stats
  FROM promo_coupon
  WHERE casino_id = v_casino_id
    AND status = 'issued';

  -- Calculate voided and replaced counts within time window
  SELECT
    COALESCE(SUM(CASE WHEN status = 'voided' AND voided_at >= v_from_ts AND voided_at < v_to_ts THEN 1 ELSE 0 END), 0)::bigint AS voided_count,
    COALESCE(SUM(CASE WHEN status = 'replaced' AND replaced_at >= v_from_ts AND replaced_at < v_to_ts THEN 1 ELSE 0 END), 0)::bigint AS replaced_count
  INTO v_status_counts
  FROM promo_coupon
  WHERE casino_id = v_casino_id;

  -- Calculate expiring soon (issued coupons expiring within 24 hours)
  SELECT
    COALESCE(COUNT(*), 0)::bigint
  INTO v_expiring_count
  FROM promo_coupon
  WHERE casino_id = v_casino_id
    AND status = 'issued'
    AND expires_at IS NOT NULL
    AND expires_at < now() + interval '24 hours'
    AND expires_at > now();

  -- Build result object
  v_result := jsonb_build_object(
    'casino_id', v_casino_id,
    'gaming_day', p_gaming_day,
    'from_ts', v_from_ts,
    'to_ts', v_to_ts,
    'issued_count', v_issued_stats.issued_count,
    'total_issued_face_value', v_issued_stats.total_face_value,
    'total_issued_patron_risk', v_issued_stats.total_patron_risk,
    'outstanding_count', v_outstanding_stats.outstanding_count,
    'outstanding_face_value', v_outstanding_stats.outstanding_face_value,
    'voided_count', v_status_counts.voided_count,
    'replaced_count', v_status_counts.replaced_count,
    'expiring_soon_count', v_expiring_count
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_promo_exposure_rollup TO authenticated;

COMMENT ON FUNCTION public.rpc_promo_exposure_rollup IS
  'PRD-LOYALTY-PROMO WS7: Live aggregation query for promo exposure metrics. '
  'Used by shift dashboards for "Promo Lens" section (separate from cash KPIs). '
  'SECURITY INVOKER per ADR-018 (read-only). RLS filters results to caller''s casino.';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
