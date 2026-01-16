-- =====================================================
-- Migration: Add patron name to MTL Gaming Day Summary
-- Created: 2026-01-16 22:10:07
-- Purpose: Include patron first_name and last_name in compliance dashboard
-- References: ISSUE-EEC1A683, PRD-005, ADR-025
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: DROP AND RECREATE mtl_gaming_day_summary VIEW
-- =====================================================
-- PostgreSQL doesn't allow adding columns in the middle of an existing view
-- with CREATE OR REPLACE, so we must DROP and recreate.
-- This is safe because views have no data storage.

DROP VIEW IF EXISTS mtl_gaming_day_summary;

CREATE VIEW mtl_gaming_day_summary AS
SELECT
  e.casino_id,
  e.patron_uuid,
  p.first_name AS patron_first_name,
  p.last_name AS patron_last_name,
  e.gaming_day,
  -- Cash-in aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE 0 END), 0) AS total_in,
  COUNT(CASE WHEN e.direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN e.direction = 'in' THEN e.amount END) AS max_single_in,
  MIN(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS first_in_at,
  MAX(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS last_in_at,
  -- Cash-out aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'out' THEN e.amount ELSE 0 END), 0) AS total_out,
  COUNT(CASE WHEN e.direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN e.direction = 'out' THEN e.amount END) AS max_single_out,
  MIN(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS first_out_at,
  MAX(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS last_out_at,
  -- Overall
  COALESCE(SUM(e.amount), 0) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry e
LEFT JOIN player p ON e.patron_uuid = p.id
WHERE e.gaming_day IS NOT NULL
GROUP BY e.casino_id, e.patron_uuid, p.first_name, p.last_name, e.gaming_day;

COMMENT ON VIEW mtl_gaming_day_summary IS
  'Aggregates MTL entries per patron per gaming day with patron names. Uses occurred_at for timestamps. Authoritative surface for Tier 2 compliance badges (CTR/AML).';

COMMIT;
