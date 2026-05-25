-- Migration: 20260521022703_create_rpc_process_operational_projection.sql
-- Purpose: Atomic operational consumer + projection write RPC. The I3 atomicity boundary
--   for Phase 2.4.
--   processed_messages INSERT + shift_operational_projection UPSERT +
--   finance_outbox.processed_at UPDATE all execute in ONE PostgreSQL transaction.
--   TypeScript cannot guarantee this.
--   PRD-088 WS1_DB.
--
-- Return semantics:
--   'processed'        — new owned operational event; all three writes committed atomically
--   'duplicate'        — message_id already in processed_messages; durable prior commit
--   'skipped_ledger'   — fact_class = 'ledger'; no writes; processed_at left NULL (Class A owns these)
--   'skipped_unknown'  — event_type not in ('grind.observed','fill.recorded','credit.recorded'); no writes
--   'not_found'        — no finance_outbox row with matching event_id
--   RAISES             — owned operational event with malformed payload (null/missing/non-integer/negative
--                        amount_cents); no processed_at stamp, no processed_messages insert,
--                        no shift_operational_projection mutation
--
-- Payload shape (operational events — CRITICAL: field is 'amount_cents', NOT 'amount'):
--   grind.observed:    {amount_cents: integer cents >= 0}
--   fill.recorded:     {amount_cents: integer cents >= 0}
--   credit.recorded:   {amount_cents: integer cents >= 0}
--   (rpc_record_grind_observation emits jsonb_build_object('amount_cents', p_amount_cents))
--   Class A ledger events use 'amount'; operational events use 'amount_cents'. Do not confuse.
--
-- Operation order (I3 atomicity design):
--   1. Fetch row            → not_found if absent
--   2. Ownership check      → skipped_ledger / skipped_unknown (no writes)
--   3. Payload validation   → RAISE if amount_cents absent/malformed/negative (no writes)
--   4. Idempotency insert   → duplicate if message_id already committed (no projection write)
--   5. Projection UPSERT    → additive accumulation per event_type
--   6. Stamp processed_at   → same transaction; atomic with steps 4 and 5
--
-- Pre-state assertions:
--   1. Gate A migrations must be applied: finance_outbox.gaming_day NOT NULL
--   2. processed_messages table must exist (20260511134418)
--   3. gaming_day_lifecycle table must exist (20260519184707)
--   4. shift_operational_projection table must exist (20260521015409)

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
     'Gate A migrations (20260519183629-34) must be applied before this migration.';

  -- Assert idempotency store exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'processed_messages'
      AND column_name  = 'message_id'
  ), 'PRE-STATE FAIL: processed_messages.message_id absent. '
     'Citation: 20260511134418_wave2_processed_messages.sql';

  -- Assert lifecycle signal store exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'gaming_day_lifecycle'
  ), 'PRE-STATE FAIL: gaming_day_lifecycle table not found. '
     'Apply 20260519184707 before this migration.';

  -- Assert operational projection store exists
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'shift_operational_projection'
  ), 'PRE-STATE FAIL: shift_operational_projection table not found. '
     'Apply 20260521015409 before this migration.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_process_operational_projection
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_process_operational_projection(
  p_message_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type     TEXT;
  v_fact_class     TEXT;
  v_casino_id      UUID;
  v_gaming_day     DATE;
  v_table_id       UUID;
  v_payload        JSONB;
  v_amount_text    TEXT;
  v_amount_cents   BIGINT;
  v_inserted       UUID;
BEGIN
  -- ── Step 1: Fetch outbox row ────────────────────────────────────────────────
  SELECT fo.event_type, fo.fact_class, fo.casino_id, fo.gaming_day,
         fo.table_id, fo.payload
  INTO   v_event_type, v_fact_class, v_casino_id, v_gaming_day,
         v_table_id, v_payload
  FROM   public.finance_outbox fo
  WHERE  fo.event_id = p_message_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- ── Step 2: Ownership check — ledger rows belong to Class A consumer ────────
  -- Primary containment is at claim level (rpc_claim_operational_outbox_batch).
  -- This guard is a defensive backstop: Class A consumer owns ledger rows.
  -- processed_at intentionally left NULL.
  IF v_fact_class = 'ledger' THEN
    RETURN 'skipped_ledger';
  END IF;

  -- ── Step 3: Ownership check — unknown operational event types ───────────────
  -- Rows with unrecognised event_type are not projection inputs.
  -- processed_at intentionally left NULL — not safe to stamp without knowing the shape.
  IF v_event_type NOT IN ('grind.observed', 'fill.recorded', 'credit.recorded') THEN
    RETURN 'skipped_unknown';
  END IF;

  -- ── Step 4: Payload validation — amount_cents must be present, integer, >= 0 ─
  -- CRITICAL: operational events use 'amount_cents', NOT 'amount' (Class A field).
  -- Validation precedes idempotency insert (Malformed-before-idempotency guarantee).
  -- RAISE propagates as unhandled exception → no processed_messages insert,
  -- no shift_operational_projection mutation, no processed_at stamp.
  v_amount_text := v_payload->>'amount_cents';

  IF v_amount_text IS NULL THEN
    RAISE EXCEPTION
      'rpc_process_operational_projection: amount_cents missing or null in payload for event_id=%',
      p_message_id
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_amount_cents := v_amount_text::bigint;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION
      'rpc_process_operational_projection: amount_cents is not a valid integer for event_id=%, value=%',
      p_message_id, v_amount_text
      USING ERRCODE = 'P0001';
  END;

  IF v_amount_cents < 0 THEN
    RAISE EXCEPTION
      'rpc_process_operational_projection: amount_cents < 0 for event_id=%, value=%',
      p_message_id, v_amount_cents
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 5: Atomic deduplication gate (I3 boundary) ─────────────────────────
  -- Occurs AFTER ownership and payload validation (proven by WS5_TESTS).
  -- ON CONFLICT DO NOTHING + RETURNING: v_inserted stays NULL on conflict → 'duplicate'.
  INSERT INTO public.processed_messages (message_id, casino_id)
  VALUES (p_message_id, v_casino_id)
  ON CONFLICT DO NOTHING
  RETURNING message_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    -- Prior rpc_process_operational_projection committed atomically.
    -- processed_at was set in that prior transaction.
    RETURN 'duplicate';
  END IF;

  -- ── Step 6: UPSERT projection — additive accumulation by event_type ─────────
  -- grind.observed → grind_volume_cents +=
  -- fill.recorded  → fill_total_cents +=
  -- credit.recorded → credit_total_cents +=
  -- all            → event_count += 1, updated_at = NOW()
  INSERT INTO public.shift_operational_projection (
    casino_id, gaming_day, table_id,
    grind_volume_cents, fill_total_cents, credit_total_cents,
    event_count, updated_at
  )
  VALUES (
    v_casino_id, v_gaming_day, v_table_id,
    CASE WHEN v_event_type = 'grind.observed'  THEN v_amount_cents ELSE 0 END,
    CASE WHEN v_event_type = 'fill.recorded'   THEN v_amount_cents ELSE 0 END,
    CASE WHEN v_event_type = 'credit.recorded' THEN v_amount_cents ELSE 0 END,
    1,
    NOW()
  )
  ON CONFLICT (casino_id, gaming_day, table_id) DO UPDATE SET
    grind_volume_cents = shift_operational_projection.grind_volume_cents + EXCLUDED.grind_volume_cents,
    fill_total_cents   = shift_operational_projection.fill_total_cents   + EXCLUDED.fill_total_cents,
    credit_total_cents = shift_operational_projection.credit_total_cents + EXCLUDED.credit_total_cents,
    event_count        = shift_operational_projection.event_count        + 1,
    updated_at         = NOW();

  -- ── Step 7: Mark outbox row processed — same transaction ───────────────────
  -- processed_at set here (not by relay worker) — projection write and processed_at
  -- are in the same atomic transaction (no partial state possible).
  UPDATE public.finance_outbox
  SET processed_at = NOW()
  WHERE event_id = p_message_id;

  RETURN 'processed';
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_process_operational_projection(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_process_operational_projection(UUID) TO service_role;

COMMENT ON FUNCTION public.rpc_process_operational_projection(UUID) IS
  'Atomic operational consumer + projection write (I3 boundary). '
  'processed_messages INSERT + shift_operational_projection UPSERT + finance_outbox.processed_at '
  'all execute in ONE PG transaction. '
  'Returns: ''processed'' (new), ''duplicate'' (prior commit), '
  '''skipped_ledger'' (fact_class=ledger, no writes), ''skipped_unknown'' (unknown op type, no writes), '
  '''not_found'' (no row). '
  'Malformed owned operational payload (null/non-integer/negative amount_cents) RAISES — '
  'no processed_messages insert, no projection mutation, no processed_at stamp. '
  'Payload field is ''amount_cents'' (NOT ''amount'' — Class A ledger uses ''amount''). '
  'PRD-088 WS1_DB.';
