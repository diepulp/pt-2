-- Migration: Dealer Role Clarification
-- Description: Remove default staff role and clarify dealer semantics
-- Purpose: Establish dealer as non-authenticated scheduling metadata role
-- Reference: docs/audits/DEALER_ROLE_BLAST_RADIUS_AUDIT_NOV_10.md

-- =============================================================================
-- Step 1: Remove default role from staff table
-- =============================================================================

-- Remove default 'dealer' role (require explicit assignment)
alter table staff alter column role drop default;

comment on column staff.role is
  'Staff role. Dealer role is for scheduling only (non-authenticated).
   Pit boss and admin roles require authentication and have operational permissions.';

-- =============================================================================
-- Step 2: Update user_id column documentation
-- =============================================================================

comment on column staff.user_id is
  'Links staff record to Supabase auth user. Required for pit_boss and admin roles.
   Optional (null) for dealer role - dealers do not authenticate to the application.';

-- =============================================================================
-- Step 3: Update dealer_rotation table documentation
-- =============================================================================

comment on table dealer_rotation is
  'Tracks dealer-to-table assignments for scheduling purposes only.
   Dealers are non-authenticated and have no application permissions.
   This is operational metadata, not access control.
   Management of rotations is performed by pit_boss and admin roles.';

-- =============================================================================
-- Migration Notes
-- =============================================================================

-- Dealer Role Semantics:
--   - Dealers are NON-AUTHENTICATED participants (staff.user_id = null)
--   - Dealers DO NOT log in to the application
--   - Dealers have ZERO application permissions
--   - Dealer rotations are scheduling metadata for operational visibility
--   - Rotation management is performed by pit_boss/admin via administrative APIs
--
-- Staff Role Requirements:
--   - dealer: user_id must be null (non-authenticated)
--   - pit_boss: user_id must be not null (authenticated)
--   - admin: user_id must be not null (authenticated)
--
-- Validation:
--   -- All pit_boss and admin staff must have user_id
--   select count(*) from staff
--   where role in ('pit_boss', 'admin') and user_id is null;
--   -- Should return 0
--
--   -- All dealer staff should have user_id = null
--   select count(*) from staff
--   where role = 'dealer' and user_id is not null;
--   -- Should return 0 (or very few legacy records)
