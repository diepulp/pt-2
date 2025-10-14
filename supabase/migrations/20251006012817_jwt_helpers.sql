-- Migration 2: JWT Helpers and Staff Roles
-- Phase 1: Security Skeleton - Role Infrastructure (Stub)

-- NOTE: StaffRole enum already exists in schema as "StaffRole" (with capital letters)
-- Enum values: DEALER, SUPERVISOR, PIT_BOSS, AUDITOR

-- Create JWT helper function (stub)
-- Returns hardcoded SUPERVISOR role for now
-- Will be expanded in Phase 2 to read from JWT claims
CREATE OR REPLACE FUNCTION jwt_get_role()
RETURNS "StaffRole"
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Phase 1 stub: always return SUPERVISOR
  -- Phase 2+: Extract from auth.jwt() claims
  RETURN 'SUPERVISOR'::"StaffRole";
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION jwt_get_role() TO authenticated;

COMMENT ON FUNCTION jwt_get_role() IS 'Phase 1 stub: Returns SUPERVISOR. Will read JWT claims in Phase 2.';
