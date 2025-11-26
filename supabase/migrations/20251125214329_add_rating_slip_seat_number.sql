-- Migration: Add seat_number column to rating_slip
--
-- Resolves SRM internal inconsistency where:
--   - SRM OWNS list (line 1551) documented seat_number
--   - SRM Schema DDL (lines 1575-1590) omitted seat_number
--   - Deployed schema was missing the column
--
-- Reference: PRD-001 Section 3.4, ADR-006, services/rating-slip/README.md
-- All specify seat_number as owned telemetry for RatingSlipService.

ALTER TABLE rating_slip
ADD COLUMN IF NOT EXISTS seat_number text;

-- Add comment for documentation
COMMENT ON COLUMN rating_slip.seat_number IS 'Player seat position at table. Captured at slip creation. SRM:1551 ownership.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
