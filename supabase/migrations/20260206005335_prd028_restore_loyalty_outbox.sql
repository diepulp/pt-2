-- ============================================================================
-- Migration: PRD-028 Restore loyalty_outbox Table (P0 Bug Fix)
-- Created: 2026-02-06
-- PRD Reference: docs/10-prd/PRD-028-loyalty-outbox-restore.md
-- ADR Reference: ADR-033 (hard dependency for Flow B)
-- Purpose: Recreate loyalty_outbox dropped in 20251213003000 greenfield reset.
--          Three promo RPCs (20260106235611) INSERT into this table.
-- Owner: LoyaltyService
-- ============================================================================

-- ============================================================================
-- PREFLIGHT: Assert FK targets exist (fail fast on broken migration ordering)
-- ============================================================================
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'casino' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: public.casino does not exist — migration ordering is broken';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'loyalty_ledger' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: public.loyalty_ledger does not exist — migration ordering is broken';
  END IF;
END
$preflight$;

-- ============================================================================
-- SCHEMA: Restore loyalty_outbox (exact contract for promo RPCs)
-- ============================================================================
-- Ensure clean slate — table was dropped in 20251213003000, but guard against
-- any partial/stale recreation that would be silently accepted by IF NOT EXISTS
DROP TABLE IF EXISTS public.loyalty_outbox CASCADE;

CREATE TABLE public.loyalty_outbox (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id     uuid           NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  ledger_id     uuid           REFERENCES public.loyalty_ledger(id) ON DELETE CASCADE,  -- nullable for promo events
  event_type    text           NOT NULL,
  payload       jsonb          NOT NULL,
  created_at    timestamptz    NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempt_count int            NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.loyalty_outbox IS
  'PRD-028: Event outbox for loyalty domain side effects. Append-only audit trail. '
  'Promo RPCs write 4-column subset (casino_id, event_type, payload, created_at); '
  'remaining columns resolve via defaults. LoyaltyService-owned.';

-- ============================================================================
-- OWNERSHIP ASSERTION: Validates RLS bypass analysis
-- The promo RPCs are SECURITY DEFINER (run as their definer = postgres).
-- RLS does not apply to the table owner unless FORCE ROW LEVEL SECURITY is set.
-- This assertion confirms the table owner matches the migration runner role.
-- ============================================================================
DO $owner_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'loyalty_outbox' AND tableowner = current_user
  ) THEN
    RAISE EXCEPTION 'OWNER CHECK FAILED: loyalty_outbox is not owned by %, RLS bypass analysis may be invalid', current_user;
  END IF;
END
$owner_check$;

-- ============================================================================
-- RLS POLICIES: Casino-scoped access (Pattern C hybrid, ADR-015/ADR-020)
-- loyalty_outbox is NOT an ADR-030 critical table — COALESCE fallback is permitted.
-- ============================================================================

-- [1/6] Activate RLS
ALTER TABLE public.loyalty_outbox ENABLE ROW LEVEL SECURITY;

-- [2/6] Casino-scoped SELECT — Pattern C hybrid predicate (gates authenticated/INVOKER reads)
CREATE POLICY loyalty_outbox_select ON public.loyalty_outbox
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- [3/6] Casino-scoped INSERT — same Pattern C predicate (defense-in-depth for future INVOKER writes;
--        promo RPCs run as postgres/table-owner and are exempt from RLS — see ownership assertion above)
CREATE POLICY loyalty_outbox_insert ON public.loyalty_outbox
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ============================================================================
-- APPEND-ONLY ENFORCEMENT (belt-and-suspenders, two independent layers)
--
-- Why both layers:
--   Layer 1 (REVOKE): Removes UPDATE/DELETE privilege from authenticated/anon roles.
--     This is the hard guarantee — privilege checks run BEFORE RLS evaluation.
--     Protects against: any code path using authenticated or anon role.
--     Does NOT protect: postgres (table owner), service_role, or any role
--     granted UPDATE/DELETE in the future by a careless GRANT.
--
--   Layer 2 (denial policies): RLS policies that evaluate to false.
--     Protects against: any role that somehow retains or is granted UPDATE/DELETE
--     privilege in the future (e.g., a new role, an accidental GRANT).
--     Does NOT protect: postgres/table-owner (exempt from RLS, see ownership assertion).
--
--   Neither layer protects postgres — that is by-convention for admin operations.
--   Together they ensure no application-level role can mutate outbox rows even if
--   one layer is misconfigured (privilege re-granted or RLS force-enabled changes).
-- ============================================================================

-- [4/6] Layer 1: Privilege revocation (checked before RLS, not bypassable via SET config)
REVOKE UPDATE, DELETE ON public.loyalty_outbox FROM authenticated, anon;

-- [5/6] Layer 2: Denial policy — catches future roles with UPDATE privilege
-- NOTE: auth.uid() IS NOT NULL prefix is functionally redundant (false is false),
-- but kept for SEC-006 pattern consistency across all PT-2 denial policies.
CREATE POLICY loyalty_outbox_no_updates ON public.loyalty_outbox
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

-- [6/6] Layer 2: Denial policy — catches future roles with DELETE privilege (same note)
CREATE POLICY loyalty_outbox_no_deletes ON public.loyalty_outbox
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- ============================================================================
-- INDEX: Partial index for unprocessed rows (future consumer optimization)
-- Uses IF NOT EXISTS intentionally — indexes don't affect RPC INSERT contract,
-- and idempotent index creation is safe on a freshly-created table.
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_loyalty_outbox_unprocessed
  ON public.loyalty_outbox (casino_id, created_at DESC)
  WHERE processed_at IS NULL;

-- ============================================================================
-- PostgREST schema reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';
