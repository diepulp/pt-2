-- ============================================================================
-- Migration: Enable Adjustment Telemetry Flow
-- Created: 2026-02-02
-- Issue: ISSUE-SHIFT-DASH-STALE-ADJ (P1)
-- Purpose: Fix 5 compounding gaps that prevent buy-in adjustments from
--          reaching the shift dashboard telemetry pipeline.
--
-- Sub-tasks (all atomic in single transaction):
--   WS2-A: Relax telemetry constraints for negative amounts & RATED_ADJUSTMENT
--   WS2-B: Inherit rating_slip_id in adjustment RPC
--   WS2-C: Extend bridge trigger for adjustment path
--   WS2-D: Update rpc_shift_table_metrics to include RATED_ADJUSTMENT
-- ============================================================================

BEGIN;

-- ==========================================================================
-- WS2-A: Relax telemetry constraints
-- ==========================================================================
-- Allow negative amounts (adjustments) and add RATED_ADJUSTMENT kind.

-- 1. Replace chk_amount_positive with chk_amount_nonzero
ALTER TABLE public.table_buyin_telemetry
  DROP CONSTRAINT IF EXISTS chk_amount_positive;

ALTER TABLE public.table_buyin_telemetry
  ADD CONSTRAINT chk_amount_nonzero CHECK (amount_cents <> 0);

-- 2. Replace chk_telemetry_kind with expanded set including RATED_ADJUSTMENT
ALTER TABLE public.table_buyin_telemetry
  DROP CONSTRAINT IF EXISTS chk_telemetry_kind;

ALTER TABLE public.table_buyin_telemetry
  ADD CONSTRAINT chk_telemetry_kind CHECK (
    telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN', 'RATED_ADJUSTMENT')
  );

-- 3. Replace chk_rated_requires_linkage to include RATED_ADJUSTMENT
ALTER TABLE public.table_buyin_telemetry
  DROP CONSTRAINT IF EXISTS chk_rated_requires_linkage;

ALTER TABLE public.table_buyin_telemetry
  ADD CONSTRAINT chk_rated_requires_linkage CHECK (
    telemetry_kind NOT IN ('RATED_BUYIN', 'RATED_ADJUSTMENT')
    OR (visit_id IS NOT NULL AND rating_slip_id IS NOT NULL)
  );

-- ==========================================================================
-- WS2-B: Inherit rating_slip_id in adjustment RPC
-- ==========================================================================
-- When p_original_txn_id is provided, extract and carry forward the
-- rating_slip_id so the bridge trigger can fire for rated adjustments.

