-- PRD-000: Casino Foundation Database Migration
-- Purpose: compute_gaming_day RPC, staff role constraint, RLS policies
-- Spec: docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md

-- =============================================================================
-- 1. compute_gaming_day RPC Function
-- =============================================================================
-- Single source of truth for gaming day calculation (TEMP-001/TEMP-002 compliance)
-- Used by Finance, MTL, Loyalty, and all services requiring temporal alignment.

CREATE OR REPLACE FUNCTION compute_gaming_day(
  p_casino_id uuid,
  p_timestamp timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_start_time time;
  v_timezone text;
  v_local_time timestamptz;
  v_local_date date;
  v_start_minutes int;
  v_current_minutes int;
BEGIN
  -- Fetch casino settings
  SELECT gaming_day_start_time::time, timezone
  INTO v_start_time, v_timezone
  FROM casino_settings
  WHERE casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASINO_SETTINGS_NOT_FOUND: No settings for casino %', p_casino_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Convert timestamp to casino's local timezone
  v_local_time := p_timestamp AT TIME ZONE v_timezone;
  v_local_date := v_local_time::date;

  -- Compare current time to gaming day start
  v_start_minutes := EXTRACT(HOUR FROM v_start_time) * 60 + EXTRACT(MINUTE FROM v_start_time);
  v_current_minutes := EXTRACT(HOUR FROM v_local_time) * 60 + EXTRACT(MINUTE FROM v_local_time);

  -- If before gaming day start, use previous calendar day
  IF v_current_minutes < v_start_minutes THEN
    RETURN v_local_date - 1;
  END IF;

  RETURN v_local_date;
END;
$$;

COMMENT ON FUNCTION compute_gaming_day(uuid, timestamptz) IS 'TEMP-001: Single source of truth for gaming day calculation. Used by Finance, MTL, and all services requiring temporal alignment.';

-- =============================================================================
-- 2. Staff Role Constraint
-- =============================================================================
-- Enforce role model: dealer = non-authenticated, pit_boss/admin = authenticated
-- Dealers interact via physical table presence, not digital authentication
-- Pit bosses and admins require Supabase Auth for audit trail

ALTER TABLE staff DROP CONSTRAINT IF EXISTS chk_staff_role_user_id;

ALTER TABLE staff ADD CONSTRAINT chk_staff_role_user_id
  CHECK (
    (role = 'dealer' AND user_id IS NULL) OR
    (role IN ('pit_boss', 'admin') AND user_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT chk_staff_role_user_id ON staff IS 'PRD-000: Dealers cannot have user_id (non-authenticated); pit_boss/admin must have user_id linked to auth.users';

-- =============================================================================
-- 3. RLS Policies - casino_settings
-- =============================================================================
-- Enable RLS on casino_settings
ALTER TABLE casino_settings ENABLE ROW LEVEL SECURITY;

-- Read: Any authenticated staff member in same casino can read
DROP POLICY IF EXISTS casino_settings_read ON casino_settings;
CREATE POLICY casino_settings_read ON casino_settings
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- Write: Only admin role can modify settings
DROP POLICY IF EXISTS casino_settings_write ON casino_settings;
CREATE POLICY casino_settings_write ON casino_settings
  FOR ALL USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  )
  WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- 4. RLS Policies - staff
-- =============================================================================
-- Enable RLS on staff table
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Read: Same casino
DROP POLICY IF EXISTS staff_read ON staff;
CREATE POLICY staff_read ON staff
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- Write (INSERT): Admin only
DROP POLICY IF EXISTS staff_write ON staff;
CREATE POLICY staff_write ON staff
  FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- Update: Admin only
DROP POLICY IF EXISTS staff_update ON staff;
CREATE POLICY staff_update ON staff
  FOR UPDATE USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- Delete: Admin only
DROP POLICY IF EXISTS staff_delete ON staff;
CREATE POLICY staff_delete ON staff
  FOR DELETE USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- =============================================================================
-- 5. Notify PostgREST to reload schema
-- =============================================================================
NOTIFY pgrst, 'reload schema';
