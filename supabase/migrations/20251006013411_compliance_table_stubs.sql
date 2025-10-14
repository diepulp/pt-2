-- Migration 4: Compliance Table RLS
-- Phase 1: Security Skeleton - Enable RLS on existing compliance tables

-- NOTE: Both mtl_entry and casino_settings tables already exist
-- mtl_entry: Tracks Multiple Transaction Log entries for AML/CTR compliance
-- casino_settings: Per-casino configuration (timezone, gaming day, thresholds)

-- Enable RLS on mtl_entry (already has comprehensive schema)
ALTER TABLE mtl_entry ENABLE ROW LEVEL SECURITY;

-- Enable RLS on casino_settings
ALTER TABLE casino_settings ENABLE ROW LEVEL SECURITY;

-- MTL Entry Policies
-- Only AUDITOR and SUPERVISOR roles can read MTL entries
CREATE POLICY "mtl_read_policy" ON mtl_entry
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role IN ('AUDITOR'::"StaffRole", 'SUPERVISOR'::"StaffRole")
    )
  );

-- Any authenticated staff can insert MTL entries
CREATE POLICY "mtl_insert_policy" ON mtl_entry
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

-- Casino Settings Policies
-- SUPERVISOR and AUDITOR can read casino settings
CREATE POLICY "casino_settings_read_policy" ON casino_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role IN ('SUPERVISOR'::"StaffRole", 'AUDITOR'::"StaffRole")
    )
  );

-- Only SUPERVISOR can modify casino settings
CREATE POLICY "casino_settings_write_policy" ON casino_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role = 'SUPERVISOR'::"StaffRole"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role = 'SUPERVISOR'::"StaffRole"
    )
  );

-- Create additional indexes if needed
CREATE INDEX IF NOT EXISTS idx_mtl_entry_created_at ON mtl_entry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mtl_entry_casino_id ON mtl_entry(casino_id);
CREATE INDEX IF NOT EXISTS idx_mtl_entry_gaming_day ON mtl_entry(gaming_day);

COMMENT ON TABLE mtl_entry IS 'Multiple Transaction Log for AML/CTR compliance tracking';
COMMENT ON TABLE casino_settings IS 'Per-casino configuration for gaming day, timezone, and compliance thresholds';
