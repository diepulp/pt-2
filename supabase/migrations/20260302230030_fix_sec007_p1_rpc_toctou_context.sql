-- ============================================================================
-- SEC-007 P1 RPC TOCTOU + Context Fixes
-- Fixes: P1-5 (rpc_promo_exposure_rollup TOCTOU),
--        P1-6 (rpc_issue_mid_session_reward p_staff_id → context-derived)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-024, ADR-030
-- ============================================================================

-- P1-5: Add set_rls_context_from_staff() as first line of rpc_promo_exposure_rollup
-- Currently: SECURITY INVOKER, reads casino_id from context but doesn't inject it first.
-- TOCTOU risk: if middleware fails to set context, the function silently reads NULL
-- and raises an error — but only after potentially leaking timing info.
-- Fix: Inject context authoritatively before any data access.
CREATE OR REPLACE FUNCTION public.rpc_promo_exposure_rollup(
  p_gaming_day date DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_from_ts timestamptz DEFAULT NULL,
  p_to_ts timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
  -- =======================================================================
  -- ADR-024: Authoritative RLS Context Injection (SEC-007 P1-5 fix)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- Extract casino_id from RLS context
  v_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not available in context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Determine time window
  IF p_gaming_day IS NOT NULL THEN
    SELECT
      (p_gaming_day::date + cs.gaming_day_start_time::time) AT TIME ZONE cs.timezone,
      (p_gaming_day::date + interval '1 day' + cs.gaming_day_start_time::time) AT TIME ZONE cs.timezone
    INTO v_from_ts, v_to_ts
    FROM casino_settings cs
    WHERE cs.casino_id = v_casino_id;

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

COMMENT ON FUNCTION public.rpc_promo_exposure_rollup IS
  'Promotional coupon exposure rollup. SEC-007 P1-5: Added set_rls_context_from_staff() '
  'for TOCTOU protection. ADR-024 compliant context injection.';

-- ============================================================================
-- P1-6: Replace p_staff_id with context-derived actor_id in
--        rpc_issue_mid_session_reward
-- Currently: p_staff_id is a spoofable parameter used for audit trail
-- Fix: Remove p_staff_id param, derive from app.actor_id context variable
-- ============================================================================

-- DROP the old 7-param signature (4 required + 3 with defaults)
DROP FUNCTION IF EXISTS public.rpc_issue_mid_session_reward(uuid, uuid, uuid, uuid, int, text, loyalty_reason);

CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_points int,
  p_idempotency_key text DEFAULT NULL,
  p_reason loyalty_reason DEFAULT 'manual_reward'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
  v_context_actor_id uuid;
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- SEC-007 P1-6: Derive actor_id from context instead of spoofable p_staff_id
  v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Verify rating slip eligibility (derives player_id from visit)
  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM loyalty_ledger
       WHERE idempotency_key = p_idempotency_key
         AND casino_id = p_casino_id
    ) THEN
      RETURN QUERY
        SELECT ll.id,
               (
                 SELECT current_balance
                   FROM player_loyalty
                  WHERE player_id = p_player_id
                    AND casino_id = p_casino_id
               )
          FROM loyalty_ledger ll
         WHERE ll.idempotency_key = p_idempotency_key
           AND ll.casino_id = p_casino_id;
      RETURN;
    END IF;
  END IF;

  -- Insert ledger entry (staff_id now from context, not parameter)
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_delta,
    reason,
    idempotency_key,
    created_at
  )
  VALUES (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    v_context_actor_id,  -- SEC-007 P1-6: was p_staff_id (spoofable)
    p_points,
    COALESCE(p_reason, 'manual_reward'),
    p_idempotency_key,
    v_now
  )
  RETURNING id INTO v_ledger_id;

  -- Update or insert player_loyalty balance
  INSERT INTO player_loyalty (player_id, casino_id, current_balance, updated_at)
  VALUES (p_player_id, p_casino_id, p_points, v_now)
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    current_balance = player_loyalty.current_balance + p_points,
    updated_at = v_now
  RETURNING current_balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$$;

COMMENT ON FUNCTION rpc_issue_mid_session_reward IS
  'Issues mid-session loyalty points. SEC-007 P1-6: p_staff_id removed — actor derived '
  'from app.actor_id context. ADR-024: Uses set_rls_context_from_staff().';

-- Re-issue REVOKE/GRANT for new signature
REVOKE ALL ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, uuid, int, text, loyalty_reason) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, uuid, int, text, loyalty_reason) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, uuid, int, text, loyalty_reason) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_issue_mid_session_reward(uuid, uuid, uuid, int, text, loyalty_reason) TO service_role;

NOTIFY pgrst, 'reload schema';
