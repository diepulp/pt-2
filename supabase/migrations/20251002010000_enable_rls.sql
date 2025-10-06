-- Migration 1: Enable RLS on Core Tables
-- Phase 1: Security Skeleton - Baseline RLS

-- Enable RLS on core tables
ALTER TABLE player ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratingslip ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino ENABLE ROW LEVEL SECURITY;

-- Deny-all baseline (no default access)
-- This ensures explicit policies are required for any access

-- NOTE: Current schema does not have auth integration (no user_id linking to auth.uid())
-- For now, enable RLS without policies to enforce explicit access control
-- Phase 2 will add proper auth columns and policies based on domain requirements

-- Example policy structure (commented out until auth integration):
-- CREATE POLICY "player_owner_policy" ON player
--   FOR ALL
--   USING (user_id = auth.uid())
--   WITH CHECK (user_id = auth.uid());

-- Staff-only access policy (using existing Staff table and auth)
-- This allows authenticated staff to access data based on their role
CREATE POLICY "staff_access_policy" ON player
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "staff_access_policy" ON visit
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "staff_access_policy" ON ratingslip
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "staff_access_policy" ON casino
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
    )
  );

-- Other tables will have policies added in Phase 2 as domain services are built
