-- ============================================================================
-- Migration: P0 Blockers for Loyalty Ledger Instantiation Gap (ISSUE-B5894ED8)
-- ============================================================================
-- This migration completes the P0 remediation by:
--   1. Backfilling missing player_loyalty rows
--   2. Adding FK constraint player_loyalty → player_casino
--   3. Removing lazy-create from rpc_accrue_on_close (hard-fail pattern)
--
-- Prerequisites:
--   - player_casino has PK (player_id, casino_id) - verified
--   - rpc_create_player already creates player_loyalty atomically
--
-- ADR References:
--   - ADR-019: Loyalty points policy (enrollment provisions loyalty)
--   - ADR-015: RLS connection pooling (Pattern C hybrid)
--
-- Related:
--   - docs/issues/loyalty-ledger/B5894ED8_P0-PRODUCTION-GATE_LOYALTY-LEDGER-INSTANTIATION.md
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Backfill missing player_loyalty rows
-- ============================================================================
-- Source of truth: player_casino (enrolled players)
-- Any enrolled player missing a loyalty account gets one with balance=0
-- Idempotent: Safe to re-run (INSERT only where NULL)
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  WITH inserted AS (
    INSERT INTO public.player_loyalty (player_id, casino_id, current_balance, tier, preferences, updated_at)
    SELECT
      pc.player_id,
      pc.casino_id,
      0,              -- Initial balance (ADR-019)
      NULL,           -- No tier yet
      '{}'::jsonb,    -- Empty preferences
      now()
    FROM public.player_casino pc
    LEFT JOIN public.player_loyalty pl
      ON pl.player_id = pc.player_id AND pl.casino_id = pc.casino_id
    WHERE pl.player_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  IF v_count > 0 THEN
    RAISE NOTICE 'ISSUE-B5894ED8: Backfilled % player_loyalty rows for enrolled players', v_count;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Enforce ledger idempotency constraints
-- ============================================================================
-- Enforces: one base accrual per rating slip per casino (partial)
-- Defense-in-depth: idempotency_key uniqueness for retry safety
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_base_accrual_uk
ON public.loyalty_ledger (casino_id, rating_slip_id)
WHERE reason = 'base_accrual';

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_uk
ON public.loyalty_ledger (casino_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- STEP 3: Add FK constraint player_loyalty → player_casino
-- ============================================================================
-- Enforces: loyalty cannot exist without enrollment
-- Lifecycle: Deleting player_casino cascades to player_loyalty
-- Prerequisite: player_casino has PK (player_id, casino_id) - verified
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_loyalty_player_casino_fk'
      AND conrelid = 'public.player_loyalty'::regclass
  ) THEN
    ALTER TABLE public.player_loyalty
    ADD CONSTRAINT player_loyalty_player_casino_fk
    FOREIGN KEY (player_id, casino_id)
    REFERENCES public.player_casino (player_id, casino_id)
    ON DELETE CASCADE
    NOT VALID;

    ALTER TABLE public.player_loyalty
    VALIDATE CONSTRAINT player_loyalty_player_casino_fk;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Replace rpc_accrue_on_close with hard-fail pattern
-- ============================================================================
-- REMOVES: Lazy-create INSERT branch (lines 231-247 in previous version)
-- ADDS: UPDATE + IF NOT FOUND → RAISE EXCEPTION
-- Pattern: No TOCTOU race - UPDATE first, then check FOUND
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_casino_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE (
  ledger_id uuid,
  points_delta int,
  theo numeric,
  balance_after int,
  is_existing boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_context_staff_role text;
  v_claim_casino_id uuid;
  v_caller_role text;
  v_slip record;
  v_player_id uuid;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- Validate claim BEFORE set_rls_context to avoid self-injection tautology.
  -- ═══════════════════════════════════════════════════════════════════════
  v_claim_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_claim_casino_id IS NULL THEN
    v_claim_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  IF v_claim_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context/JWT'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_casino_id != v_claim_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: param %, claim %', p_casino_id, v_claim_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    v_claim_casino_id,
    v_context_staff_role
  );
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Role validation (ADR-019)
  -- ═══════════════════════════════════════════════════════════════════════
  v_caller_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt()->'app_metadata'->>'staff_role')
  );

  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: Role % cannot mint base accrual', v_caller_role;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUSINESS LOGIC: Fetch rating slip and validate
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT rs.*, v.player_id
  INTO v_slip
  FROM public.rating_slip rs
  JOIN public.visit v ON v.id = rs.visit_id
  WHERE rs.id = p_rating_slip_id AND rs.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  -- Extract player_id from the joined result
  v_player_id := v_slip.player_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-014: Skip accrual for compliance_only slips (ghost gaming)
  -- Return zero points instead of failing - this is the correct behavior
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.accrual_kind = 'compliance_only' THEN
    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_player_id
      AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_player_id, p_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    -- No-op for compliance-only slips: return current balance without creating ledger entry
    RETURN QUERY SELECT
      NULL::uuid,     -- no ledger_id
      0::int,         -- zero points
      0::numeric,     -- zero theo
      v_balance_after, -- balance unchanged
      false;          -- not an existing entry, just skipped
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CANONICAL SOURCE: policy_snapshot.loyalty (ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

  IF v_loyalty_snapshot IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_SNAPSHOT_MISSING: Rating slip lacks policy_snapshot.loyalty';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DETERMINISTIC CALCULATION (ADR-019 D1)
  -- Uses hardened calculate_theo_from_snapshot with NULLIF pattern
  -- ═══════════════════════════════════════════════════════════════════════
  v_theo := public.calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  -- HARDENED: Apply NULLIF pattern to points_conversion_rate extraction
  v_base_points := ROUND(v_theo * COALESCE(
    NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
    10.0
  ))::int;

  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced: casino_id + role check)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    visit_id,
    points_delta,
    reason,
    idempotency_key,
    source_kind,
    source_id,
    metadata
  ) VALUES (
    p_casino_id,
    v_player_id,
    p_rating_slip_id,
    v_slip.visit_id,
    v_base_points,
    'base_accrual',
    p_idempotency_key,
    'rating_slip',
    p_rating_slip_id,
    jsonb_build_object(
      'calc', jsonb_build_object(
        'theo', v_theo,
        'base_points', v_base_points,
        'conversion_rate', COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0),
        'avg_bet', COALESCE(NULLIF(v_loyalty_snapshot->>'avg_bet', '')::numeric, v_slip.average_bet),
        'house_edge', COALESCE(NULLIF(v_loyalty_snapshot->>'house_edge', '')::numeric, 1.5),
        'duration_seconds', v_slip.duration_seconds,
        'decisions_per_hour', COALESCE(NULLIF(v_loyalty_snapshot->>'decisions_per_hour', '')::numeric, 70)
      ),
      'policy', jsonb_build_object(
        'snapshot_ref', 'rating_slip.policy_snapshot.loyalty',
        'version', v_loyalty_snapshot->>'policy_version'
      )
    )
  )
  ON CONFLICT (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual'
  DO NOTHING
  RETURNING id INTO ledger_id;

  IF NOT FOUND THEN
    SELECT * INTO v_existing_entry
    FROM public.loyalty_ledger
    WHERE casino_id = p_casino_id
      AND rating_slip_id = p_rating_slip_id
      AND reason = 'base_accrual';

    SELECT current_balance INTO v_balance_after
    FROM public.player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
        v_existing_entry.player_id, p_casino_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      v_balance_after,
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (ISSUE-B5894ED8: NO LAZY-CREATE)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Pattern: UPDATE first, then check FOUND (no TOCTOU race)
  -- If player_loyalty doesn't exist, enrollment invariant is broken → hard fail
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.player_loyalty
  SET current_balance = current_balance + v_base_points,
      updated_at = now()
  WHERE player_id = v_player_id
    AND casino_id = p_casino_id
  RETURNING current_balance INTO v_balance_after;

  IF NOT FOUND THEN
    -- Enrollment invariant broken: player_loyalty should exist from rpc_create_player
    RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%. Enrollment did not provision loyalty account.',
      v_player_id, p_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$$;

-- Update documentation
COMMENT ON FUNCTION rpc_accrue_on_close IS
  'Base accrual RPC: Mints points on rating slip close using deterministic theo calculation from policy_snapshot.loyalty. '
  'SECURITY INVOKER with role gate (pit_boss, admin). Idempotent via business uniqueness (one per slip). '
  'ADR-014: Skips accrual for compliance_only slips (ghost gaming). '
  'ADR-015 Phase 1A: Self-injects RLS context. '
  'ISSUE-752833A6: Fixed player_id lookup via visit table join. '
  'ISSUE-B5894ED8: REMOVED lazy-create; hard-fails if player_loyalty missing (enrollment invariant).';

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
