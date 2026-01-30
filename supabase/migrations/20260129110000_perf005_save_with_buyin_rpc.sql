-- PERF-005 WS7: Composite Save-with-BuyIn RPC
--
-- Purpose: Atomically update average_bet and record buy-in financial transaction
-- in a single database round-trip. Replaces sequential PATCH + POST pattern
-- that caused 4,935ms save-flow latency.
--
-- ADR-024: Self-injects RLS context via set_rls_context_from_staff()
-- INV-8: No p_casino_id or p_actor_id parameters (context is authoritative)
--
-- Cross-context justification: Atomic composite prevents double-entry bugs
-- that occurred when average_bet validation failed but financial transaction
-- had already committed (sequential pattern).
--
-- @see PERF-005 Rating Slip Comprehensive Performance Remediation
-- @see ADR-024 Authoritative Context Derivation

CREATE OR REPLACE FUNCTION public.rpc_save_rating_slip_with_buyin(
  p_slip_id uuid,
  p_average_bet numeric,
  p_buyin_amount_cents bigint DEFAULT NULL,
  p_buyin_type text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
  v_slip rating_slip;
  v_txn_id uuid;
  v_visit_player_id uuid;
BEGIN
  -- ADR-024: Self-inject RLS context from authenticated staff
  PERFORM set_rls_context_from_staff();

  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_context_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_context_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Validate authentication
  IF v_context_casino_id IS NULL OR v_context_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Missing RLS context — not authenticated';
  END IF;

  -- Validate authorization (pit_boss, floor_supervisor, admin)
  IF v_context_staff_role NOT IN ('pit_boss', 'floor_supervisor', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role "%" cannot perform save-with-buyin', v_context_staff_role;
  END IF;

  -- Step 1: Update average_bet atomically
  -- Only update if slip is open or paused and belongs to this casino
  UPDATE rating_slip
  SET average_bet = p_average_bet
  WHERE id = p_slip_id
    AND casino_id = v_context_casino_id
    AND status IN ('open', 'paused')
  RETURNING * INTO v_slip;

  IF v_slip IS NULL THEN
    -- Check if slip exists but is in wrong state
    IF EXISTS (SELECT 1 FROM rating_slip WHERE id = p_slip_id AND casino_id = v_context_casino_id) THEN
      RAISE EXCEPTION 'RATING_SLIP_NOT_OPEN: Rating slip % is not in open/paused state', p_slip_id;
    ELSE
      RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_slip_id;
    END IF;
  END IF;

  -- Step 2: Insert buy-in transaction (if amount provided and > 0)
  IF p_buyin_amount_cents IS NOT NULL AND p_buyin_amount_cents > 0 THEN
    -- Derive player_id from visit (per SRM invariant: player identity on visit, not slip)
    SELECT player_id INTO v_visit_player_id
    FROM visit
    WHERE id = v_slip.visit_id;

    -- Ghost visits (player_id IS NULL) skip financial transaction
    IF v_visit_player_id IS NOT NULL THEN
      -- SEC-005 v1.2.0: Pit boss can only create buy-in (direction='in')
      -- and only cash/chips tender types — enforced at RPC level
      IF p_buyin_type NOT IN ('cash', 'chips') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Pit buy-in tender_type must be cash or chips, got "%"', p_buyin_type;
      END IF;

      INSERT INTO player_financial_transaction (
        id,
        casino_id,
        player_id,
        visit_id,
        rating_slip_id,
        amount,
        direction,
        source,
        tender_type,
        created_by_staff_id
        -- gaming_day: auto-computed by trg_fin_gaming_day trigger
      )
      VALUES (
        gen_random_uuid(),
        v_context_casino_id,
        v_visit_player_id,
        v_slip.visit_id,
        v_slip.id,
        p_buyin_amount_cents,
        'in',
        'pit',
        p_buyin_type,
        v_context_actor_id
      )
      RETURNING id INTO v_txn_id;
    END IF;
  END IF;

  -- Step 3: Return composite result
  RETURN jsonb_build_object(
    'slip', row_to_json(v_slip),
    'transaction_id', v_txn_id
  );
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
