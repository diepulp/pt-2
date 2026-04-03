-- =============================================================================
-- SEC-S4: Move pg_trgm extension from public to extensions schema
-- =============================================================================
-- Risk: Extensions in the public schema can be manipulated by users with
-- CREATE privileges on public.
-- Ref: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
-- =============================================================================

-- Drop the existing extension from public schema and recreate in extensions
-- Note: This will temporarily drop dependent objects (gin_trgm_ops indexes).
-- We recreate them immediately after.

-- Step 1: Drop the trigram index that depends on pg_trgm
DROP INDEX IF EXISTS ix_player_name_trgm;

-- Step 2: Drop extension from public schema
DROP EXTENSION IF EXISTS pg_trgm;

-- Step 3: Recreate extension in extensions schema (Supabase convention)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Step 4: Recreate the trigram index for fuzzy player name search
-- The operator class is now in extensions schema; Postgres resolves it
-- via search_path which includes extensions on Supabase.
CREATE INDEX IF NOT EXISTS ix_player_name_trgm
  ON player USING gin (
    (lower(first_name) || ' ' || lower(last_name)) extensions.gin_trgm_ops
  );
