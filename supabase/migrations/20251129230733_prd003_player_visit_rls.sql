-- PRD-003: Player & Visit Management
-- Migration: RLS policies, indexes, and constraints for player/visit tables
--
-- Tables affected: player, player_casino, visit
-- Dependencies: PRD-000 (casino table with RLS context)

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Enable pg_trgm for fuzzy text search on player names
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- RLS POLICIES: player table
-- =============================================================================

-- Enable RLS on player table
ALTER TABLE player ENABLE ROW LEVEL SECURITY;

-- Player: Read only if player is enrolled in staff's casino
CREATE POLICY player_select_enrolled ON player
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = (current_setting('app.casino_id', true))::uuid
    )
  );

-- Player: Admin can create new players (global, not casino-scoped)
CREATE POLICY player_insert_admin ON player
  FOR INSERT WITH CHECK (
    current_setting('app.staff_role', true) IN ('admin', 'pit_boss')
  );

-- Player: Admin can update players enrolled in their casino
CREATE POLICY player_update_enrolled ON player
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = (current_setting('app.casino_id', true))::uuid
    )
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- RLS POLICIES: player_casino table
-- =============================================================================

-- Enable RLS on player_casino table
ALTER TABLE player_casino ENABLE ROW LEVEL SECURITY;

-- player_casino: Read enrollments for same casino only
CREATE POLICY player_casino_select_same_casino ON player_casino
  FOR SELECT USING (
    casino_id = (current_setting('app.casino_id', true))::uuid
  );

-- player_casino: Pit boss/admin can enroll players in their casino
CREATE POLICY player_casino_insert_staff ON player_casino
  FOR INSERT WITH CHECK (
    casino_id = (current_setting('app.casino_id', true))::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- player_casino: Admin can update enrollment status
CREATE POLICY player_casino_update_admin ON player_casino
  FOR UPDATE USING (
    casino_id = (current_setting('app.casino_id', true))::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- RLS POLICIES: visit table
-- =============================================================================

-- Enable RLS on visit table
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;

-- Visit: Read visits for same casino only
CREATE POLICY visit_select_same_casino ON visit
  FOR SELECT USING (
    casino_id = (current_setting('app.casino_id', true))::uuid
  );

-- Visit: Pit boss/admin can create visits (check-in)
CREATE POLICY visit_insert_staff ON visit
  FOR INSERT WITH CHECK (
    casino_id = (current_setting('app.casino_id', true))::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- Visit: Pit boss/admin can close visits (update ended_at)
CREATE POLICY visit_update_staff ON visit
  FOR UPDATE USING (
    casino_id = (current_setting('app.casino_id', true))::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- =============================================================================
-- INDEXES: Player name search
-- =============================================================================

-- Trigram index for fuzzy name search (requires pg_trgm extension)
-- Enables ILIKE and similarity searches on full name
CREATE INDEX IF NOT EXISTS ix_player_name_trgm
  ON player USING gin (
    (lower(first_name) || ' ' || lower(last_name)) gin_trgm_ops
  );

-- Standard B-tree index for exact name lookups
CREATE INDEX IF NOT EXISTS ix_player_names_lower
  ON player (lower(first_name), lower(last_name));

-- =============================================================================
-- INDEXES: player_casino lookup
-- =============================================================================

-- Index for looking up enrollments by casino
CREATE INDEX IF NOT EXISTS ix_player_casino_by_casino
  ON player_casino (casino_id);

-- Index for looking up enrollments by player
CREATE INDEX IF NOT EXISTS ix_player_casino_by_player
  ON player_casino (player_id);

-- =============================================================================
-- INDEXES & CONSTRAINTS: Visit table
-- =============================================================================

-- Partial index for active visit lookup (ended_at IS NULL)
-- Optimizes the common query: "find active visit for player in casino"
CREATE INDEX IF NOT EXISTS ix_visit_active_by_player
  ON visit (player_id, casino_id)
  WHERE ended_at IS NULL;

-- Index for visit listing by casino and date
CREATE INDEX IF NOT EXISTS ix_visit_by_casino_date
  ON visit (casino_id, started_at DESC);

-- DEFENSE-IN-DEPTH: Partial unique constraint for single active visit
-- Ensures at database level that a player can only have ONE active visit per casino
-- This is in addition to application-level idempotency checks
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_single_active_per_player_casino
  ON visit (player_id, casino_id)
  WHERE ended_at IS NULL;

-- =============================================================================
-- NOTIFY PostgREST to reload schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
