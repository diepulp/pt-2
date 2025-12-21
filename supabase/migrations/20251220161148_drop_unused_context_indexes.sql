-- =====================================================
-- Migration: Drop Unused Context Schema Indexes
-- Created: 2025-12-20 16:11:48
-- Purpose: Remove unused indexes from context schema tables
--          after confirming zero production usage
-- Note: Removed CONCURRENTLY for Supabase migration compatibility
-- WARNING: Run ONLY after verifying no production queries use these indexes
-- =====================================================

-- Drop unused indexes on context.sessions table
-- These appear to be legacy from a chat system and are not used by PT-2
DROP INDEX IF EXISTS context.idx_sessions_user;
DROP INDEX IF EXISTS context.idx_sessions_chatmode;

-- Drop unused indexes on context.session_events table
-- These indexes are not used in current PT-2 operations
DROP INDEX IF EXISTS context.idx_session_events_session;
DROP INDEX IF EXISTS context.idx_session_events_type;

-- Note: The following context schema indexes are RETAINED:
-- - idx_sessions_started_at: May be needed for session analytics
-- - idx_sessions_active: May be needed for active session queries
-- - idx_session_events_created_at: Likely needed for temporal queries
-- These will be reviewed in a future migration after confirming usage

-- Post-migration verification
-- Run these queries to confirm successful removal
/*
-- Check remaining indexes on context tables
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'context'
ORDER BY tablename, indexname;

-- Verify no queries are using dropped indexes
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'context'
  AND (tablename = 'sessions' OR tablename = 'session_events')
ORDER BY tablename, attname;
*/