CREATE OR REPLACE FUNCTION public.rpc_create_financial_adjustment(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_delta_amount numeric,
  p_reason_code adjustment_reason_code,
  p_note text,
  p_original_txn_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_original_txn player_financial_transaction%ROWTYPE;
  v_row player_financial_transaction%ROWTYPE;
  v_direction financial_direction;
  v_rating_slip_id uuid;  -- Inherited from original transaction
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Casino ID mismatch';
  END IF;

  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  -- =======================================================================
  -- Input Validation
  -- =======================================================================
  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

  -- =======================================================================
  -- If linking to original transaction, validate and inherit scope
  -- =======================================================================
  IF p_original_txn_id IS NOT NULL THEN
    SELECT * INTO v_original_txn
      FROM player_financial_transaction
     WHERE id = p_original_txn_id
       AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Original transaction not found or access denied';
    END IF;

    IF v_original_txn.player_id <> p_player_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different player';
    END IF;

    IF v_original_txn.visit_id <> p_visit_id THEN
      RAISE EXCEPTION 'INVALID_INPUT: Cannot adjust transaction for different visit';
    END IF;

    -- Inherit rating_slip_id so bridge trigger can fire for rated adjustments
    v_rating_slip_id := v_original_txn.rating_slip_id;
  END IF;

  -- =======================================================================
  -- Determine direction
  -- =======================================================================
  v_direction := 'in';

  -- =======================================================================
  -- Create the adjustment transaction (now includes rating_slip_id)
  -- =======================================================================
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    rating_slip_id,
    created_at,
    idempotency_key,
    txn_kind,
    reason_code,
    note
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_delta_amount,
    v_direction,
    'pit',
    'adjustment',
    v_actor_id,
    p_original_txn_id,
    v_rating_slip_id,      -- Inherited from original (NULL if no original)
    now(),
    p_idempotency_key,
    'adjustment',
    p_reason_code,
    p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rpc_create_financial_adjustment IS
  'Creates a financial adjustment transaction. Compliance-friendly corrections '
  'to cash-in totals without modifying/deleting original records. '
  'Inherits rating_slip_id from original transaction (if provided) to enable '
  'bridge trigger telemetry flow. '
  'Requires: reason_code + note (min 10 chars). '
  'Authorization: pit_boss, cashier, or admin role. '
  'ADR-024 compliant: Uses set_rls_context_from_staff() for secure context.';

-- ==========================================================================
-- WS2-C: Extend bridge trigger for adjustment path
-- ==========================================================================
-- Now handles both rated buy-ins AND rated adjustments.
-- ADR-031: amount passes through as-is (already cents, no conversion).
-- CRITICAL: This replaces the WS1 version and MUST NOT reintroduce * 100.

CREATE OR REPLACE FUNCTION bridge_rated_buyin_to_telemetry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_idempotency_key text;
  v_gaming_day date;
  v_telemetry_kind text;
BEGIN
  -- Determine telemetry kind based on transaction type
  IF NEW.txn_kind = 'adjustment' AND NEW.rating_slip_id IS NOT NULL THEN
    -- Rated adjustment: correction to a rated buy-in
    v_telemetry_kind := 'RATED_ADJUSTMENT';
  ELSIF NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL THEN
    -- Rated buy-in: original rated transaction
    v_telemetry_kind := 'RATED_BUYIN';
  ELSE
    -- Not a rated buy-in or rated adjustment — skip
    RETURN NEW;
  END IF;

  -- Get table_id from rating_slip, gaming_day from visit
  SELECT rs.table_id, v.gaming_day INTO v_table_id, v_gaming_day
  FROM rating_slip rs
  JOIN visit v ON v.id = rs.visit_id
  WHERE rs.id = NEW.rating_slip_id;

  IF v_table_id IS NULL THEN
    -- If no table_id found, skip silently (rating slip may be incomplete)
    RETURN NEW;
  END IF;

  -- G3: Idempotency key prevents duplicates
  v_idempotency_key := 'pft:' || NEW.id::text;

  -- G4: Insert into telemetry (idempotent)
  -- ON CONFLICT matches partial unique index idx_tbt_idempotency
  -- on (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  INSERT INTO table_buyin_telemetry (
    casino_id,
    table_id,
    telemetry_kind,
    amount_cents,
    source,
    rating_slip_id,
    visit_id,
    actor_id,
    idempotency_key,
    gaming_day,
    created_at
  ) VALUES (
    NEW.casino_id,
    v_table_id,
    v_telemetry_kind,
    COALESCE(NEW.amount, 0)::bigint, -- ADR-031: amount already in cents, no conversion
    'finance_bridge',
    NEW.rating_slip_id,
    NEW.visit_id,
    NEW.created_by_staff_id,
    v_idempotency_key,
    COALESCE(v_gaming_day, NEW.gaming_day),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bridge_rated_buyin_to_telemetry() IS
  'Bridges rated buy-ins and rated adjustments from player_financial_transaction '
  'to table_buyin_telemetry. ADR-031: amount passes through as-is (already cents). '
  'Handles RATED_BUYIN (direction=in + rating_slip_id) and RATED_ADJUSTMENT '
  '(txn_kind=adjustment + rating_slip_id). Gets gaming_day from visit table. '
  'Uses idempotency key pattern (pft:{transaction_id}).';

-- ==========================================================================
-- WS2-D: Update rpc_shift_table_metrics — include RATED_ADJUSTMENT in aggregation
-- ==========================================================================
-- rated_cents now includes both RATED_BUYIN and RATED_ADJUSTMENT.
-- total_cents (unfiltered SUM) already captures all kinds.
-- rated_count includes RATED_ADJUSTMENT for telemetry quality calculation.

CREATE OR REPLACE FUNCTION public.rpc_shift_table_metrics(
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
      gt.pit AS tbl_pit
    FROM public.gaming_table gt
    WHERE gt.casino_id = v_context_casino_id
      AND gt.status = 'active'
  ),

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

    os.snapshot_id AS opening_snapshot_id,
    os.snapshot_at AS opening_snapshot_at,
    os.bankroll_total_cents AS opening_bankroll_total_cents,

    cs.snapshot_id AS closing_snapshot_id,
    cs.snapshot_at AS closing_snapshot_at,
    cs.bankroll_total_cents AS closing_bankroll_total_cents,

    COALESCE(fa.fills_total, 0)::bigint AS fills_total_cents,
    COALESCE(ca.credits_total, 0)::bigint AS credits_total_cents,

    COALESCE(dc.has_drop, FALSE) AS drop_custody_present,

    COALESCE(ta.rated_cents, 0)::bigint AS estimated_drop_rated_cents,
    COALESCE(ta.grind_cents, 0)::bigint AS estimated_drop_grind_cents,
    COALESCE(ta.total_cents, 0)::bigint AS estimated_drop_buyins_cents,

    -- Telemetry quality: RATED_ADJUSTMENT counts as rated activity
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

    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
      ELSE NULL
    END::bigint AS win_loss_inventory_cents,

    CASE
      WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
        (cs.bankroll_total_cents - os.bankroll_total_cents)
        + COALESCE(fa.fills_total, 0)
        - COALESCE(ca.credits_total, 0)
        + COALESCE(ta.total_cents, 0)
      ELSE NULL
    END::bigint AS win_loss_estimated_cents,

    'ESTIMATE'::text AS metric_grade,

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

REVOKE ALL ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid) IS
  'Compute per-table shift metrics for a time window. '
  'Returns opening/closing bankroll, fills, credits, telemetry (rated + grind + adjustments), and dual-stream win/loss. '
  'RATED_ADJUSTMENT telemetry rolls into estimated_drop_rated_cents (negative amounts reduce total). '
  'win_loss_inventory = (closing - opening) + fills - credits. '
  'win_loss_estimated = win_loss_inventory + estimated_drop_buyins. '
  'metric_grade is always ESTIMATE (count room integration deferred). '
  'telemetry_quality: GOOD_COVERAGE (grind logged), LOW_COVERAGE (rated/adjustment only), NONE.';

NOTIFY pgrst, 'reload schema';

COMMIT;
