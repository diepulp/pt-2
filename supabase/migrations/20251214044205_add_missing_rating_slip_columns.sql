-- Migration: Add missing columns to rating_slip table
-- These columns are referenced in rpc_close_rating_slip function but were never added
-- Note: pause_intervals is added in 20251213185500_add_rating_slip_pause_intervals.sql

ALTER TABLE rating_slip ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE rating_slip ADD COLUMN IF NOT EXISTS final_average_bet NUMERIC;
