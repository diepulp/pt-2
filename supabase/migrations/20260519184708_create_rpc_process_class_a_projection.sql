-- Migration: 20260519184708_create_rpc_process_class_a_projection.sql
-- Purpose: Atomic consumer + projection write RPC. The I3 atomicity boundary for Phase 2.3.
--   processed_messages INSERT + visit_class_a_projection UPSERT + finance_outbox.processed_at
--   UPDATE all execute in ONE PostgreSQL transaction. TypeScript cannot guarantee this.
--
-- PRD-087 WS1B_GATE_B_DB Gate B.
--
-- Return semantics:
--   'processed'           — new ledger event; both writes committed in same transaction
--   'duplicate'           — message_id already in processed_messages; safe durable prior commit
--   'skipped_operational' — fact_class != 'ledger'; no writes; processed_at left NULL
--   'not_found'           — no finance_outbox row with matching event_id
--
-- Payload shape (verified in migrations 20260519183631 and 20260517234015):
--   buyin.recorded:      {amount, tender_type}
--                        amount = integer cents; always direction='in' at the PFT level
--   adjustment.recorded: {amount, pft_direction, delta_direction, reason_code}
--                        amount = signed integer cents (positive = increase, negative = decrease)
--   cashout.recorded:    not yet a distinct outbox producer; handled defensively below
--
-- visit_id derivation: NOT in outbox payload. Derived from player_financial_transaction
-- via aggregate_id JOIN (aggregate_id = PFT.id for all Class A / ledger rows).
--
-- Pre-state assertions:
--   1. Gate A migrations must be applied: finance_outbox.gaming_day NOT NULL
--   2. visit_class_a_projection table must exist (migration 20260519184706)
--   3. gaming_day_lifecycle table must exist (migration 20260519184707)

