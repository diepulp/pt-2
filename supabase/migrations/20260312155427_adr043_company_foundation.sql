-- ============================================================================
-- Migration: ADR-043 — Dual-Boundary Tenancy Phase 1: Company Foundation
-- Created: 2026-03-12 15:54:27
-- PRD Reference: docs/10-prd/PRD-050-dual-boundary-tenancy-p1.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-050-dual-boundary-tenancy-p1.md
-- ADR References: ADR-043 (D1-D6), ADR-024 (INV-8), ADR-030 (fail-closed),
--                 ADR-015 (pooler-safe SET LOCAL)
-- Markers: ADR-043, ADR-024, ADR-030, ADR-015
--
-- Purpose:
--   1. Backfill company rows for casinos with NULL company_id
--   2. Harden FK: CASCADE → RESTRICT
--   3. Enforce NOT NULL on casino.company_id
--   4. Amend set_rls_context_from_staff() — add company_id to RETURNS TABLE + derivation
--   5. Amend rpc_bootstrap_casino() — auto-create company before casino
--   6. PostgREST schema reload
--
-- Security:
--   - No RLS policy references app.company_id (SEC_NOTE M7 — Phase 1 is plumbing only)
--   - No p_company_id parameter on any RPC (ADR-024 INV-8)
--   - Context derivation fail-closed: all checks BEFORE any set_config()
--   - REVOKE/GRANT re-emitted after DROP + CREATE of set_rls_context_from_staff()
-- ============================================================================

-- ==========================================================================
-- 1. Backfill company rows (ADR-043 Decision D4: 1:1 synthetic ownership)
--
-- For each casino with NULL company_id, create a company row using the
-- casino's name, then link them. WHERE company_id IS NULL guard prevents
-- duplicate company creation for already-linked casinos.
--
-- CAVEAT: The resulting company.name is a PROVISIONAL PLACEHOLDER copied
-- from casino.name — it is NOT the canonical business/legal name of the
-- operating company. A future admin normalization workflow (Phase 2+) will
-- allow operators to set the real company name. Do not treat these
-- backfilled names as authoritative business identity. (ADR-043 D4)
-- ==========================================================================

DO $$
DECLARE
  r RECORD;
  v_company_id uuid;
BEGIN
  FOR r IN SELECT id, name FROM casino WHERE company_id IS NULL
  LOOP
    INSERT INTO company (name) VALUES (r.name)
    RETURNING id INTO v_company_id;

    UPDATE casino SET company_id = v_company_id WHERE id = r.id;
  END LOOP;
END $$;

-- ==========================================================================
-- 2. Harden FK: CASCADE → RESTRICT (ADR-043 Decision D3)
--
-- Prevents accidental deletion of a company that still has casinos.
-- Forward-fix only — reverting to CASCADE is NOT a routine rollback.
-- ==========================================================================

ALTER TABLE casino DROP CONSTRAINT casino_company_id_fkey;
ALTER TABLE casino ADD CONSTRAINT casino_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT;

-- ==========================================================================
-- 3. Enforce NOT NULL on casino.company_id
--
-- After backfill, every casino row has a company_id. Lock the column.
-- ==========================================================================

ALTER TABLE casino ALTER COLUMN company_id SET NOT NULL;

-- ==========================================================================
-- 4. Amend set_rls_context_from_staff()
--
-- CRITICAL: CREATE OR REPLACE cannot change RETURNS TABLE signature.
-- Must DROP + CREATE to add company_id to the return type.
-- Re-emit REVOKE/GRANT after DROP + CREATE to restore security posture.
--
-- Changes:
--   - RETURNS TABLE adds company_id uuid
--   - Derivation query JOINs company table
--   - v_company_id derived and validated
--   - Fail-closed: ALL checks BEFORE any set_config() (ADR-030)
--   - app.company_id set via SET LOCAL (ADR-015, pooler-safe)
-- ==========================================================================

-- VERIFIED_SAFE: DROP+CREATE required because CREATE OR REPLACE cannot change
-- RETURNS TABLE signature (adding company_id uuid). REVOKE/GRANT re-emitted
-- immediately after CREATE. ADR-024 context derivation preserved and extended.
DROP FUNCTION IF EXISTS public.set_rls_context_from_staff(text);

