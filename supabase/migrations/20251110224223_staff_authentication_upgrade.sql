-- Migration: Staff Authentication Upgrade
-- Description: Add user_id column to staff table linking to auth.users
-- Purpose: Enable canonical RLS pattern (auth.uid() -> staff.user_id)
-- Reference: docs/30-security/SECURITY_TENANCY_UPGRADE.md (Effective 2025-11-09)
-- Related: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md (Staff table schema & RLS patterns)

-- =============================================================================
-- Step 1: Add user_id column to staff table
-- =============================================================================

-- Add user_id column (nullable initially to allow backfill)
alter table staff
  add column user_id uuid references auth.users(id) on delete cascade;

comment on column staff.user_id is
  'Links staff record to Supabase auth user. Required for RLS policy validation via auth.uid().
   Note: Nullable for dealer role (dealers are non-authenticated).';

-- Create unique index to ensure 1:1 mapping between staff and auth users
create unique index staff_user_id_unique on staff(user_id)
  where user_id is not null;

comment on index staff_user_id_unique is
  'Enforces 1:1 relationship: one staff record per auth user. Partial index allows null during backfill.';

-- =============================================================================
-- Step 2: Create exec_sql RPC for SET LOCAL (RLS context injection)
-- =============================================================================

create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  -- Validate that only SET LOCAL commands are allowed
  if sql !~* '^\s*SET\s+LOCAL\s+' then
    raise exception 'exec_sql: Only SET LOCAL commands are permitted. Got: %', sql;
  end if;

  execute sql;
end;
$$;

comment on function exec_sql(text) is
  'Helper function for RLS context injection via SET LOCAL.
   SECURITY: Only allows SET LOCAL commands to prevent SQL injection.
   Usage: SELECT exec_sql(''SET LOCAL app.actor_id = ''<uuid>'';'')';

-- Grant execute to authenticated users (required for RLS context injection)
grant execute on function exec_sql(text) to authenticated;

-- =============================================================================
-- Migration Notes
-- =============================================================================

-- IMPORTANT: user_id column is nullable to support dealer role.
--
-- Dealer Role Exception:
--   Dealers are non-authenticated and have user_id = null.
--   Only pit_boss and admin roles require user_id.
--
-- DO NOT add NOT NULL constraint to user_id column.
--
-- Backfill Strategy (choose one):
--   Option A: Manual assignment via admin tool
--   Option B: Invite flow that creates auth.users + staff records atomically
--   Option C: Migration script (requires careful coordination)
--
-- RLS Policies:
--   Existing policies in SRM (docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
--   already reference staff.user_id. They will become active once user_id is populated.
--   No additional RLS migration needed at this time.
--
-- Validation (before deployment):
--   -- All pit_boss and admin staff must have user_id
--   select count(*) from staff
--   where role in ('pit_boss', 'admin') and user_id is null;
--   -- Should return 0
--
--   -- All dealer staff should have user_id = null
--   select count(*) from staff
--   where role = 'dealer' and user_id is not null;
--   -- Should return 0 (or very few legacy records)
