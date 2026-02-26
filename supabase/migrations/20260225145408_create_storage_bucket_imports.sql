-- ============================================================================
-- Migration: PRD-039 Server-Authoritative CSV Ingestion Worker — Storage Bucket
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-039-server-csv-ingestion-worker.md
-- ADR References: ADR-036 (CSV import strategy), ADR-037 (server CSV ingestion worker)
--
-- Purpose:
--   Create the 'imports' Supabase Storage bucket for CSV file uploads.
--   Private bucket with 10MB file size limit. All access is via service_role
--   key from the server-side worker — no storage.objects RLS policies needed.
-- ============================================================================

-- ============================================================================
-- 1. CREATE STORAGE BUCKET
-- ============================================================================

-- Private bucket for CSV import files. 10MB limit (10 * 1024 * 1024 = 10485760).
-- The server-side ingestion worker accesses this bucket using the service_role
-- key, bypassing RLS entirely. Client-side uploads go through an API route
-- handler that validates auth and streams to storage via service_role.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('imports', 'imports', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- NO storage.objects RLS POLICIES
-- ============================================================================
-- All storage access for the 'imports' bucket is performed server-side using
-- the service_role key (which bypasses RLS). Reasons:
--   1. CSV uploads are proxied through a Next.js API route handler that
--      authenticates the user and validates permissions before uploading.
--   2. The ingestion worker reads files using service_role credentials.
--   3. No direct client-to-storage access is permitted for import files.
-- Adding RLS policies here would be dead code with no security benefit.

-- ============================================================================
-- 2. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
