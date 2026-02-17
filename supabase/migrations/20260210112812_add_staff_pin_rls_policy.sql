-- ============================================================================
-- Migration: Allow staff to update their own pin_hash (column-restricted)
-- Created: 20260210112812
-- ADR-030 D4 compliant: Template 2b (session vars required, no JWT fallback)
-- Purpose: Self-service PIN setup for lock screen
-- Column restriction: authenticated can only UPDATE pin_hash on staff
-- Precedent: staff_invite token_hash column-level hardening (PRD-025)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RLS Policy: row-level gating (self-only, same casino, active)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY staff_update_own_pin
  ON staff
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND status = 'active'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );

COMMENT ON POLICY staff_update_own_pin ON staff IS
  'Allow staff to update their own row (pin_hash only via column-level grant). ADR-030 D4 Template 2b.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Column-Level Privilege Hardening
--
-- RLS policies control row access, not column access. Without column-level
-- restriction, a staff member matching staff_update_own_pin could UPDATE
-- their own role, status, casino_id, etc. — privilege escalation vector.
--
-- Admin staff writes use service_role client (services/casino/crud.ts),
-- which bypasses both RLS and column grants. The existing staff_update
-- admin-only policy remains as defense-in-depth but is not functionally
-- affected by this REVOKE.
--
-- Precedent: staff_invite.token_hash hardening (PRD-025 migration).
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.staff FROM authenticated;
GRANT UPDATE (pin_hash) ON public.staff TO authenticated;

NOTIFY pgrst, 'reload schema';
