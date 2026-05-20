-- Gate A Step 1 — Add gaming_day (nullable) to finance_outbox (PRD-087 WS1A M1)
--
-- Safe first DDL: adds the column without touching existing rows, functions, or producers.
-- Subsequent migrations:
--   M2: amend fn_finance_outbox_emit to 9-param
--   M3: amend all 5 producers to pass gaming_day
--   M4: backfill existing rows from authoritative sources
--   M5: harden NOT NULL after backfill confirms zero NULLs
--   M6: update fn_finance_outbox_immutable_envelope to cover gaming_day

ALTER TABLE public.finance_outbox ADD COLUMN gaming_day DATE NULL;

COMMENT ON COLUMN public.finance_outbox.gaming_day IS
  'Gaming day of the outbox event — derived from the authoring source table at emit time. '
  'For ledger events (fact_class=ledger): from player_financial_transaction.gaming_day. '
  'For grind.observed: from compute_gaming_day at observation time (table_buyin_telemetry). '
  'For fill/credit (fact_class=operational): from compute_gaming_day(casino_id, NOW()) at emit time. '
  'NOT NULL after Gate A M5 hardening migration. '
  'Protected by fn_finance_outbox_immutable_envelope after Gate A M6.';
