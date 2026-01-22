-- =====================================================
-- Migration: ADR-029 Interaction Event Taxonomy - Enum & Extension
-- Created: 2026-01-21 14:55:00
-- ADR Reference: docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-029/EXEC-SPEC-029.md
-- Workstream: WS1-A
-- Purpose: Create interaction_event_type enum for Player 360 timeline
-- =====================================================

BEGIN;

-- ============================================================================
-- Verify uuid-ossp extension for uuid_generate_v5 (used in RPC for event IDs)
-- ============================================================================
-- uuid-ossp is pre-installed in Supabase, but we verify access to uuid_generate_v5

DO $$
BEGIN
  -- Test that uuid_generate_v5 is available in extensions schema (Supabase standard)
  PERFORM extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'test');
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'uuid-ossp extension required: extensions.uuid_generate_v5 not available';
END $$;

-- ============================================================================
-- Create interaction_event_type enum
-- ============================================================================
-- Canonical classification of all player-relevant events for the unified timeline.
-- Phase 1 MVP: 10 event types from 6 source tables
-- Phase 2: 12 additional event types
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interaction_event_type') THEN
    CREATE TYPE interaction_event_type AS ENUM (
      -- Session & Presence
      'visit_start',           -- Player checked in (visit created)
      'visit_end',             -- Player checked out (visit closed)
      'visit_resume',          -- Same-day visit resumed (ADR-026)

      -- Gaming Activity
      'rating_start',          -- Rating slip opened
      'rating_pause',          -- Rating slip paused
      'rating_resume',         -- Rating slip resumed from pause
      'rating_close',          -- Rating slip closed (final duration)

      -- Financial
      'cash_in',               -- Money in (buy-in)
      'cash_out',              -- Money out (cashout)
      'cash_observation',      -- Pit observation (telemetry)
      'financial_adjustment',  -- Correction to financial record

      -- Loyalty & Rewards
      'points_earned',         -- Base accrual or promotion credit
      'points_redeemed',       -- Comp issuance (debit)
      'points_adjusted',       -- Manual credit/adjustment
      'promo_issued',          -- Promotional coupon issued
      'promo_redeemed',        -- Promotional coupon redeemed

      -- Staff Interactions
      'note_added',            -- Staff note recorded
      'tag_applied',           -- Player flag/tag applied
      'tag_removed',           -- Player flag/tag removed

      -- Compliance
      'mtl_recorded',          -- MTL entry logged
      -- NOTE: CTR threshold alerts are NOT timeline events; they are computed
      --       aggregates displayed in compliance panel (see ADR-029 D8)

      -- Identity & Enrollment
      'player_enrolled',       -- Player enrolled at casino
      'identity_verified'      -- ID document verified
    );
  END IF;
END $$;

COMMENT ON TYPE interaction_event_type IS
  'ADR-029: Canonical classification of player interactions for the Player 360 timeline. '
  'Phase 1 MVP includes: visit_start, visit_end, rating_start, rating_close, cash_in, cash_out, '
  'points_earned, points_redeemed, mtl_recorded. Owned by CasinoService (global enum, additive only).';

COMMIT;
