-- ============================================================================
-- Migration: PRD-024 — Add setup_status to casino_settings
-- Created: 2026-02-01 17:32:34
-- Reference: PRD-024 (Landing Page Overhaul + Start Gateway v0)
-- Bounded Context: CasinoService (owns casino_settings)
-- ============================================================================

BEGIN;

ALTER TABLE casino_settings
  ADD COLUMN setup_status text NOT NULL DEFAULT 'not_started'
    CONSTRAINT casino_settings_setup_status_check
      CHECK (setup_status IN ('not_started', 'in_progress', 'ready')),
  ADD COLUMN setup_completed_at timestamptz;

-- CRITICAL BACKFILL: Without this, ALL existing users route to /setup
UPDATE casino_settings
  SET setup_status = 'ready',
      setup_completed_at = now()
  WHERE setup_status = 'not_started';

NOTIFY pgrst, 'reload schema';

COMMIT;
