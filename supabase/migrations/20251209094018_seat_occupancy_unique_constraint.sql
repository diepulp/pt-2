-- Migration: Seat Occupancy Unique Constraint
-- PRD: PRD-006 (Pit Dashboard)
-- Business Rule: One player per seat enforced (resolved 2025-12-09)
--
-- Creates a partial unique index to prevent multiple active rating slips
-- at the same table+seat position. Only applies to open/paused slips,
-- allowing historical closed slips to have duplicate seats.

-- Enforce one active rating slip per seat per table
-- Partial unique index only applies to open/paused slips (not closed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_slip_active_seat_unique
ON rating_slip (table_id, seat_number)
WHERE status IN ('open', 'paused') AND seat_number IS NOT NULL;

COMMENT ON INDEX idx_rating_slip_active_seat_unique IS
  'Business rule: One player per seat. Prevents duplicate active slips at same table+seat. Resolved 2025-12-09 per PRD-006.';

-- Add index for efficient seat availability queries
-- This supports the dashboard's need to quickly check which seats are occupied
CREATE INDEX IF NOT EXISTS idx_rating_slip_table_seat_status
ON rating_slip (table_id, seat_number, status)
WHERE seat_number IS NOT NULL;

COMMENT ON INDEX idx_rating_slip_table_seat_status IS
  'Optimizes queries for seat occupancy by table and status (dashboard performance)';
