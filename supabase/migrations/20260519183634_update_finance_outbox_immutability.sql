-- Gate A Step 6 — Update fn_finance_outbox_immutable_envelope to cover gaming_day
-- (PRD-087 WS1A M6)
--
-- gaming_day is an envelope column (set at emit time, immutable after insert).
-- Adds OLD.gaming_day IS DISTINCT FROM NEW.gaming_day check to the existing guard.
-- All existing immutability checks are preserved unchanged.

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
     OLD.created_at    IS DISTINCT FROM NEW.created_at    OR
     OLD.gaming_day    IS DISTINCT FROM NEW.gaming_day    THEN
    RAISE EXCEPTION 'finance_outbox: envelope columns are immutable after insert (ADR-054 D5)';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_finance_outbox_immutable_envelope() IS
  'PRD-087 WS1A Gate A M6: adds gaming_day to immutability guard. '
  'Blocks UPDATE on all envelope columns (event_id, event_type, fact_class, origin_label, '
  'casino_id, table_id, player_id, aggregate_id, payload, created_at, gaming_day). '
  'Allows UPDATE on relay lifecycle columns (processed_at, delivery_attempts, '
  'last_attempted_at, last_error). ADR-054 D5.';
