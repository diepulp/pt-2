-- Migration: Create Player Notes Table
-- Description: Add player_notes table for the notes service domain
-- Issue: Fixes TypeScript errors in services/notes/* due to missing database table
-- Date: 2025-09-21

-- ============================================================================
-- Player Notes Table
-- ============================================================================
CREATE TABLE player_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  tags TEXT[] DEFAULT '{}',
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Data Validation Constraints
-- ============================================================================
-- Ensure category values are valid
ALTER TABLE player_notes
ADD CONSTRAINT check_note_category
CHECK (category IN ('general', 'behavioral', 'preference', 'incident', 'comp', 'marketing', 'security', 'vip'));

-- Ensure priority values are valid
ALTER TABLE player_notes
ADD CONSTRAINT check_note_priority
CHECK (priority IN ('low', 'normal', 'high', 'critical'));

-- Ensure title and content are not empty
ALTER TABLE player_notes
ADD CONSTRAINT check_title_not_empty
CHECK (LENGTH(TRIM(title)) >= 3 AND LENGTH(title) <= 200);

ALTER TABLE player_notes
ADD CONSTRAINT check_content_not_empty
CHECK (LENGTH(TRIM(content)) >= 10 AND LENGTH(content) <= 5000);

-- Ensure tags array doesn't exceed maximum
ALTER TABLE player_notes
ADD CONSTRAINT check_tags_limit
CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 10);

-- ============================================================================
-- Performance Indexes
-- ============================================================================
CREATE INDEX idx_player_notes_player_id ON player_notes(player_id);
CREATE INDEX idx_player_notes_category ON player_notes(category);
CREATE INDEX idx_player_notes_priority ON player_notes(priority);
CREATE INDEX idx_player_notes_is_flagged ON player_notes(is_flagged) WHERE is_flagged = true;
CREATE INDEX idx_player_notes_is_private ON player_notes(is_private);
CREATE INDEX idx_player_notes_created_by ON player_notes(created_by);
CREATE INDEX idx_player_notes_created_at ON player_notes(created_at);
CREATE INDEX idx_player_notes_updated_at ON player_notes(updated_at);

-- Full-text search index for title and content
CREATE INDEX idx_player_notes_search ON player_notes USING gin(to_tsvector('english', title || ' ' || content));

-- Composite indexes for common queries
CREATE INDEX idx_player_notes_player_category ON player_notes(player_id, category);
CREATE INDEX idx_player_notes_player_priority ON player_notes(player_id, priority);
CREATE INDEX idx_player_notes_player_flagged ON player_notes(player_id, is_flagged) WHERE is_flagged = true;

-- GIN index for tags array queries
CREATE INDEX idx_player_notes_tags ON player_notes USING gin(tags);

-- ============================================================================
-- Updated_at Trigger
-- ============================================================================
-- Reuse the existing trigger function
CREATE TRIGGER update_player_notes_updated_at
    BEFORE UPDATE ON player_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
-- Enable RLS on player_notes table
ALTER TABLE player_notes ENABLE ROW LEVEL SECURITY;

-- Allow staff members to view all notes (for administrative purposes)
CREATE POLICY "Staff can view all player notes" ON player_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Staff"
      WHERE id = auth.uid()::uuid
    )
  );

-- Allow staff members to insert notes
CREATE POLICY "Staff can insert player notes" ON player_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Staff"
      WHERE id = auth.uid()::uuid
    ) AND created_by = auth.uid()::uuid
  );

-- Allow staff members to update notes they created or if they're supervisors
CREATE POLICY "Staff can update player notes" ON player_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Staff"
      WHERE id = auth.uid()::uuid
      AND (
        -- Creator can always update
        auth.uid()::uuid = player_notes.created_by
        -- Supervisors and above can update any note
        OR role IN ('SUPERVISOR', 'PIT_BOSS', 'AUDITOR')
      )
    )
  )
  WITH CHECK (updated_by = auth.uid()::uuid);

-- Allow staff to delete notes with proper authorization
CREATE POLICY "Authorized staff can delete player notes" ON player_notes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Staff"
      WHERE id = auth.uid()::uuid
      AND role IN ('SUPERVISOR', 'PIT_BOSS', 'AUDITOR')
    )
  );

-- ============================================================================
-- Data Integrity Functions
-- ============================================================================
-- Function to validate note tags
CREATE OR REPLACE FUNCTION validate_note_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- Check each tag length
  IF NEW.tags IS NOT NULL THEN
    FOR i IN 1..array_length(NEW.tags, 1) LOOP
      IF LENGTH(NEW.tags[i]) > 50 OR LENGTH(TRIM(NEW.tags[i])) = 0 THEN
        RAISE EXCEPTION 'Tag length must be between 1 and 50 characters';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply tag validation trigger
CREATE TRIGGER validate_player_notes_tags
    BEFORE INSERT OR UPDATE ON player_notes
    FOR EACH ROW EXECUTE FUNCTION validate_note_tags();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE player_notes IS 'Stores player notes for tracking behavior, preferences, incidents, and other player-related information';

COMMENT ON COLUMN player_notes.player_id IS 'References the player this note is about';
COMMENT ON COLUMN player_notes.title IS 'Brief title/summary of the note (3-200 characters)';
COMMENT ON COLUMN player_notes.content IS 'Detailed note content (10-5000 characters)';
COMMENT ON COLUMN player_notes.category IS 'Note category: general, behavioral, preference, incident, comp, marketing, security, vip';
COMMENT ON COLUMN player_notes.priority IS 'Note priority level: low, normal, high, critical';
COMMENT ON COLUMN player_notes.tags IS 'Array of tags for categorization and search (max 10 tags, each max 50 chars)';
COMMENT ON COLUMN player_notes.is_private IS 'Whether this note is private/confidential';
COMMENT ON COLUMN player_notes.is_flagged IS 'Whether this note is flagged for attention';
COMMENT ON COLUMN player_notes.created_by IS 'Staff member who created the note';
COMMENT ON COLUMN player_notes.updated_by IS 'Staff member who last updated the note';
COMMENT ON COLUMN player_notes.created_at IS 'Timestamp when the note was created';
COMMENT ON COLUMN player_notes.updated_at IS 'Timestamp when the note was last updated';

-- ============================================================================
-- Sample Data (Optional - for development/testing)
-- ============================================================================
-- Uncomment below for sample data in development
/*
-- Insert sample notes (requires existing player and staff records)
INSERT INTO player_notes (player_id, title, content, category, priority, created_by, updated_by)
VALUES
  -- These would need real UUIDs from your player and Staff tables
  ('00000000-0000-0000-0000-000000000001', 'Prefers blackjack', 'Player always sits at blackjack tables, prefers $25 minimum tables', 'preference', 'normal', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000001', 'VIP treatment', 'High roller, provide complimentary drinks and expedited service', 'vip', 'high', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010');
*/