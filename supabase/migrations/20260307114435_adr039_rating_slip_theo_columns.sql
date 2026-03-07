-- ADR-039 Artifact 1: Theo columns on rating_slip
-- Bounded context: RatingSlipService (Telemetry)
-- NOTE: CHECK constraint deferred to WS2 migration (DA P0-1 fix)

ALTER TABLE rating_slip
  ADD COLUMN IF NOT EXISTS legacy_theo_cents bigint,
  ADD COLUMN IF NOT EXISTS computed_theo_cents bigint;

-- Index for discrepancy queries (only index rows with both values populated)
CREATE INDEX IF NOT EXISTS idx_rating_slip_theo_discrepancy
  ON rating_slip (casino_id)
  WHERE legacy_theo_cents IS NOT NULL AND computed_theo_cents IS NOT NULL;

COMMENT ON COLUMN rating_slip.legacy_theo_cents IS
  'ADR-039: Legacy-reported theo in cents. Set once at import, immutable. Transitional.';
COMMENT ON COLUMN rating_slip.computed_theo_cents IS
  'ADR-039 D3: Deterministic theo in cents via calculate_theo_from_snapshot. Set once at close, immutable.';

NOTIFY pgrst, 'reload schema';
