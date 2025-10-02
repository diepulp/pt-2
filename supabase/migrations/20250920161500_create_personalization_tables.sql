-- Migration: Create Personalization Tables
-- Description: Add missing personalization tables for player preferences, loyalty, and recommendations
-- Issue: Fixes TypeScript errors in services/personalization/crud.ts due to missing database tables
-- Date: 2025-09-20

-- ============================================================================
-- Player Preferences Table
-- ============================================================================
CREATE TABLE player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  preferred_games TEXT[] DEFAULT '{}',
  preferred_tables TEXT[] DEFAULT '{}',
  preferred_limits JSONB DEFAULT '{}',
  communication_preferences JSONB DEFAULT '{}',
  accessibility_needs JSONB DEFAULT '{}',
  special_requests TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- ============================================================================
-- Player Loyalty Table
-- ============================================================================
CREATE TABLE player_loyalty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'bronze',
  points_balance INTEGER DEFAULT 0,
  points_earned_total INTEGER DEFAULT 0,
  points_redeemed_total INTEGER DEFAULT 0,
  tier_progress DECIMAL(5,2) DEFAULT 0.0,
  tier_expires_at TIMESTAMPTZ,
  benefits JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  milestones JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- ============================================================================
-- Player Recommendations Table
-- ============================================================================
CREATE TABLE player_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  game_recommendations JSONB DEFAULT '[]',
  promotion_recommendations JSONB DEFAULT '[]',
  table_recommendations JSONB DEFAULT '[]',
  personalized_offers JSONB DEFAULT '[]',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- ============================================================================
-- Performance Indexes
-- ============================================================================
CREATE INDEX idx_player_preferences_player_id ON player_preferences(player_id);
CREATE INDEX idx_player_loyalty_player_id ON player_loyalty(player_id);
CREATE INDEX idx_player_loyalty_tier ON player_loyalty(tier);
CREATE INDEX idx_player_loyalty_points_balance ON player_loyalty(points_balance);
CREATE INDEX idx_player_recommendations_player_id ON player_recommendations(player_id);
CREATE INDEX idx_player_recommendations_last_updated ON player_recommendations(last_updated);

-- ============================================================================
-- Updated_at Triggers
-- ============================================================================
-- Function for updating updated_at column (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automated updated_at management
CREATE TRIGGER update_player_preferences_updated_at
    BEFORE UPDATE ON player_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_loyalty_updated_at
    BEFORE UPDATE ON player_loyalty
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
-- Enable RLS on all personalization tables
ALTER TABLE player_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_recommendations ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust according to your auth requirements)
-- Allow authenticated users to read/write their own data
CREATE POLICY "Users can view own preferences" ON player_preferences
  FOR SELECT USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can update own preferences" ON player_preferences
  FOR UPDATE USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can insert own preferences" ON player_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = player_id::text);

CREATE POLICY "Users can view own loyalty" ON player_loyalty
  FOR SELECT USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can update own loyalty" ON player_loyalty
  FOR UPDATE USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can insert own loyalty" ON player_loyalty
  FOR INSERT WITH CHECK (auth.uid()::text = player_id::text);

CREATE POLICY "Users can view own recommendations" ON player_recommendations
  FOR SELECT USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can update own recommendations" ON player_recommendations
  FOR UPDATE USING (auth.uid()::text = player_id::text);

CREATE POLICY "Users can insert own recommendations" ON player_recommendations
  FOR INSERT WITH CHECK (auth.uid()::text = player_id::text);

-- ============================================================================
-- Data Validation Constraints
-- ============================================================================
-- Ensure tier values are valid
ALTER TABLE player_loyalty
ADD CONSTRAINT check_loyalty_tier
CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

-- Ensure points are non-negative
ALTER TABLE player_loyalty
ADD CONSTRAINT check_points_balance_non_negative
CHECK (points_balance >= 0);

ALTER TABLE player_loyalty
ADD CONSTRAINT check_points_earned_non_negative
CHECK (points_earned_total >= 0);

ALTER TABLE player_loyalty
ADD CONSTRAINT check_points_redeemed_non_negative
CHECK (points_redeemed_total >= 0);

-- Ensure tier_progress is percentage
ALTER TABLE player_loyalty
ADD CONSTRAINT check_tier_progress_range
CHECK (tier_progress >= 0.0 AND tier_progress <= 100.0);

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE player_preferences IS 'Stores player preferences for games, tables, limits, and communication settings';
COMMENT ON TABLE player_loyalty IS 'Tracks player loyalty points, tier status, achievements, and benefits';
COMMENT ON TABLE player_recommendations IS 'AI-generated personalized recommendations for games, promotions, and tables';

COMMENT ON COLUMN player_preferences.preferred_limits IS 'JSON object containing minimum, maximum, preferred betting limits and currency';
COMMENT ON COLUMN player_preferences.communication_preferences IS 'JSON object for email, SMS, push notification preferences';
COMMENT ON COLUMN player_preferences.accessibility_needs IS 'JSON object for accessibility accommodations and requirements';

COMMENT ON COLUMN player_loyalty.tier IS 'Current loyalty tier: bronze, silver, gold, platinum, diamond';
COMMENT ON COLUMN player_loyalty.tier_progress IS 'Progress towards next tier as percentage (0-100)';
COMMENT ON COLUMN player_loyalty.benefits IS 'JSON array of active loyalty benefits and perks';
COMMENT ON COLUMN player_loyalty.achievements IS 'JSON array of earned achievements and awards';
COMMENT ON COLUMN player_loyalty.milestones IS 'JSON array of reached milestones and goals';

COMMENT ON COLUMN player_recommendations.game_recommendations IS 'JSON array of AI-recommended games based on player history';
COMMENT ON COLUMN player_recommendations.promotion_recommendations IS 'JSON array of targeted promotional offers';
COMMENT ON COLUMN player_recommendations.table_recommendations IS 'JSON array of recommended tables and limits';
COMMENT ON COLUMN player_recommendations.personalized_offers IS 'JSON array of custom offers and incentives';