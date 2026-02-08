-- ============================================================================
-- Migration: PRD-025 WS1 — staff_invite Table + Company RLS Lockdown
-- Created: 2026-02-01 17:32:35
-- PRD Reference: docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-025/EXECUTION-SPEC-PRD-025.md
-- ADR References: ADR-030 (Template 2b session-var-only), ADR-024 (INV-8)
-- Markers: ADR-030, RLS_REVIEW_COMPLETE
--
-- Purpose:
--   1. Create staff_invite table for invite-based staff onboarding
--   2. Enable RLS on staff_invite with admin-only, session-var-only policies
--      (Template 2b — PII tightening: no JWT fallback on SELECT/INSERT/UPDATE)
--   3. Column-level REVOKE on token_hash (defense-in-depth)
--   4. Company table RLS lockdown (deny-by-default — no permissive policies)
-- ============================================================================

-- ==========================================================================
-- 1. staff_invite Table DDL
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.staff_invite (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id   uuid        NOT NULL REFERENCES public.casino(id),
  email       text        NOT NULL,
  staff_role  staff_role  NOT NULL,
  token_hash  text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  created_by  uuid        NOT NULL REFERENCES public.staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_invite IS
  'PRD-025: Invite-based staff onboarding. Token stored as SHA-256 hash (raw token never persisted). '
  'RLS: admin-only, casino-scoped, Template 2b session-var-only for all operations (PII tightening).';

-- ==========================================================================
-- 2. Unique Partial Index — one active invite per casino + email
-- ==========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invite_active
  ON public.staff_invite (casino_id, lower(email))
  WHERE accepted_at IS NULL;

COMMENT ON INDEX idx_staff_invite_active IS
  'PRD-025: Enforce one active (non-accepted) invite per casino+email pair. '
  'Normalizes email to lowercase for case-insensitive dedup.';

-- ==========================================================================
-- 3. staff_invite RLS — Enable + Template 2b Session-Var-Only Policies
--
-- Security rationale (deviates from ADR-030 D4 SELECT default):
--   staff_invite contains PII (staff emails) and operational metadata.
--   Using session-var-only for SELECT eliminates the stale-JWT window
--   (up to 3600s per config.toml) where a demoted admin could still
--   read invites via cached app_metadata.staff_role = 'admin' JWT claim.
--   This is safe because:
--     (1) staff_invite is a new table with no existing queries to break
--     (2) all authenticated requests go through withRLS → set_rls_context_from_staff()
--     (3) INSERT/UPDATE already require session vars — making SELECT consistent
-- ==========================================================================

ALTER TABLE public.staff_invite ENABLE ROW LEVEL SECURITY;

-- SELECT: admin-only, session-var-only (Template 2b — PII tightening)
CREATE POLICY staff_invite_select_admin_session
  ON public.staff_invite
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND NULLIF(current_setting('app.staff_role', true), '') = 'admin'
  );

-- INSERT: admin-only, session-var-only (Template 2b)
CREATE POLICY staff_invite_insert_admin_session
  ON public.staff_invite
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND NULLIF(current_setting('app.staff_role', true), '') = 'admin'
  );

-- UPDATE: admin-only, session-var-only (Template 2b + WITH CHECK)
CREATE POLICY staff_invite_update_admin_session
  ON public.staff_invite
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND NULLIF(current_setting('app.staff_role', true), '') = 'admin'
  )
  WITH CHECK (
    casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  );

-- No DELETE policy — invites are never deleted, only accepted or expired.

-- ==========================================================================
-- 4. Column-Level Privilege Hardening — token_hash
--
-- Postgres column-level REVOKE requires removing the table-level SELECT
-- first, then granting SELECT on individual columns (excluding token_hash).
-- SECURITY DEFINER RPCs (rpc_accept_staff_invite) still have access
-- because they run as the function owner (postgres), not authenticated.
--
-- Defense-in-depth: prevent "creative querying" of token hashes via
-- Supabase REST API even though SHA-256 of random bytes is not reversible.
-- ==========================================================================

REVOKE SELECT ON public.staff_invite FROM authenticated;
GRANT SELECT (id, casino_id, email, staff_role, expires_at, accepted_at, created_by, created_at)
  ON public.staff_invite TO authenticated;

-- ==========================================================================
-- 5. Company Table RLS Lockdown — Deny-by-Default
--
-- Company is metadata (not a security boundary in PT-2's model).
-- No app-layer queries read company directly. Locking it down:
--   - DROP any pre-existing permissive policies (clean slate)
--   - ENABLE RLS
--   - Add NO new permissive policies → authenticated role gets 0 rows
--   - Only service_role and SECURITY DEFINER RPCs can access
-- ==========================================================================

-- Explicit cleanup: drop any pre-existing permissive policies on company
-- so lockdown doesn't depend on the past being perfectly clean.
DO $$ DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'company' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.company', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role = deny-by-default.
-- Only service_role and SECURITY DEFINER RPCs can access.

COMMENT ON TABLE public.company IS
  'PRD-025: Company is metadata, not a security boundary. '
  'RLS enabled with deny-by-default (no permissive policies for authenticated role). '
  'Access restricted to service_role and SECURITY DEFINER RPCs.';

-- ==========================================================================
-- 6. PostgREST Schema Reload
-- ==========================================================================

NOTIFY pgrst, 'reload schema';
