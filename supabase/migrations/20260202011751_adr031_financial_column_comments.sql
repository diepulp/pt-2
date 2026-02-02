-- ADR-031: Financial Amount Convention — SQL Column Comments
-- Rule 5: Every financial column MUST carry a COMMENT ON COLUMN declaring its unit.
--
-- This migration adds unit documentation to all financial columns listed in
-- the ADR-031 Storage Convention Map. No schema changes — metadata only.

-- player_financial_transaction.amount
COMMENT ON COLUMN player_financial_transaction.amount IS
  'Transaction amount in cents (1 dollar = 100). Positive for buy-ins, negative for adjustments.';

-- mtl_entry.amount
COMMENT ON COLUMN mtl_entry.amount IS
  'Transaction amount in cents (1 dollar = 100) per ISSUE-FB8EB717 standardization.';

-- table_buyin_telemetry.amount_cents
COMMENT ON COLUMN table_buyin_telemetry.amount_cents IS
  'Buy-in amount in cents (1 dollar = 100).';

-- rating_slip.average_bet
COMMENT ON COLUMN rating_slip.average_bet IS
  'Average bet in dollars. Stored as-is from user input (not cents). Grandfathered per ADR-031.';

-- pit_cash_observation.amount
COMMENT ON COLUMN pit_cash_observation.amount IS
  'Observed cash amount in dollars. Pit boss observations stored in dollars per CreatePitCashObservationInput contract.';

-- visit_financial_summary view columns
COMMENT ON COLUMN visit_financial_summary.total_in IS
  'Total amount IN in cents (aggregated from player_financial_transaction.amount).';
COMMENT ON COLUMN visit_financial_summary.total_out IS
  'Total amount OUT in cents (aggregated from player_financial_transaction.amount).';
COMMENT ON COLUMN visit_financial_summary.net_amount IS
  'Net amount in cents (total_in - total_out).';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
