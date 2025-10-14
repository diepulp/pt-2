-- =====================================================================
-- Player Financial Transaction Table (v2)
-- Bounded Context: "What money/chips moved in/out?"
-- Owner: PlayerFinancialService (Financial Domain)
-- Purpose: Tracks chip and cash movements while preserving audit integrity.
-- =====================================================================

-- === ENUM TYPES ======================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactiontype') THEN
    CREATE TYPE TransactionType AS ENUM (
      'DEPOSIT',
      'WITHDRAWAL',
      'EXCHANGE',
      'ADJUSTMENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliationstatus') THEN
    CREATE TYPE ReconciliationStatus AS ENUM (
      'PENDING',
      'RECONCILED',
      'DISCREPANCY'
    );
  END IF;
END$$;

-- === TABLE ===========================================================

CREATE TABLE IF NOT EXISTS player_financial_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys (bounded context boundaries)
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
  rating_slip_id UUID REFERENCES ratingslip(id) ON DELETE SET NULL,

  -- Financial Domain Fields
  cash_in NUMERIC(10,2) CHECK (cash_in IS NULL OR cash_in >= 0),
  chips_brought INTEGER CHECK (chips_brought IS NULL OR chips_brought >= 0),
  chips_taken INTEGER CHECK (chips_taken IS NULL OR chips_taken >= 0),

  transaction_type TransactionType NOT NULL,
  reconciliation_status ReconciliationStatus NOT NULL DEFAULT 'PENDING',

  net_change NUMERIC(10,2),
  notes TEXT,

  -- Metadata
  transaction_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER DEFAULT 1,

  -- Validations
  CONSTRAINT at_least_one_value CHECK (
    cash_in IS NOT NULL OR chips_brought IS NOT NULL OR chips_taken IS NOT NULL
  )
);

COMMENT ON TABLE player_financial_transaction IS
  'Financial transaction ledger - tracks cash and chip movements (bounded context: money in/out)';
COMMENT ON COLUMN player_financial_transaction.player_id IS
  'Reference to Player (Identity Context)';
COMMENT ON COLUMN player_financial_transaction.visit_id IS
  'Reference to Visit (Session Context)';
COMMENT ON COLUMN player_financial_transaction.rating_slip_id IS
  'Optional link to RatingSlip (Performance Context)';
COMMENT ON COLUMN player_financial_transaction.net_change IS
  'Computed net financial change for this transaction';
COMMENT ON COLUMN player_financial_transaction.transaction_type IS
  'Enumerated type indicating financial event category';

-- === INDEXES =========================================================

CREATE INDEX IF NOT EXISTS idx_financial_visit_time
  ON player_financial_transaction (visit_id, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_financial_player
  ON player_financial_transaction (player_id);
CREATE INDEX IF NOT EXISTS idx_financial_status
  ON player_financial_transaction (reconciliation_status);

-- === TRIGGERS ========================================================

-- Maintain updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_player_financial_transaction_updated_at ON player_financial_transaction;
CREATE TRIGGER set_player_financial_transaction_updated_at
  BEFORE UPDATE ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

-- Prevent modification of reconciled transactions
CREATE OR REPLACE FUNCTION prevent_update_if_reconciled()
RETURNS trigger AS $$
BEGIN
  IF OLD.reconciliation_status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Cannot modify reconciled transaction %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_reconciled_update ON player_financial_transaction;
CREATE TRIGGER block_reconciled_update
  BEFORE UPDATE ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION prevent_update_if_reconciled();

-- === ROW LEVEL SECURITY ==============================================

ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own financial transactions" ON player_financial_transaction;
CREATE POLICY "Users can view own financial transactions"
  ON player_financial_transaction
  FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Service role can manage all transactions" ON player_financial_transaction;
CREATE POLICY "Service role can manage all transactions"
  ON player_financial_transaction
  FOR ALL
  USING (auth.role() = 'service_role');

-- === NOTES ===========================================================

-- ▪ Financial records are immutable post-reconciliation to preserve audit trail.
-- ▪ visit_id uses ON DELETE RESTRICT to prevent cascading data loss.
-- ▪ rating_slip_id is nullable for decoupled Performance reflection.
-- ▪ Indexes tuned for "by visit" and "by player" retrieval patterns.
-- ▪ Enums defined defensively; replace with lookup tables if extensibility required.
-- ▪ Ready for Supabase migration via CLI or SQL Editor.
