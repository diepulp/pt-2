-- Migration: 20260511134100_wave2_finance_outbox_transform.sql
-- Purpose: Transform finance_outbox from legacy zero-producer placeholder to Wave 2 contract.
-- Legacy shape: id (UUID PK), casino_id, ledger_id (FK→PFT), event_type, payload,
--   created_at, processed_at, attempt_count + four authenticated RLS policies.
-- Wave 2 shape: event_id (UUIDv7 PK), event_type, fact_class, origin_label, casino_id,
--   table_id, player_id, aggregate_id, payload, created_at, processed_at,
--   delivery_attempts, last_attempted_at, last_error.
-- CREATE TABLE IF NOT EXISTS is NOT acceptable — it would silently preserve the incompatible
-- legacy shape. This migration drops and recreates with pre-state assertions.

-- Step 1: Assert legacy columns exist (fail loudly if not — wrong migration order or env)
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'finance_outbox'
      AND column_name  = 'ledger_id'
  ), 'PRE-STATE FAIL: finance_outbox.ledger_id absent. Expected legacy shape (id/ledger_id/attempt_count) not found. Migration aborted.';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'finance_outbox'
      AND column_name  = 'attempt_count'
  ), 'PRE-STATE FAIL: finance_outbox.attempt_count absent. Expected legacy shape not found. Migration aborted.';
END $$;

-- Step 2: Assert zero rows — legacy table was a zero-producer placeholder
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.finance_outbox;
  ASSERT v_count = 0,
    format(
      'PRE-STATE FAIL: finance_outbox contains %s rows. Expected zero-producer placeholder. Inspect rows before proceeding.',
      v_count
    );
END $$;

-- Step 3: Explicitly drop the four legacy authenticated policies before table drop.
-- DO NOT use CASCADE for this — drop explicitly so any unknown dependents cause loud failure.
DROP POLICY IF EXISTS finance_outbox_select     ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_insert     ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_no_updates ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_no_deletes ON public.finance_outbox;

-- Step 4: Drop legacy table (NO CASCADE — dependencies explicitly cleared above).
-- If unexpected dependents exist (views, FKs from other tables), DROP will fail loudly.
-- Known dropped objects: the above four policies. No other known dependents.
DROP TABLE IF EXISTS public.finance_outbox;

-- Step 5: Create Wave 2 table
CREATE TABLE public.finance_outbox (
  event_id          UUID          NOT NULL PRIMARY KEY,
  -- event_id is UUIDv7 generated at the authoring RPC boundary via generate_uuid_v7().
  -- NOT via DEFAULT — caller must supply. UUIDv7 ordering is the relay + replay authority.

  event_type        TEXT          NOT NULL,
  -- Registered values from INT-002 Wave 2 event catalog.

  fact_class        TEXT          NOT NULL
                    CHECK (fact_class IN ('ledger', 'operational')),
  -- 'ledger': financial fact (Class A). 'operational': observational (Class B).

  origin_label      TEXT          NOT NULL
                    CHECK (origin_label IN ('actual', 'estimated', 'observed', 'compliance')),
  -- Travels unchanged through relay + consumer. No code path may upgrade 'estimated' to 'actual'.

  casino_id         UUID          NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  table_id          UUID          NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  player_id         UUID          NULL,
  -- NULL for Class B (grind observations). NOT NULL for Class A (ADR-052 R5).

  aggregate_id      UUID          NOT NULL,
  -- PK of the authoring row (PFT id for Class A, table_buyin_telemetry id for Class B).

  payload           JSONB         NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Observational metadata only — NOT the relay ordering authority (event_id is).

  processed_at      TIMESTAMPTZ   NULL,
  -- Set by relay worker after runConsumer returns 'processed' or 'duplicate'.

  delivery_attempts INTEGER       NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ   NULL,
  -- Both set by rpc_claim_outbox_batch on each claim cycle.

  last_error        VARCHAR(2000) NULL
  -- Bounded. Set by relay on delivery failure; cleared on next claim (attempt still increments).
);

-- Step 6: Indexes
-- Relay poll: unprocessed rows in UUIDv7 insertion order (partial — skips processed rows)
CREATE INDEX idx_finance_outbox_relay
  ON public.finance_outbox (event_id)
  WHERE processed_at IS NULL;

-- Per-entity replay: deterministic (table_id, event_id) ordering for I4 replay proof
CREATE INDEX idx_finance_outbox_entity_order
  ON public.finance_outbox (table_id, event_id);

-- Step 7: Envelope immutability trigger
-- Blocks UPDATE on envelope columns; allows UPDATE on relay lifecycle columns.
CREATE OR REPLACE FUNCTION public.fn_finance_outbox_immutable_envelope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.event_id      IS DISTINCT FROM NEW.event_id      OR
     OLD.event_type    IS DISTINCT FROM NEW.event_type    OR
     OLD.fact_class    IS DISTINCT FROM NEW.fact_class    OR
     OLD.origin_label  IS DISTINCT FROM NEW.origin_label  OR
     OLD.casino_id     IS DISTINCT FROM NEW.casino_id     OR
     OLD.table_id      IS DISTINCT FROM NEW.table_id      OR
     OLD.player_id     IS DISTINCT FROM NEW.player_id     OR
     OLD.aggregate_id  IS DISTINCT FROM NEW.aggregate_id  OR
     OLD.payload       IS DISTINCT FROM NEW.payload       OR
     OLD.created_at    IS DISTINCT FROM NEW.created_at    THEN
    RAISE EXCEPTION 'finance_outbox: envelope columns are immutable after insert (ADR-054 D5)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_finance_outbox_immutable_envelope
  BEFORE UPDATE ON public.finance_outbox
  FOR EACH ROW EXECUTE FUNCTION public.fn_finance_outbox_immutable_envelope();

-- Step 8: RLS and grants
ALTER TABLE public.finance_outbox ENABLE ROW LEVEL SECURITY;
-- No authenticated policies. SECURITY DEFINER RPCs (rpc_create_financial_txn,
-- rpc_record_grind_observation) insert rows directly within their transactions.
-- Relay worker accesses via service_role only.
GRANT SELECT, INSERT, UPDATE ON public.finance_outbox TO service_role;
