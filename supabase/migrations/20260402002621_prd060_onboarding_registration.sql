-- ============================================================================
-- Migration: PRD-060 — Onboarding Registration Table
-- Created: 2026-04-02 00:26:21
-- PRD Reference: docs/10-prd/PRD-060-company-registration-bootstrap.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
-- ADR References: ADR-024 (INV-8, no client-carried company_id),
--                 ADR-018 (SECURITY DEFINER governance),
--                 ADR-030 (fail-closed posture)
--
-- Purpose:
--   Create onboarding_registration table for the company registration step
--   that precedes first-property bootstrap. This table tracks pending and
--   consumed registration records per user.
--
-- Security:
--   - RLS enabled, deny-by-default
--   - SELECT policy: user can see own pending registrations only
--   - No INSERT/UPDATE/DELETE policies (all mutations via SECURITY DEFINER RPCs)
--   - REVOKE ALL, GRANT SELECT to authenticated
--   - No casino_id column — pre-tenancy exception (user has no staff binding yet)
--   - user_id references auth.users(id) — not staff.id
-- ============================================================================

-- ==========================================================================
-- 1. Create onboarding_registration table
-- ==========================================================================

CREATE TABLE public.onboarding_registration (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id),
  company_id uuid        NOT NULL REFERENCES public.company(id),
  status     text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

-- Partial unique index: enforce at most one pending registration per user
CREATE UNIQUE INDEX uq_onboarding_registration_pending
  ON public.onboarding_registration (user_id)
  WHERE status = 'pending';

-- ==========================================================================
-- 2. Enable RLS — deny-by-default
-- ==========================================================================

ALTER TABLE public.onboarding_registration ENABLE ROW LEVEL SECURITY;

-- SELECT policy: user can see own pending registrations only
-- No casino_id scoping — pre-tenancy exception (user has no staff binding yet)
CREATE POLICY "onboarding_registration_select_own_pending"
  ON public.onboarding_registration
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND status = 'pending'
  );

-- No INSERT/UPDATE/DELETE policies — all mutations via SECURITY DEFINER RPCs
-- (rpc_register_company, rpc_bootstrap_casino)

-- ==========================================================================
-- 3. Grants — deny-by-default, then grant SELECT only
-- ==========================================================================

REVOKE ALL ON public.onboarding_registration FROM PUBLIC;
REVOKE ALL ON public.onboarding_registration FROM anon;
GRANT SELECT ON public.onboarding_registration TO authenticated;

-- ==========================================================================
-- 4. PostgREST Schema Reload
-- ==========================================================================

NOTIFY pgrst, 'reload schema';
