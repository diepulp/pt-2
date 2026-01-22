-- =====================================================
-- Migration: ADR-029 Player Tag Table
-- Created: 2026-01-21 14:55:02
-- ADR Reference: docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-029/EXEC-SPEC-029.md
-- Workstream: WS1-C
-- Purpose: Create player_tag table for player flags/labels
-- RLS_REVIEW_COMPLETE: Policies use ADR-015 hybrid pattern
-- =====================================================

BEGIN;

-- ============================================================================
-- Create player_tag table
-- ============================================================================
-- Player flags/tags for categorization. Soft-delete pattern (removed_at).
-- Only one active tag per name per player per casino (partial unique index).
-- Owned by PlayerService per SRM.
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  player_id uuid NOT NULL REFERENCES player(id),
  tag_name text NOT NULL,
  tag_category text NOT NULL DEFAULT 'custom'
    CHECK (tag_category IN ('vip', 'attention', 'service', 'custom')),
  applied_by uuid NOT NULL REFERENCES staff(id),
  removed_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

-- Partial unique: only one active tag per name per player per casino
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_tag_active
  ON player_tag (casino_id, player_id, tag_name)
  WHERE removed_at IS NULL;

-- Index for timeline queries (Phase 2 - deferred per EXEC-SPEC-029 WS1-D)
-- CREATE INDEX idx_player_tag_timeline
--   ON player_tag (casino_id, player_id, created_at DESC, id DESC);

COMMENT ON TABLE player_tag IS
  'ADR-029: Player flags/tags for categorization. Soft-delete with removed_at. '
  'Only one active tag per name per player per casino. Owned by PlayerService. '
  'Timeline events (tag_applied, tag_removed) deferred to Phase 2.';

COMMENT ON COLUMN player_tag.tag_category IS
  'Tag category: vip, attention (needs action), service (special handling), custom (free-form).';

COMMENT ON COLUMN player_tag.removed_at IS
  'Soft-delete timestamp. NULL = active tag. Set to remove tag without hard delete.';

-- ============================================================================
-- Enable RLS
-- ============================================================================

ALTER TABLE player_tag ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies (ADR-015 Pattern C hybrid)
-- ============================================================================

-- SELECT: Casino-scoped read access
CREATE POLICY player_tag_select ON player_tag
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((SELECT current_setting('app.casino_id', true)), '')::uuid,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: Casino-scoped write access for pit_boss and admin
CREATE POLICY player_tag_insert ON player_tag
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

-- UPDATE: Allow only for removal (setting removed_at, removed_by)
CREATE POLICY player_tag_update ON player_tag
  FOR UPDATE USING (
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

-- Deny delete (soft-delete only)
CREATE POLICY player_tag_deny_delete ON player_tag
  FOR DELETE USING (false);

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
