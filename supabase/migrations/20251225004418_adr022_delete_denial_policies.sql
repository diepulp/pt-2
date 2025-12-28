-- Migration: ADR-022 Player Identity Enrollment - Delete Denial Policies
-- Purpose: Add DELETE denial RLS policies for player and player_casino tables
-- Reference: EXEC-SPEC-022 Section 4.3, DOD-022 Section B6, ADR-015
-- Rationale: Preserve audit trail and enrollment ledger (soft-delete pattern)
-- RLS_REVIEW_COMPLETE: Denial policies with DROP IF EXISTS for idempotency

-- player: Prevent hard deletes (audit trail preservation)
-- Note: player_identity already has delete denial in migration 20251225120003
DROP POLICY IF EXISTS "player_no_delete" ON player;
CREATE POLICY "player_no_delete" ON player
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- player_casino: Prevent hard deletes (enrollment is ledger, soft-delete only)
DROP POLICY IF EXISTS "player_casino_no_delete" ON player_casino;
CREATE POLICY "player_casino_no_delete" ON player_casino
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- Add policy comments for documentation
COMMENT ON POLICY "player_no_delete" ON player IS
  'Hard deletes denied (audit trail preservation per ADR-022)';

COMMENT ON POLICY "player_casino_no_delete" ON player_casino IS
  'Hard deletes denied (enrollment ledger per ADR-022, use status=inactive for soft delete)';
