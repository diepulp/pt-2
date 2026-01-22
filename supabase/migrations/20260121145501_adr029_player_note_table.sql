-- =====================================================
-- Migration: ADR-029 Player Note Table
-- Description: Create player_note table for staff collaboration on players
-- Created: 2026-01-21 14:55:01
-- Reference: ADR-029, ADR-015, EXEC-SPEC-029 WS1-B
-- RLS_REVIEW_COMPLETE: Policies use ADR-015 hybrid pattern
-- =====================================================

BEGIN;

-- ============================================================================
-- Create player_note table
-- ============================================================================
-- Staff notes on players. Append-only for audit trail (no updates/deletes).
-- Owned by PlayerService per SRM.
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  player_id uuid NOT NULL REFERENCES player(id),
  created_by uuid NOT NULL REFERENCES staff(id),
  content text NOT NULL,
  visibility text NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('private', 'team', 'all')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for timeline queries (Phase 2 - deferred per EXEC-SPEC-029 WS1-D)
-- CREATE INDEX idx_player_note_timeline
--   ON player_note (casino_id, player_id, created_at DESC, id DESC);

COMMENT ON TABLE player_note IS
  'ADR-029: Staff notes on players for collaboration. Append-only for audit trail. '
  'Owned by PlayerService. Timeline events deferred to Phase 2.';

COMMENT ON COLUMN player_note.visibility IS
  'Note visibility: private (creator only), team (same casino), all (cross-casino).';

-- ============================================================================
-- Enable RLS
-- ============================================================================

ALTER TABLE player_note ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies (ADR-015 Pattern C hybrid)
-- ============================================================================

-- SELECT: Casino-scoped read access
CREATE POLICY player_note_select ON player_note
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: Casino-scoped write access for pit_boss and admin
CREATE POLICY player_note_insert ON player_note
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((SELECT current_setting('app.staff_role', true)), ''),
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- Deny update (append-only for audit)
CREATE POLICY player_note_deny_update ON player_note
  FOR UPDATE USING (false);

-- Deny delete (append-only for audit)
CREATE POLICY player_note_deny_delete ON player_note
  FOR DELETE USING (false);

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
