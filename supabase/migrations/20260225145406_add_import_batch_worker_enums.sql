-- ============================================================================
-- Migration: PRD-039 Server-Authoritative CSV Ingestion Worker — Enum Extensions
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-039-server-csv-ingestion-worker.md
--
-- Purpose:
--   Extend import_batch_status enum with worker lifecycle states ('created',
--   'uploaded', 'parsing'). Split from column/index migration because
--   PostgreSQL cannot reference newly-added enum values within the same
--   transaction (SQLSTATE 55P04).
-- ============================================================================

-- 'created' — batch record created, file not yet uploaded
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'created';

-- 'uploaded' — file uploaded to storage, awaiting worker claim
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'uploaded';

-- 'parsing' — worker has claimed the batch and is parsing the CSV
ALTER TYPE public.import_batch_status ADD VALUE IF NOT EXISTS 'parsing';
