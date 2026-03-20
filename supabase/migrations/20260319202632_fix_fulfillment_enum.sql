-- ============================================================================
-- Migration: Fix fulfillment CHECK constraint to match app enum values
-- Created: 2026-03-19
-- Issue: P2K-29 — DB CHECK uses ('immediate', 'voucher', 'external') but
--        app uses ('comp_slip', 'coupon', 'none'). Zero overlap causes every
--        reward insert with a fulfillment value to fail (error 23514).
-- Fix: Drop old constraint and recreate with app values (Option A).
-- ============================================================================

BEGIN;

ALTER TABLE public.reward_catalog
  DROP CONSTRAINT IF EXISTS reward_catalog_fulfillment_check;

ALTER TABLE public.reward_catalog
  ADD CONSTRAINT reward_catalog_fulfillment_check
  CHECK (fulfillment IN ('comp_slip', 'coupon', 'none'));

NOTIFY pgrst, 'reload schema';

COMMIT;