CREATE FUNCTION public.set_rls_context_from_staff(p_correlation_id text DEFAULT NULL::text)
  RETURNS TABLE(actor_id uuid, casino_id uuid, staff_role text, company_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_staff_id uuid;
  v_casino_id uuid;
  v_role text;
  v_company_id uuid;
  v_correlation_id text;
BEGIN
  -- Guard correlation_id for log safety
  IF p_correlation_id IS NOT NULL THEN
    v_correlation_id := regexp_replace(p_correlation_id, '[^a-zA-Z0-9:_\-\.]+', '', 'g');
    v_correlation_id := left(v_correlation_id, 64);
  END IF;

  -- Derive staff_id from JWT (authoritative, not spoofable)
  v_staff_id := NULLIF((auth.jwt() -> 'app_metadata' ->> 'staff_id'), '')::uuid;

  IF v_staff_id IS NULL THEN
    -- Fallback: map auth.uid() to staff.user_id
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  ELSE
    -- Bind staff_id claim to auth.uid() to prevent mis-issued token escalation
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.id = v_staff_id
        AND s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive casino_id, role, and company_id (authoritative, not spoofable)
  -- ADR-043: JOIN company to derive company_id
  -- GAP-4 preserved: JOIN casino to validate casino.status = 'active'
  SELECT s.casino_id, s.role::text, co.id
  INTO v_casino_id, v_role, v_company_id
  FROM public.staff s
  JOIN public.casino c ON c.id = s.casino_id
  JOIN public.company co ON co.id = c.company_id
  WHERE s.id = v_staff_id
    AND s.status = 'active'
    AND s.casino_id IS NOT NULL
    AND c.status = 'active';

  -- Fail-closed: ALL checks BEFORE any set_config() — no partial context (ADR-030)
  IF v_casino_id IS NULL OR v_role IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: staff not active, not casino-scoped, or casino deactivated'
      USING ERRCODE = 'P0001';
  END IF;

  -- Transaction-local context (pooler-safe SET LOCAL — ADR-015)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_role, true);
  PERFORM set_config('app.company_id', v_company_id::text, true);

  IF v_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', v_correlation_id, true);
  END IF;

  -- Return the derived context to the caller (ADR-030 D1: TOCTOU elimination)
  actor_id   := v_staff_id;
  casino_id  := v_casino_id;
  staff_role := v_role;
  company_id := v_company_id;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.set_rls_context_from_staff(text) IS
  'ADR-024 + ADR-030 + ADR-043: Authoritative context derivation from JWT + staff table. '
  'RETURNS TABLE for TOCTOU elimination. Derives company_id via casino→company JOIN (ADR-043). '
  'GAP-4: validates casino.status = active. Fail-closed: no partial context on derivation failure.';

-- Re-emit security grants after DROP + CREATE
REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_rls_context_from_staff(text) TO authenticated;

-- ==========================================================================
-- 5. Amend rpc_bootstrap_casino()
--
-- Signature unchanged — use CREATE OR REPLACE.
-- Changes:
--   - Auto-create company row before casino INSERT (ADR-043 Decision C)
--   - Casino INSERT includes company_id
--   - Audit log payload includes company_id
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.rpc_bootstrap_casino(
  p_casino_name text,
  p_timezone text DEFAULT 'America/Los_Angeles',
  p_gaming_day_start time DEFAULT '06:00'
)
RETURNS TABLE (casino_id uuid, staff_id uuid, staff_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id    uuid;
  v_casino_id  uuid;
  v_staff_id   uuid;
  v_company_id uuid;
  v_existing   uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- AUTH CHECK — reject anonymous callers
  -- ═══════════════════════════════════════════════════════════════════════
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENCY CHECK — user must not already have an active staff binding
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT s.id INTO v_existing
  FROM public.staff s
  WHERE s.user_id = v_user_id
    AND s.status = 'active';

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: user already has staff binding'
      USING ERRCODE = '23505';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ATOMIC TENANT CREATION — company + casino + settings + staff
  -- ADR-043 Decision C: auto-create company (1:1 synthetic ownership)
  -- ═══════════════════════════════════════════════════════════════════════

  -- 0. Create company (ADR-043 D4: auto-create, 1:1 synthetic ownership)
  -- company.name = p_casino_name is a PROVISIONAL PLACEHOLDER, not canonical
  -- business identity. Future admin workflow normalizes company names.
  INSERT INTO public.company (name)
  VALUES (p_casino_name)
  RETURNING id INTO v_company_id;

  -- 1. Create casino (now with company_id — NOT NULL enforced)
  INSERT INTO public.casino (name, status, company_id)
  VALUES (p_casino_name, 'active', v_company_id)
  RETURNING id INTO v_casino_id;

  -- 2. Create casino_settings (other columns have defaults)
  INSERT INTO public.casino_settings (casino_id, timezone, gaming_day_start_time)
  VALUES (v_casino_id, p_timezone, p_gaming_day_start);

  -- 3. Create admin staff binding (user_id = auth.uid() = auth.users.id, Option A)
  INSERT INTO public.staff (casino_id, user_id, role, status, first_name, last_name)
  VALUES (v_casino_id, v_user_id, 'admin', 'active', 'Admin', 'User')
  RETURNING id INTO v_staff_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AUDIT LOG — tenant_bootstrap event (same transaction for atomicity)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'casino',
    v_staff_id,
    'tenant_bootstrap',
    jsonb_build_object(
      'casino_id', v_casino_id,
      'company_id', v_company_id,
      'staff_id', v_staff_id,
      'user_id', v_user_id,
      'casino_name', p_casino_name
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — caller uses this to call syncUserRLSClaims() at TS layer
  -- ═══════════════════════════════════════════════════════════════════════
  casino_id  := v_casino_id;
  staff_id   := v_staff_id;
  staff_role := 'admin';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_bootstrap_casino(text, text, time) IS
  'PRD-025 + ADR-043: Atomic tenant bootstrap — creates company + casino + casino_settings + admin staff binding. '
  'SECURITY DEFINER, does NOT call set_rls_context_from_staff() (no staff binding exists yet). '
  'Uses auth.uid() directly (Identity Model Option A). INV-8 compliant (no casino_id/actor_id params). '
  'ADR-043: auto-creates company row with 1:1 synthetic ownership.';

-- ==========================================================================
-- 6. PostgREST Schema Reload
-- ==========================================================================

NOTIFY pgrst, 'reload schema';