DO $$
BEGIN
  -- Assert Gate A: gaming_day column is NOT NULL on finance_outbox
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'finance_outbox'
      AND column_name  = 'gaming_day'
      AND is_nullable  = 'NO'
  ), 'PRE-STATE FAIL: finance_outbox.gaming_day is NULL or absent. '
     'Gate A migrations (20260519183629-34) must be applied before Gate B.';

  -- Assert projection store exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'visit_class_a_projection'
  ), 'PRE-STATE FAIL: visit_class_a_projection table not found. '
     'Apply 20260519184706 before this migration.';

  -- Assert lifecycle signal store exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'gaming_day_lifecycle'
  ), 'PRE-STATE FAIL: gaming_day_lifecycle table not found. '
     'Apply 20260519184707 before this migration.';

  -- Assert processed_messages schema: message_id UUID PRIMARY KEY
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'processed_messages'
      AND column_name  = 'message_id'
  ), 'PRE-STATE FAIL: processed_messages.message_id absent. '
     'Citation: 20260511134418_wave2_processed_messages.sql';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_process_class_a_projection
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_process_class_a_projection(
  p_message_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type   TEXT;
  v_fact_class   TEXT;
  v_casino_id    UUID;
  v_gaming_day   DATE;
  v_aggregate_id UUID;
  v_payload      JSONB;
  v_visit_id     UUID;
  v_amount       BIGINT;
  v_inserted     UUID;
BEGIN
  -- ── Step 1: Fetch outbox row ────────────────────────────────────────────────
  SELECT fo.event_type, fo.fact_class, fo.casino_id, fo.gaming_day,
         fo.aggregate_id, fo.payload
  INTO   v_event_type, v_fact_class, v_casino_id, v_gaming_day,
         v_aggregate_id, v_payload
  FROM   public.finance_outbox fo
  WHERE  fo.event_id = p_message_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- ── Step 2: Skip non-ledger rows ────────────────────────────────────────────
  -- Primary containment is at claim level (rpc_claim_class_a_outbox_batch claims
  -- only fact_class='ledger'). This guard is a defensive backstop against
  -- misconfiguration — not normal operation.
  -- processed_at intentionally left NULL: Phase 2.4 consumer owns operational rows.
  IF v_fact_class != 'ledger' THEN
    RETURN 'skipped_operational';
  END IF;

  -- ── Step 3: Atomic deduplication gate (I3 boundary) ─────────────────────────
  -- INSERT with RETURNING detects whether a new row was actually committed.
  -- ON CONFLICT DO NOTHING is belt-and-suspenders; the RETURNING check is load-bearing.
  -- casino_id is derived from the locked outbox row — caller supplies nothing.
  INSERT INTO public.processed_messages (message_id, casino_id)
  VALUES (p_message_id, v_casino_id)
  ON CONFLICT DO NOTHING
  RETURNING message_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    -- Prior rpc_process_class_a_projection committed atomically.
    -- processed_at was set in that prior transaction.
    RETURN 'duplicate';
  END IF;

  -- ── Step 4: Derive visit_id via PFT JOIN ────────────────────────────────────
  -- visit_id is not stored in the outbox payload (confirmed: buyin payload = {amount,
  -- tender_type}; adjustment payload = {amount, pft_direction, delta_direction,
  -- reason_code}). aggregate_id = player_financial_transaction.id for ledger rows.
  SELECT pft.visit_id INTO v_visit_id
  FROM   public.player_financial_transaction pft
  WHERE  pft.id = v_aggregate_id;

  IF v_visit_id IS NULL THEN
    RAISE EXCEPTION
      'rpc_process_class_a_projection: visit_id unresolvable for event_id=%, aggregate_id=%',
      p_message_id, v_aggregate_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 5: Extract amount ──────────────────────────────────────────────────
  -- Field name is 'amount' for all current ledger event types.
  -- Unit: integer cents (same as PFT source; see migration 20260519183631).
  -- For adjustment.recorded: amount is signed (positive = add, negative = subtract).
  v_amount := (v_payload->>'amount')::bigint;

  -- ── Step 6: UPSERT projection — event_type routing ─────────────────────────
  -- buyin.recorded:      total_in  += amount (always direction='in' at PFT)
  -- cashout.recorded:    total_out += amount (future; not yet an active producer)
  -- adjustment.recorded: adjustment_net += amount (signed delta)
  INSERT INTO public.visit_class_a_projection (
    casino_id, visit_id, gaming_day,
    total_in, total_out, adjustment_net,
    event_count, updated_at
  )
  VALUES (
    v_casino_id, v_visit_id, v_gaming_day,
    CASE WHEN v_event_type = 'buyin.recorded'      THEN v_amount ELSE 0 END,
    CASE WHEN v_event_type = 'cashout.recorded'    THEN v_amount ELSE 0 END,
    CASE WHEN v_event_type = 'adjustment.recorded' THEN v_amount ELSE 0 END,
    1,
    NOW()
  )
  ON CONFLICT (casino_id, visit_id, gaming_day) DO UPDATE SET
    total_in       = visit_class_a_projection.total_in       + EXCLUDED.total_in,
    total_out      = visit_class_a_projection.total_out      + EXCLUDED.total_out,
    adjustment_net = visit_class_a_projection.adjustment_net + EXCLUDED.adjustment_net,
    event_count    = visit_class_a_projection.event_count    + 1,
    updated_at     = NOW();

  -- ── Step 7: Mark outbox row processed — same transaction ───────────────────
  -- processed_at is set here (not by relay worker) — ensures projection write
  -- and processed_at are in the same atomic transaction (no partial state).
  UPDATE public.finance_outbox
  SET processed_at = NOW()
  WHERE event_id = p_message_id;

  RETURN 'processed';
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_process_class_a_projection(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_process_class_a_projection(UUID) TO service_role;

COMMENT ON FUNCTION public.rpc_process_class_a_projection(UUID) IS
  'Atomic Class A consumer + projection write (I3 boundary). '
  'processed_messages INSERT + visit_class_a_projection UPSERT + finance_outbox.processed_at '
  'all execute in ONE PG transaction. '
  'Returns: ''processed'' (new), ''duplicate'' (prior commit), '
  '''skipped_operational'' (fact_class!=ledger), ''not_found'' (no row). '
  'visit_id derived from player_financial_transaction via aggregate_id JOIN — not from payload. '
  'PRD-087 WS1B Gate B.';
