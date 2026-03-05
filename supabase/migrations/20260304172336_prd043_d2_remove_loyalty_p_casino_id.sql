-- PRD-043 Delivery 2: Remove p_casino_id from 4 Loyalty RPCs
-- RPCs: rpc_accrue_on_close, rpc_apply_promotion, rpc_get_player_ledger, rpc_reconcile_loyalty_balance
-- Pattern: derive casino_id from RLS context (set_rls_context_from_staff), fail-closed NULL check
-- Ref: ADR-024 authoritative context derivation

BEGIN;

--------------------------------------------------------------------------------
-- RPC 7: rpc_accrue_on_close
-- OLD: (p_rating_slip_id uuid, p_casino_id uuid, p_idempotency_key uuid)
-- NEW: (p_rating_slip_id uuid, p_idempotency_key uuid)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_accrue_on_close(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE(
  ledger_id uuid,
  points_delta integer,
  theo numeric,
  balance_after integer,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_player_id uuid;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
BEGIN
  -- Derive context from JWT staff claim
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: pit_boss, admin
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot mint base accrual', v_caller_role;
  END IF;

  -- Fetch rating slip scoped to derived casino
  SELECT rs.*, v.player_id
  INTO v_slip
  FROM public.rating_slip rs
  JOIN public.visit v ON v.id = rs.visit_id
  WHERE rs.id = p_rating_slip_id AND rs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  v_player_id := v_slip.player_id;

  -- compliance_only: no points, just return balance
  IF v_slip.accrual_kind = 'compliance_only' THEN
    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_player_id
      AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_player_id, v_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      NULL::uuid, 0::int, 0::numeric, v_balance_after, false;
    RETURN;
  END IF;

  -- Calculate theo and base points from policy snapshot
  v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';
  IF v_loyalty_snapshot IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING: Rating slip lacks policy_snapshot.loyalty';
  END IF;

  v_theo := public.calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  v_base_points := ROUND(v_theo * COALESCE(
    NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
    10.0
  ))::int;

  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- Insert ledger entry (idempotent via ON CONFLICT)
  INSERT INTO public.loyalty_ledger (
    casino_id, player_id, rating_slip_id, visit_id,
    points_delta, reason, idempotency_key,
    source_kind, source_id, metadata
  ) VALUES (
    v_casino_id, v_player_id, p_rating_slip_id, v_slip.visit_id,
    v_base_points, 'base_accrual', p_idempotency_key,
    'rating_slip', p_rating_slip_id,
    jsonb_build_object(
      'calc', jsonb_build_object(
        'theo', v_theo,
        'base_points', v_base_points,
        'conversion_rate', COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0),
        'avg_bet', COALESCE(NULLIF(v_loyalty_snapshot->>'avg_bet', '')::numeric, v_slip.average_bet),
        'house_edge', COALESCE(NULLIF(v_loyalty_snapshot->>'house_edge', '')::numeric, 1.5),
        'duration_seconds', v_slip.duration_seconds,
        'decisions_per_hour', COALESCE(NULLIF(v_loyalty_snapshot->>'decisions_per_hour', '')::numeric, 70)
      ),
      'policy', jsonb_build_object(
        'snapshot_ref', 'rating_slip.policy_snapshot.loyalty',
        'version', v_loyalty_snapshot->>'policy_version'
      )
    )
  )
  ON CONFLICT (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual'
  DO NOTHING
  RETURNING id INTO ledger_id;

  -- Idempotent: if already existed, return existing entry
  IF NOT FOUND THEN
    SELECT * INTO v_existing_entry
    FROM public.loyalty_ledger
    WHERE casino_id = v_casino_id
      AND rating_slip_id = p_rating_slip_id
      AND reason = 'base_accrual';

    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = v_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_existing_entry.player_id, v_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      v_balance_after,
      true;
    RETURN;
  END IF;

  -- Update player loyalty balance
  UPDATE public.player_loyalty
  SET current_balance = current_balance + v_base_points,
      updated_at = now()
  WHERE player_id = v_player_id
    AND casino_id = v_casino_id
  RETURNING current_balance INTO v_balance_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
      v_player_id, v_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_accrue_on_close(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_accrue_on_close(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_accrue_on_close(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_accrue_on_close(uuid, uuid) TO service_role;

--------------------------------------------------------------------------------
-- RPC 8: rpc_apply_promotion
-- OLD: (p_casino_id uuid, p_rating_slip_id uuid, p_campaign_id text,
--       p_promo_multiplier numeric, p_bonus_points integer, p_idempotency_key uuid)
-- NEW: (p_rating_slip_id uuid, p_campaign_id text,
--       p_promo_multiplier numeric, p_bonus_points integer, p_idempotency_key uuid)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_apply_promotion(uuid, uuid, text, numeric, integer, uuid);

CREATE OR REPLACE FUNCTION public.rpc_apply_promotion(
  p_rating_slip_id uuid,
  p_campaign_id text,
  p_promo_multiplier numeric DEFAULT NULL::numeric,
  p_bonus_points integer DEFAULT 0,
  p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  ledger_id uuid,
  points_delta integer,
  balance_after integer,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_existing_entry record;
  v_player_loyalty_exists boolean;
  v_balance_after int;
BEGIN
  -- Derive context from JWT staff claim
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: pit_boss, admin
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot apply promotions', v_caller_role;
  END IF;

  -- Fetch rating slip scoped to derived casino
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.player_id IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_GHOST_VISIT_EXCLUDED: Rating slip % is for a ghost visit (player_id is null). Per ADR-014, ghost gaming visits are excluded from promotional rewards.', p_rating_slip_id;
  END IF;

  -- Idempotency check: return existing entry if already applied
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = v_casino_id
    AND rating_slip_id = p_rating_slip_id
    AND campaign_id = p_campaign_id
    AND reason = 'promotion';

  IF FOUND THEN
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = v_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      COALESCE(v_balance_after, 0),
      true;
    RETURN;
  END IF;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger (
    casino_id, player_id, rating_slip_id, visit_id,
    points_delta, reason, idempotency_key,
    campaign_id, source_kind, source_id, metadata
  ) VALUES (
    v_casino_id, v_slip.player_id, p_rating_slip_id, v_slip.visit_id,
    p_bonus_points, 'promotion', p_idempotency_key,
    p_campaign_id, 'campaign', NULL,
    jsonb_build_object(
      'promotion', jsonb_build_object(
        'campaign_id', p_campaign_id,
        'multiplier', p_promo_multiplier,
        'bonus_points', p_bonus_points
      )
    )
  )
  RETURNING id INTO ledger_id;

  -- Upsert player loyalty balance
  SELECT EXISTS(
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = v_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + p_bonus_points,
        updated_at = now()
    WHERE player_id = v_slip.player_id
      AND casino_id = v_casino_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    INSERT INTO player_loyalty (
      player_id, casino_id, current_balance, tier, preferences, updated_at
    ) VALUES (
      v_slip.player_id, v_casino_id, p_bonus_points, NULL, '{}', now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, p_bonus_points, v_balance_after, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_apply_promotion(uuid, text, numeric, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_apply_promotion(uuid, text, numeric, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_apply_promotion(uuid, text, numeric, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_apply_promotion(uuid, text, numeric, integer, uuid) TO service_role;

--------------------------------------------------------------------------------
-- RPC 9: rpc_get_player_ledger
-- OLD: (p_casino_id uuid, p_player_id uuid, p_cursor_created_at timestamptz,
--       p_cursor_id uuid, p_limit integer)
-- NEW: (p_player_id uuid, p_cursor_created_at timestamptz,
--       p_cursor_id uuid, p_limit integer)
-- STABLE volatility preserved
-- CRITICAL: Adding fail-closed NULL check (was missing — FR-1)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_get_player_ledger(uuid, uuid, timestamptz, uuid, integer);

CREATE OR REPLACE FUNCTION public.rpc_get_player_ledger(
  p_player_id uuid,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  casino_id uuid,
  player_id uuid,
  rating_slip_id uuid,
  visit_id uuid,
  staff_id uuid,
  points_delta integer,
  reason loyalty_reason,
  idempotency_key uuid,
  campaign_id text,
  source_kind text,
  source_id uuid,
  note text,
  metadata jsonb,
  created_at timestamp with time zone,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_fetch_limit int;
BEGIN
  -- Derive context from JWT staff claim
  PERFORM set_rls_context_from_staff();

  -- Fail-closed NULL check (FR-1: was missing in old version)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Clamp limit
  IF p_limit <= 0 OR p_limit > 100 THEN
    p_limit := 20;
  END IF;
  v_fetch_limit := p_limit + 1;

  RETURN QUERY
  WITH fetched_rows AS (
    SELECT
      ll.id, ll.casino_id, ll.player_id, ll.rating_slip_id, ll.visit_id,
      ll.staff_id, ll.points_delta, ll.reason, ll.idempotency_key,
      ll.campaign_id, ll.source_kind, ll.source_id, ll.note, ll.metadata,
      ll.created_at,
      row_number() OVER () as rn
    FROM loyalty_ledger ll
    WHERE ll.casino_id = v_casino_id
      AND ll.player_id = p_player_id
      AND (
        p_cursor_created_at IS NULL
        OR (
          ll.created_at < p_cursor_created_at
          OR (ll.created_at = p_cursor_created_at AND ll.id > p_cursor_id)
        )
      )
    ORDER BY ll.created_at DESC, ll.id ASC
    LIMIT v_fetch_limit
  )
  SELECT
    fr.id, fr.casino_id, fr.player_id, fr.rating_slip_id, fr.visit_id,
    fr.staff_id, fr.points_delta, fr.reason, fr.idempotency_key,
    fr.campaign_id, fr.source_kind, fr.source_id, fr.note, fr.metadata,
    fr.created_at,
    fr.rn > p_limit AS has_more
  FROM fetched_rows fr
  WHERE fr.rn <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_player_ledger(uuid, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_player_ledger(uuid, timestamptz, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_player_ledger(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_player_ledger(uuid, timestamptz, uuid, integer) TO service_role;

--------------------------------------------------------------------------------
-- RPC 10: rpc_reconcile_loyalty_balance
-- OLD: (p_player_id uuid, p_casino_id uuid)
-- NEW: (p_player_id uuid)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_reconcile_loyalty_balance(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_reconcile_loyalty_balance(
  p_player_id uuid
)
RETURNS TABLE(
  old_balance integer,
  new_balance integer,
  drift_detected boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
  v_caller_role text;
  v_old_balance int;
  v_new_balance int;
BEGIN
  -- Derive context from JWT staff claim
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: admin only
  v_caller_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: Only admin can reconcile balances (current role: %)', v_caller_role;
  END IF;

  -- Lock player loyalty row for update
  SELECT current_balance INTO v_old_balance
  FROM player_loyalty
  WHERE player_id = p_player_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_PLAYER_NOT_FOUND: Player % has no loyalty record', p_player_id;
  END IF;

  -- Compute correct balance from ledger
  SELECT COALESCE(SUM(ll.points_delta), 0) INTO v_new_balance
  FROM loyalty_ledger ll
  WHERE ll.player_id = p_player_id
    AND ll.casino_id = v_casino_id;

  -- Update if drift detected
  IF v_old_balance != v_new_balance THEN
    UPDATE player_loyalty
    SET current_balance = v_new_balance,
        updated_at = now()
    WHERE player_id = p_player_id
      AND casino_id = v_casino_id;

    RETURN QUERY SELECT v_old_balance, v_new_balance, true;
  ELSE
    RETURN QUERY SELECT v_old_balance, v_new_balance, false;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_reconcile_loyalty_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reconcile_loyalty_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_loyalty_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_loyalty_balance(uuid) TO service_role;

--------------------------------------------------------------------------------
-- Notify PostgREST to reload schema cache
--------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
