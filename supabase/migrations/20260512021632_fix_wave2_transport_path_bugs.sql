-- Migration: 20260512021632_fix_wave2_transport_path_bugs.sql
-- PRD-082 WS4 transport-path patches required before proof suite can pass.
--
-- Bug 1: rpc_create_financial_txn — ON CONFLICT DO UPDATE triggers
--   player_financial_transaction_no_updates denial policy (USING=false) even
--   when no conflict occurs. PostgreSQL checks the UPDATE USING policy for any
--   INSERT ... ON CONFLICT DO UPDATE statement, regardless of whether a conflict
--   is actually encountered. Fix: change to DO NOTHING + SELECT fallback.
--
-- Bug 2: bridge_rated_buyin_to_telemetry() — Wave 2 migration 20260511134200
--   added event_type NOT NULL to table_buyin_telemetry but did not update this
--   trigger function. Fix: supply event_type derived from v_telemetry_kind.
--
-- Bug 3: rpc_create_financial_adjustment — same DO UPDATE issue as Bug 1.
--   Not exercised by proof suite but fixed here for transport-path completeness.

BEGIN;

-- ===========================================================================
-- Fix 1: rpc_create_financial_txn — ON CONFLICT DO NOTHING + SELECT fallback
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_player_id               uuid,
  p_visit_id                uuid,
  p_amount                  numeric,
  p_direction               financial_direction,
  p_source                  financial_source,
  p_tender_type             text                      DEFAULT NULL::text,
  p_rating_slip_id          uuid                      DEFAULT NULL::uuid,
  p_related_transaction_id  uuid                      DEFAULT NULL::uuid,
  p_idempotency_key         text                      DEFAULT NULL::text,
  p_created_at              timestamp with time zone  DEFAULT now(),
  p_external_ref            text                      DEFAULT NULL::text
)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_row        player_financial_transaction%ROWTYPE;
  v_table_id   uuid;
BEGIN
  -- =======================================================================
  -- ADR-024 + ADR-040: Authoritative context injection
  -- =======================================================================
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- =======================================================================
  -- Authentication and Authorization Checks
  -- =======================================================================
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: casino context missing';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SEC-007: actor context missing';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('cashier', 'pit_boss', 'admin') THEN
    RAISE EXCEPTION 'unauthorized: staff_role=% is not permitted to create financial transactions', v_staff_role;
  END IF;

  -- =======================================================================
  -- Role-specific validation (SEC-005 v1.2.0)
  -- =======================================================================
  IF v_staff_role = 'pit_boss' THEN
    IF p_direction != 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction=in)';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss can only use cash or chips for buy-ins';
    END IF;
  END IF;

  -- =======================================================================
  -- Transaction Creation (ADR-040: created_by_staff_id derived from context)
  -- =======================================================================
  -- DO NOTHING (not DO UPDATE) — player_financial_transaction_no_updates has
  -- USING=false, so any ON CONFLICT DO UPDATE violates the denial policy even
  -- when no conflict occurs. On idempotency replay, SELECT fetches existing row.
  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key,
    external_ref
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    v_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    v_actor_id,
    p_related_transaction_id,
    COALESCE(p_created_at, now()),
    p_idempotency_key,
    p_external_ref
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING t.* INTO v_row;

  -- Idempotency replay: RETURNING is empty on DO NOTHING — fetch existing row
  IF v_row.id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.player_financial_transaction
    WHERE casino_id = v_casino_id
      AND idempotency_key = p_idempotency_key;
  END IF;

  -- =======================================================================
  -- Wave 2 Outbox Emission (ADR-057 Class A table-anchor eligibility check)
  -- =======================================================================

  -- F13: non-table-scoped buyin (no rating_slip_id) — no outbox row, no error
  IF p_rating_slip_id IS NULL THEN
    RETURN v_row;
  END IF;

  -- Resolve rating_slip_id → same-casino table_id
  SELECT rs.table_id INTO v_table_id
  FROM public.rating_slip rs
  WHERE rs.id = p_rating_slip_id
    AND rs.casino_id = v_casino_id;

  IF v_table_id IS NULL THEN
    -- F14: rating_slip_id supplied but nonexistent or cross-casino → reject entire write
    RAISE EXCEPTION 'INVALID_INPUT: rating_slip_id % does not resolve to a same-casino table. Financial write rejected. No outbox row emitted.', p_rating_slip_id
      USING ERRCODE = 'P0001';
  END IF;

  -- F15: idempotency replay — outbox row already exists for this PFT row
  IF EXISTS (
    SELECT 1 FROM public.finance_outbox WHERE aggregate_id = v_row.id
  ) THEN
    RETURN v_row;
  END IF;

  -- Atomic outbox INSERT in same transaction as PFT INSERT above (DEC-Q4)
  INSERT INTO public.finance_outbox (
    event_id,
    event_type,
    fact_class,
    origin_label,
    casino_id,
    table_id,
    player_id,
    aggregate_id,
    payload,
    created_at
  ) VALUES (
    public.generate_uuid_v7(),
    'buyin.recorded',
    'ledger',
    'actual',
    v_casino_id,
    v_table_id,
    v_row.player_id,
    v_row.id,
    jsonb_build_object('amount', v_row.amount, 'tender_type', v_row.tender_type),
    NOW()
  );

  RETURN v_row;
