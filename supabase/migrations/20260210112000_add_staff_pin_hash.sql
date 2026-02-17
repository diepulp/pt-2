-- ============================================================================
-- Migration: Add pin_hash column to staff table for lock screen PIN
-- Created: 20260210112000
-- Gap Reference: docs/issues/gaps/GAP-SIGN-OUT-IMPLEMENTATION.md
-- Purpose: Store bcrypt-hashed PIN for lock screen re-authentication
-- Bounded Context: CasinoService (SRM v4.11.1 — owns staff table)
-- ============================================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_hash text;

COMMENT ON COLUMN staff.pin_hash IS
  'Bcrypt hash of 4-6 digit PIN for lock screen re-authentication. NULL = PIN not yet set.';

NOTIFY pgrst, 'reload schema';
