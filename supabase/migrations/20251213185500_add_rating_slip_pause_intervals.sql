-- Migration: Add pause_intervals column to rating_slip table
-- This column is referenced in rpc_pause_rating_slip, rpc_resume_rating_slip, and rpc_close_rating_slip
-- but was never added to the actual table schema.

ALTER TABLE rating_slip ADD COLUMN IF NOT EXISTS pause_intervals tstzrange[] DEFAULT '{}';