END;
$function$;

-- ===========================================================================
-- Fix 2: bridge_rated_buyin_to_telemetry — supply event_type (Wave 2 NOT NULL)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.bridge_rated_buyin_to_telemetry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id       uuid;
  v_idempotency_key text;
  v_gaming_day     date;
  v_telemetry_kind text;
  v_event_type     text;
BEGIN
  -- Determine telemetry kind based on transaction type
  IF NEW.txn_kind = 'adjustment' AND NEW.rating_slip_id IS NOT NULL THEN
    v_telemetry_kind := 'RATED_ADJUSTMENT';
    v_event_type     := 'buyin.observed';
  ELSIF NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL THEN
    v_telemetry_kind := 'RATED_BUYIN';
    v_event_type     := 'buyin.observed';
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

  -- Idempotency key prevents duplicates
  v_idempotency_key := 'pft:' || NEW.id::text;

  INSERT INTO table_buyin_telemetry (
    casino_id,
    table_id,
    telemetry_kind,
    event_type,
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
    v_event_type,
    COALESCE(NEW.amount, 0)::bigint,
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

-- ===========================================================================
-- Fix 3: rpc_create_financial_adjustment — same DO NOTHING fix as Fix 1
-- ===========================================================================

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
  v_rating_slip_id uuid;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Casino ID mismatch';
  END IF;

  IF v_staff_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % not authorized for adjustments', v_staff_role;
  END IF;

  IF p_delta_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Delta amount cannot be zero';
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note is required for adjustments';
  END IF;

  IF length(trim(p_note)) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Note must be at least 10 characters';
  END IF;

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

    v_rating_slip_id := v_original_txn.rating_slip_id;
  END IF;

  v_direction := 'in';

  INSERT INTO public.player_financial_transaction AS t (
    id, player_id, casino_id, visit_id, amount, direction, source, tender_type,
    created_by_staff_id, related_transaction_id, rating_slip_id, created_at,
    idempotency_key, txn_kind, reason_code, note
  )
  VALUES (
    gen_random_uuid(), p_player_id, p_casino_id, p_visit_id, p_delta_amount,
    v_direction, 'pit', 'adjustment', v_actor_id, p_original_txn_id, v_rating_slip_id,
    now(), p_idempotency_key, 'adjustment', p_reason_code, p_note
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING t.* INTO v_row;

  -- Idempotency replay: fetch existing row if DO NOTHING triggered
  IF v_row.id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.player_financial_transaction
    WHERE casino_id = v_casino_id
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_row;
END;
$$;

-- ===========================================================================
-- Fix 4: finance_outbox INSERT policy for authenticated role
-- ===========================================================================
-- Wave 2 migration 20260511134100 intentionally left no authenticated policies,
-- commenting "SECURITY DEFINER RPCs insert directly." But rpc_create_financial_txn
-- is SECURITY INVOKER (per ADR-040), so its outbox INSERT runs as authenticated.
-- With RLS enabled and no INSERT policy, the insert fails with default-deny.
-- Fix: add policy allowing authenticated staff with casino context to insert.
-- Constraint: casino_id in the new row must match app.casino_id GUC (set by
-- set_rls_context_from_staff()) to prevent cross-casino outbox injection.

DROP POLICY IF EXISTS finance_outbox_insert_staff ON public.finance_outbox;
CREATE POLICY finance_outbox_insert_staff ON public.finance_outbox
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND NULLIF((select current_setting('app.casino_id', true)), '') IS NOT NULL
    AND casino_id = (select current_setting('app.casino_id', true))::uuid
  );

GRANT INSERT ON public.finance_outbox TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
