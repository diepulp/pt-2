-- Migration: 20260511134200_wave2_table_buyin_telemetry_reconcile.sql
-- Purpose: Add event_type column to table_buyin_telemetry for Wave 2 finance_outbox integration.
-- All existing required columns (telemetry_kind, actor_id, gaming_day, visit_id, rating_slip_id)
-- are preserved — this migration is additive only.
-- Backfill derives event_type from existing telemetry_kind values.
-- No player_id column added — absent by DDL construction (ADR-052 R5).

-- Pre-state check: required existing columns must be present
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'table_buyin_telemetry'
      AND column_name  = 'telemetry_kind'
  ), 'PRE-STATE FAIL: table_buyin_telemetry.telemetry_kind absent. Expected existing schema not found.';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'table_buyin_telemetry'
      AND column_name  = 'actor_id'
  ), 'PRE-STATE FAIL: table_buyin_telemetry.actor_id absent. Required columns must be preserved.';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'table_buyin_telemetry'
      AND column_name  = 'gaming_day'
  ), 'PRE-STATE FAIL: table_buyin_telemetry.gaming_day absent. Required columns must be preserved.';
END $$;

-- Add event_type column (nullable initially for backfill)
ALTER TABLE public.table_buyin_telemetry
  ADD COLUMN IF NOT EXISTS event_type TEXT NULL;

-- Backfill from telemetry_kind for all existing rows
UPDATE public.table_buyin_telemetry
SET event_type = CASE telemetry_kind
  WHEN 'GRIND_BUYIN' THEN 'grind.observed'
  WHEN 'RATED_BUYIN' THEN 'buyin.observed'
  ELSE 'grind.observed'  -- defensive fallback for any unexpected values
END
WHERE event_type IS NULL;

-- Apply NOT NULL constraint after backfill
ALTER TABLE public.table_buyin_telemetry
  ALTER COLUMN event_type SET NOT NULL;

-- Apply CHECK constraint: only Wave 2 catalog values permitted
ALTER TABLE public.table_buyin_telemetry
  ADD CONSTRAINT chk_tbt_event_type
    CHECK (event_type IN ('buyin.observed', 'grind.observed'));

COMMENT ON COLUMN public.table_buyin_telemetry.event_type IS
  'Wave 2 finance_outbox event catalog value. grind.observed: emitted by rpc_record_grind_observation (Class B). buyin.observed: cataloged for future producer slices; backfilled from RATED_BUYIN rows. Derived from telemetry_kind on existing rows.';
