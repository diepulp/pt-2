-- Migration: Add theo calculation fields to game_settings
-- Purpose: Enable AOV/theo calculations for MVP UI per PRD-001 Q2 decision
-- Date: 2025-11-26

-- Add new columns for theo calculation
ALTER TABLE game_settings
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS house_edge numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS decisions_per_hour int NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS seats_available int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS points_conversion_rate numeric DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS point_multiplier numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Set default name based on game_type for existing rows
UPDATE game_settings
SET name = CASE game_type
  WHEN 'blackjack' THEN 'Blackjack Standard'
  WHEN 'poker' THEN 'Poker Standard'
  WHEN 'roulette' THEN 'Roulette Standard'
  WHEN 'baccarat' THEN 'Baccarat Standard'
  ELSE initcap(game_type::text) || ' Standard'
END
WHERE name IS NULL;

-- Now make name NOT NULL after populating
ALTER TABLE game_settings
  ALTER COLUMN name SET NOT NULL;

-- Add constraints for data integrity
ALTER TABLE game_settings
  ADD CONSTRAINT chk_house_edge_range CHECK (house_edge >= 0 AND house_edge <= 100),
  ADD CONSTRAINT chk_decisions_positive CHECK (decisions_per_hour > 0),
  ADD CONSTRAINT chk_seats_positive CHECK (seats_available > 0);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_game_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_game_settings_updated_at ON game_settings;
CREATE TRIGGER trg_game_settings_updated_at
  BEFORE UPDATE ON game_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_game_settings_updated_at();

-- Insert default game settings for common game types if they don't exist
-- This provides sensible defaults for theo calculation
COMMENT ON COLUMN game_settings.house_edge IS 'House edge as percentage (e.g., 1.5 = 1.5%)';
COMMENT ON COLUMN game_settings.decisions_per_hour IS 'Average number of betting decisions per hour';
COMMENT ON COLUMN game_settings.seats_available IS 'Number of player positions at the table';
COMMENT ON COLUMN game_settings.points_conversion_rate IS 'Multiplier to convert theo to loyalty points';
COMMENT ON COLUMN game_settings.point_multiplier IS 'Promotional multiplier for points (default 1.0)';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
