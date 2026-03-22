-- Migration: PRD-053 WS3 — Bootstrap Seed Valuation Policy
-- Created: 2026-03-20
-- PRD Reference: docs/10-prd/PRD-053-point-conversion-canonicalization-v0.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-054-point-conversion-canonicalization.md
-- Bounded Context: LoyaltyService (loyalty_valuation_policy)
--
-- Purpose:
--   Seed all existing casinos with an active loyalty_valuation_policy row
--   (cents_per_point = 2) where no active policy exists. This ensures
--   fail-closed valuation lookup (getActiveValuationCentsPerPoint) succeeds
--   for all existing casinos after PRD-053 deployment.
--
-- Idempotent: WHERE NOT EXISTS guard prevents duplicate rows on re-run.
-- Respects partial unique index idx_one_active_policy_per_casino.

INSERT INTO loyalty_valuation_policy (
  casino_id,
  cents_per_point,
  effective_date,
  version_identifier,
  is_active
)
SELECT
  c.id,
  2,
  CURRENT_DATE,
  'prd-053-bootstrap',
  true
FROM casino c
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_valuation_policy lvp
  WHERE lvp.casino_id = c.id AND lvp.is_active = true
);
