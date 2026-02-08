-- ============================================================================
-- Migration: PRD-025 WS3 — rpc_create_staff_invite + rpc_accept_staff_invite
-- Created: 2026-02-01 17:32:37
-- PRD Reference: docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-025/EXECUTION-SPEC-PRD-025.md
-- ADR References: ADR-024 (INV-7, INV-8), ADR-018 (SECURITY DEFINER),
--                 ADR-030 (D1, D2 claims lifecycle)
-- Markers: ADR-024, ADR-030
-- Depends on: 20260201173235_prd025_staff_invite_company_rls.sql (WS1)
--
-- Purpose:
--   1. rpc_create_staff_invite — admin creates invite with hashed token
--   2. rpc_accept_staff_invite — invitee validates token, creates staff binding
-- ============================================================================

-- ==========================================================================
-- 1. rpc_create_staff_invite (SECURITY DEFINER)
--
-- Admin-only. Calls set_rls_context_from_staff() for context (INV-7).
-- Generates 32 random bytes, returns hex-encoded token once.
-- Stores SHA-256 hash — raw token never persisted.
-- No p_casino_id / p_actor_id parameters (INV-8).
-- ==========================================================================

CREATE FUNCTION public.rpc_create_staff_invite(
  p_email text,
  p_role  staff_role,
  p_ttl_hours integer DEFAULT NULL
)
RETURNS TABLE (invite_id uuid, raw_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_raw_bytes  bytea;
  v_raw_token  text;
  v_token_hash text;
  v_email      text;
  v_ttl_hours  integer;
  v_invite_id  uuid;
  v_expires_at timestamptz;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (INV-7: all client-callable RPCs must call this)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADMIN ROLE CHECK — only admins can create invites
  -- ═══════════════════════════════════════════════════════════════════════
  IF NULLIF(current_setting('app.staff_role', true), '') != 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive context (authoritative, not from parameters — INV-8)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  -- ═══════════════════════════════════════════════════════════════════════
  -- TOKEN GENERATION — 32 random bytes, SHA-256 hashed for storage
  -- ═══════════════════════════════════════════════════════════════════════

  -- Generate 32 cryptographically random bytes (256 bits of entropy)
  v_raw_bytes  := extensions.gen_random_bytes(32);
  -- Hex-encode for return to caller (64-char lowercase hex string)
  v_raw_token  := encode(v_raw_bytes, 'hex');
  -- Hash the raw BYTES (not hex string) with SHA-256 for storage
  v_token_hash := encode(extensions.digest(v_raw_bytes, 'sha256'), 'hex');

  -- ═══════════════════════════════════════════════════════════════════════
  -- EMAIL NORMALIZATION + TTL
  -- ═══════════════════════════════════════════════════════════════════════
  v_email     := lower(trim(p_email));
  v_ttl_hours := COALESCE(
    p_ttl_hours,
    NULLIF(current_setting('app.staff_invite_ttl_hours', true), '')::integer,
    72
  );

  IF v_ttl_hours <= 0 THEN
    v_ttl_hours := 72;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT INVITE — handle unique constraint violation (partial index)
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.staff_invite (
      casino_id, email, staff_role, token_hash, expires_at, created_by
    ) VALUES (
      v_casino_id,
      v_email,
      p_role,
      v_token_hash,
      now() + (v_ttl_hours || ' hours')::interval,
      v_actor_id
    )
    RETURNING id, staff_invite.expires_at
    INTO v_invite_id, v_expires_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CONFLICT: active invite already exists for this email'
      USING ERRCODE = '23505';
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AUDIT LOG — staff_invite_created event
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'casino',
    v_actor_id,
    'staff_invite_created',
    jsonb_build_object(
      'invite_id', v_invite_id,
      'email', v_email,
      'role', p_role::text,
      'ttl_hours', v_ttl_hours
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — raw token returned exactly once, never persisted
  -- ═══════════════════════════════════════════════════════════════════════
  invite_id  := v_invite_id;
  raw_token  := v_raw_token;
  expires_at := v_expires_at;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_create_staff_invite(text, staff_role, integer) IS
  'PRD-025: Create staff invite with hashed token. Admin-only via set_rls_context_from_staff() (INV-7). '
  'Returns raw token once (64-char hex). SHA-256 hash stored. INV-8 compliant (no casino_id/actor_id params).';

-- Grants: only authenticated (not anon)
REVOKE ALL ON FUNCTION public.rpc_create_staff_invite(text, staff_role, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_staff_invite(text, staff_role, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_staff_invite(text, staff_role, integer) TO authenticated;


-- ==========================================================================
-- 2. rpc_accept_staff_invite (SECURITY DEFINER)
--
-- Does NOT call set_rls_context_from_staff() — accepting user may not have
-- a staff binding yet (INV-7 exception, documented).
-- Uses auth.uid() directly (Identity Model Option A).
-- No p_casino_id / p_actor_id parameters (INV-8).
-- ==========================================================================

CREATE FUNCTION public.rpc_accept_staff_invite(
  p_token text
)
RETURNS TABLE (staff_id uuid, casino_id uuid, staff_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id      uuid;
  v_token_hash   text;
  v_invite       record;
  v_staff_id     uuid;
  v_existing     uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- AUTH CHECK — reject anonymous callers
  -- Does NOT call set_rls_context_from_staff() (INV-7 exception:
  -- accepting user may not have staff binding yet)
  -- ═══════════════════════════════════════════════════════════════════════
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- TOKEN FORMAT VALIDATION — must be exactly 64 lowercase hex chars
  -- Pre-validates before decode() to avoid leaking raw Postgres errors
  -- (e.g., "invalid hexadecimal data") on malformed input.
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'NOT_FOUND: invalid invite token'
      USING ERRCODE = 'P0002';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- TOKEN HASH — hash the raw bytes (decoded from hex) with SHA-256
  -- ═══════════════════════════════════════════════════════════════════════
  v_token_hash := encode(
    extensions.digest(decode(p_token, 'hex'), 'sha256'),
    'hex'
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- INVITE LOOKUP — SELECT ... FOR UPDATE to prevent race conditions
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT si.id, si.casino_id, si.staff_role, si.expires_at, si.accepted_at
  INTO v_invite
  FROM public.staff_invite si
  WHERE si.token_hash = v_token_hash
  FOR UPDATE;

  -- Invite must exist
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: invalid invite token'
      USING ERRCODE = 'P0002';
  END IF;

  -- Invite must not already be accepted
  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: invite already accepted'
      USING ERRCODE = '23505';
  END IF;

  -- Invite must not be expired
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'GONE: invite has expired'
      USING ERRCODE = 'P0003';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- USER BINDING CHECK — user must not already have an active staff binding
  -- Uses auth.uid() = auth.users.id (Identity Model Option A)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT s.id INTO v_existing
  FROM public.staff s
  WHERE s.user_id = v_user_id
    AND s.status = 'active';

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: user already has active staff binding'
      USING ERRCODE = '23505';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CREATE STAFF BINDING — role and casino from invite
  -- user_id = auth.uid() = auth.users.id (Option A, FK to auth.users)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.staff (casino_id, user_id, role, status, first_name, last_name)
  VALUES (v_invite.casino_id, v_user_id, v_invite.staff_role, 'active', 'Invited', 'Staff')
  RETURNING id INTO v_staff_id;

  -- Mark invite as accepted
  UPDATE public.staff_invite
  SET accepted_at = now()
  WHERE id = v_invite.id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AUDIT LOG — staff_invite_accepted event
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_invite.casino_id,
    'casino',
    v_staff_id,
    'staff_invite_accepted',
    jsonb_build_object(
      'invite_id', v_invite.id,
      'staff_id', v_staff_id,
      'user_id', v_user_id,
      'role', v_invite.staff_role::text
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- RETURN — caller uses this to call syncUserRLSClaims() at TS layer
  -- ═══════════════════════════════════════════════════════════════════════
  staff_id   := v_staff_id;
  casino_id  := v_invite.casino_id;
  staff_role := v_invite.staff_role::text;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_accept_staff_invite(text) IS
  'PRD-025: Accept staff invite — validates token hash, creates staff binding. '
  'SECURITY DEFINER, does NOT call set_rls_context_from_staff() (INV-7 exception: no staff binding yet). '
  'Uses auth.uid() directly (Identity Model Option A). INV-8 compliant.';

-- Grants: only authenticated (not anon)
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_accept_staff_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_accept_staff_invite(text) TO authenticated;

-- ==========================================================================
-- 3. PostgREST Schema Reload
-- ==========================================================================

NOTIFY pgrst, 'reload schema';
