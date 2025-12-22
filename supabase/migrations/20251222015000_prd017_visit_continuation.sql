-- =============================================================
-- PRD-017: Visit Continuation Schema
-- Adds visit_group_id for cross-visit continuity tracking
-- =============================================================

-- 1. Add visit_group_id column (nullable initially for backfill)
ALTER TABLE visit
  ADD COLUMN IF NOT EXISTS visit_group_id UUID;

-- 2. Backfill existing visits (each becomes its own group)
UPDATE visit
SET visit_group_id = id
WHERE visit_group_id IS NULL;

-- 3. Make NOT NULL after backfill
ALTER TABLE visit
  ALTER COLUMN visit_group_id SET NOT NULL;

-- 4. Trigger to default visit_group_id = id on INSERT
CREATE OR REPLACE FUNCTION trg_visit_set_group_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.visit_group_id IS NULL THEN
    NEW.visit_group_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visit_group_id_default ON visit;
CREATE TRIGGER trg_visit_group_id_default
  BEFORE INSERT ON visit
  FOR EACH ROW
  EXECUTE FUNCTION trg_visit_set_group_id();

-- 5. Partial unique index: max 1 open visit per identified player per casino
-- This enforces at DB level that a player can only have one active session
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_one_open_per_player
  ON visit (casino_id, player_id)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

-- 6. Index for group queries (visit continuation aggregation)
CREATE INDEX IF NOT EXISTS idx_visit_group
  ON visit (casino_id, visit_group_id, started_at DESC);

-- 7. Index for recent sessions query (closed sessions, paginated)
-- Supports rpc_get_player_recent_sessions with cursor pagination
CREATE INDEX IF NOT EXISTS idx_visit_player_recent_closed
  ON visit (casino_id, player_id, ended_at DESC, id DESC)
  WHERE player_id IS NOT NULL AND ended_at IS NOT NULL;
