-- Migration: ADR-015 JWT Claims Backfill
-- Description: Backfill app_metadata for existing authenticated staff
-- Workstream: ADR-015 Phase 2 - JWT Claims Migration
-- Created: 2025-12-10
-- Reference: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

-- ============================================================================
-- CONTEXT
-- ============================================================================
-- ADR-015 Phase 2 requires staff claims (casino_id, staff_role, staff_id) to
-- be stored in auth.users.app_metadata for RLS policies to work correctly
-- with Supabase connection pooling (transaction mode).
--
-- This migration:
-- 1. Creates sync function to copy staff claims to auth.users.app_metadata
-- 2. Backfills existing staff with user_id linked
-- 3. Creates trigger for automatic future sync
--
-- Note: Dealers have user_id = null and don't need JWT claims.
-- ============================================================================

-- ============================================================================
-- 1. SYNC FUNCTION - Single staff member claims to JWT
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_staff_jwt_claims(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user_id uuid;
  v_casino_id uuid;
  v_role text;
BEGIN
  -- Get staff details
  SELECT user_id, casino_id, role
  INTO v_user_id, v_casino_id, v_role
  FROM public.staff
  WHERE id = p_staff_id;

  -- Only sync if staff has a linked user (dealers have user_id = null)
  IF v_user_id IS NOT NULL THEN
    -- Merge with existing app_metadata (don't overwrite other keys)
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'casino_id', v_casino_id::text,
      'staff_role', v_role,
      'staff_id', p_staff_id::text
    )
    WHERE id = v_user_id;
  END IF;
END;
$$;

-- Grant execution to service_role for admin operations
GRANT EXECUTE ON FUNCTION sync_staff_jwt_claims(uuid) TO service_role;

COMMENT ON FUNCTION sync_staff_jwt_claims IS
  'ADR-015 Phase 2: Syncs staff claims (casino_id, staff_role, staff_id) to auth.users.app_metadata for connection pooling compatibility.';

-- ============================================================================
-- 2. BACKFILL EXISTING STAFF
-- ============================================================================

DO $$
DECLARE
  staff_record RECORD;
  staff_count INT := 0;
  synced_count INT := 0;
BEGIN
  -- Count total staff with user_id
  SELECT COUNT(*) INTO staff_count FROM public.staff WHERE user_id IS NOT NULL;

  RAISE NOTICE 'Starting JWT claims backfill for % authenticated staff members', staff_count;

  -- Sync all existing staff with user_id
  FOR staff_record IN
    SELECT id, role, casino_id FROM public.staff WHERE user_id IS NOT NULL
  LOOP
    PERFORM sync_staff_jwt_claims(staff_record.id);
    synced_count := synced_count + 1;

    -- Log progress every 10 records
    IF synced_count % 10 = 0 THEN
      RAISE NOTICE 'Synced % / % staff members', synced_count, staff_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'JWT claims backfill complete: % staff members synced', synced_count;
END $$;

-- ============================================================================
-- 3. TRIGGER FOR AUTOMATIC SYNC
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_staff_jwt_claims_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  -- Sync claims when staff is created/updated with user_id
  IF NEW.user_id IS NOT NULL THEN
    PERFORM sync_staff_jwt_claims(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_staff_jwt_claims_trigger IS
  'ADR-015 Phase 2: Automatically syncs staff JWT claims on INSERT or UPDATE of user_id, casino_id, or role.';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_staff_jwt_claims ON public.staff;

-- Create trigger on INSERT/UPDATE
CREATE TRIGGER trg_sync_staff_jwt_claims
  AFTER INSERT OR UPDATE OF user_id, casino_id, role
  ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION sync_staff_jwt_claims_trigger();

COMMENT ON TRIGGER trg_sync_staff_jwt_claims ON public.staff IS
  'ADR-015 Phase 2: Maintains auth.users.app_metadata in sync with staff table changes.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify all authenticated staff have JWT claims
DO $$
DECLARE
  missing_claims_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_claims_count
  FROM public.staff s
  INNER JOIN auth.users u ON s.user_id = u.id
  WHERE s.user_id IS NOT NULL
    AND (
      (u.raw_app_meta_data->>'casino_id')::uuid IS NULL
      OR (u.raw_app_meta_data->>'staff_role') IS NULL
      OR (u.raw_app_meta_data->>'staff_id')::uuid IS NULL
    );

  IF missing_claims_count > 0 THEN
    RAISE WARNING 'Found % staff members with incomplete JWT claims', missing_claims_count;
  ELSE
    RAISE NOTICE 'Verification passed: All authenticated staff have complete JWT claims';
  END IF;
END $$;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

-- This migration completes ADR-015 Phase 2:
-- ✓ sync_staff_jwt_claims() function for manual/batch sync
-- ✓ Backfilled all existing staff with user_id
-- ✓ Trigger for automatic future sync
-- ✓ Verification check for data integrity
--
-- Next Steps (ADR-015 Phase 3):
-- - Update application layer to rely on JWT claims (auth.jwt()->>'app_metadata')
-- - Phase out SET LOCAL context injection once JWT claims are proven stable
-- - Monitor RLS policy performance with connection pooling enabled
