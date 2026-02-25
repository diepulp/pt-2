-- ============================================================================
-- Migration: PRD-039 Server-Authoritative CSV Ingestion Worker — Schema Extension
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-039-server-csv-ingestion-worker.md
-- ADR References: ADR-036 (CSV import strategy), ADR-037 (server CSV ingestion worker)
--
-- Purpose:
--   Extend import_batch_status enum with worker lifecycle states ('created',
--   'uploaded', 'parsing') and add worker lifecycle columns to import_batch
--   (storage_path, claimed_by, heartbeat_at, attempt_count, etc.).
--   Create partial indexes for worker claim and reaper queries.
--   Guard assertion: verify uq_import_row_batch_row UNIQUE constraint exists.
-- ============================================================================

-- ============================================================================
-- 1. ENUM EXTENSIONS: Add worker lifecycle states
-- ============================================================================

-- 'created' — batch record created, file not yet uploaded
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'created';

-- 'uploaded' — file uploaded to storage, awaiting worker claim
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'uploaded';

-- 'parsing' — worker has claimed the batch and is parsing the CSV
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'parsing';

-- ============================================================================
-- 2. WORKER LIFECYCLE COLUMNS on import_batch
-- ============================================================================

-- Path in Supabase Storage (e.g., 'imports/<casino_id>/<batch_id>.csv')
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS storage_path text;

-- Original uploaded filename (may differ from file_name used for display)
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS original_file_name text;

-- Worker instance ID that claimed this batch
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS claimed_by text;

-- Timestamp when the worker claimed this batch
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Last heartbeat from the worker (used by reaper to detect stale claims)
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Retry counter (incremented on each worker claim attempt)
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

-- Timestamp of the last error occurrence
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

-- Error code from the last failure (e.g., 'BATCH_ROW_LIMIT', 'PARSE_ERROR')
ALTER TABLE public.import_batch
  ADD COLUMN IF NOT EXISTS last_error_code text;

-- ============================================================================
-- 3. PARTIAL INDEXES for worker queries
-- ============================================================================

-- Worker claim query: find batches in 'uploaded' status ready for processing
CREATE INDEX IF NOT EXISTS idx_import_batch_status_uploaded
  ON public.import_batch (id)
  WHERE status = 'uploaded';

-- Reaper query: find 'parsing' batches with stale heartbeats
CREATE INDEX IF NOT EXISTS idx_import_batch_status_parsing_heartbeat
  ON public.import_batch (status, heartbeat_at)
  WHERE status = 'parsing';

-- ============================================================================
-- 4. GUARD ASSERTION: uq_import_row_batch_row must exist
-- ============================================================================

-- The ON CONFLICT (batch_id, row_number) DO NOTHING pattern in
-- rpc_import_stage_rows is load-bearing. If this constraint is missing,
-- duplicate rows could be inserted silently. Fail fast.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_import_row_batch_row'
  ) THEN
    RAISE EXCEPTION 'FATAL: UNIQUE(batch_id, row_number) constraint missing — ON CONFLICT DO NOTHING is load-bearing';
  END IF;
END $$;

-- ============================================================================
-- 5. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
