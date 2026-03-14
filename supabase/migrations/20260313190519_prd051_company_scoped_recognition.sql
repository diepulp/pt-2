-- ============================================================================
-- Migration: PRD-051 Company-Scoped Recognition + Entitlement
-- Description: Dual-mode SELECT policies + 3 SECURITY DEFINER RPCs for cross-property recognition
-- Reference: ADR-044, ADR-015, ADR-024, ADR-030
-- RLS_REVIEW_COMPLETE: Dual-mode SELECT policies reviewed against ADR-015 hybrid pattern
-- Created: 2026-03-13
-- ADR Reference: docs/80-adrs/ADR-044-cross-property-recognition-entitlement.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-051-cross-property-recognition-entitlement.md
-- Purpose:
--   1. Dual-mode SELECT policies on player_casino + player_loyalty (ADR-044 D2)
--   2. rpc_lookup_player_company (D4) — recognition + entitlement surface
--   3. rpc_activate_player_locally (D3) — local enrollment + loyalty init
--   4. rpc_redeem_loyalty_locally (D6) — atomic local balance debit
-- Security:
--   - All RPCs call set_rls_context_from_staff() (ADR-024 INV-7)
--   - No client-supplied casino_id/actor_id (ADR-024 INV-8)
--   - loyalty_ledger writes use session vars only (ADR-030 D4)
--   - SECURITY DEFINER RPCs bypass RLS — company-scoping via WHERE clauses
-- ============================================================================

-- ============================================================================
-- 0. ENUM EXTENSION
-- ============================================================================

-- Add 'redemption' to loyalty_reason for cross-property redemption tracking
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'redemption';

-- ============================================================================
-- 1. DUAL-MODE SELECT POLICIES (ADR-044 D2)
-- Only player_casino and player_loyalty get company-scoped reads.
-- Write policies remain UNCHANGED (casino-scoped).
-- ============================================================================

-- --- player_casino: replace casino-only SELECT with dual-mode ---
DROP POLICY IF EXISTS player_casino_select_same_casino ON player_casino;

CREATE POLICY player_casino_select_company ON player_casino
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND (
      -- Path 1: Same casino (existing behavior, unchanged)
      casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
      OR
      -- Path 2: Same company (NEW — cross-property visibility)
      (
        NULLIF((select current_setting('app.company_id', true)), '')::uuid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM casino c
          WHERE c.id = player_casino.casino_id
          AND c.company_id = NULLIF((select current_setting('app.company_id', true)), '')::uuid
        )
      )
    )
  );

COMMENT ON POLICY player_casino_select_company ON player_casino IS
  'ADR-044 D2: Dual-mode SELECT. Path 1 = same casino (Pattern C). Path 2 = same company (fail-closed on app.company_id). Write policies unchanged.';

-- --- player_loyalty: replace casino-only SELECT with dual-mode ---
DROP POLICY IF EXISTS player_loyalty_select ON player_loyalty;

CREATE POLICY player_loyalty_select_company ON player_loyalty
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND (
      -- Path 1: Same casino (existing behavior, unchanged)
      casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
      OR
      -- Path 2: Same company (NEW — cross-property visibility)
      (
        NULLIF((select current_setting('app.company_id', true)), '')::uuid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM casino c
          WHERE c.id = player_loyalty.casino_id
          AND c.company_id = NULLIF((select current_setting('app.company_id', true)), '')::uuid
        )
      )
    )
  );

COMMENT ON POLICY player_loyalty_select_company ON player_loyalty IS
  'ADR-044 D2: Dual-mode SELECT. Path 1 = same casino (Pattern C). Path 2 = same company (fail-closed on app.company_id). Write policies unchanged.';


-- ============================================================================
-- 2. rpc_lookup_player_company (ADR-044 D4)
-- Recognition + entitlement summary RPC.
-- SECURITY DEFINER — bypasses RLS, implements company-scoping in WHERE clauses.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_lookup_player_company(
  p_search_term text
)
RETURNS TABLE (
  player_id              uuid,
  full_name              text,
  birth_date             date,
  enrolled_casinos       jsonb,
  loyalty_entitlement    jsonb,
  active_locally         boolean,
  last_company_visit     timestamptz,
  has_sister_exclusions  boolean,
  max_exclusion_severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id   uuid;
  v_company_id  uuid;
  v_actor_id    uuid;
  v_staff_role  text;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024 INV-7)
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_company_id := NULLIF(current_setting('app.company_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 2: Validate context
  -- ═══════════════════════════════════════════════════════════════════
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient role for company lookup';
  END IF;

  -- Input validation
  IF p_search_term IS NULL OR length(trim(p_search_term)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: search term must be at least 2 characters';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 3: CTE-based recognition query
  -- Company-scoping via WHERE clauses (SECURITY DEFINER bypasses RLS)
  -- ═══════════════════════════════════════════════════════════════════
  RETURN QUERY
  WITH
    -- Find matching players (global search — player table has no casino_id)
    matched_players AS (
      SELECT
        p.id,
        p.first_name || ' ' || p.last_name AS computed_full_name,
        p.birth_date AS p_birth_date
      FROM player p
      WHERE lower(p.first_name || ' ' || p.last_name) ILIKE '%' || lower(trim(p_search_term)) || '%'
      ORDER BY p.last_name, p.first_name
      LIMIT 50
    ),

    -- Filter to players enrolled within the caller's company
    -- (only players with at least one enrollment at a company casino)
    company_enrollments AS (
      SELECT
        mp.id AS p_id,
        mp.computed_full_name,
        mp.p_birth_date,
        pc.casino_id AS enrolled_casino_id,
        pc.status AS enrollment_status,
        pc.enrolled_at,
        c.name AS casino_name
      FROM matched_players mp
      JOIN player_casino pc ON pc.player_id = mp.id
      JOIN casino c ON c.id = pc.casino_id
      WHERE
        -- Company-scoped: only casinos in the caller's company
        CASE
          WHEN v_company_id IS NOT NULL THEN c.company_id = v_company_id
          ELSE c.id = v_casino_id  -- single-casino fallback
        END
    ),

    -- Aggregate enrolled_casinos JSON per player
    enrollment_agg AS (
      SELECT
        ce.p_id,
        jsonb_agg(
          jsonb_build_object(
            'casino_id', ce.enrolled_casino_id,
            'casino_name', ce.casino_name,
            'status', ce.enrollment_status,
            'enrolled_at', ce.enrolled_at
          )
          ORDER BY ce.enrolled_at
        ) AS enrolled_casinos_json
      FROM company_enrollments ce
      GROUP BY ce.p_id
    ),

    -- Loyalty entitlement per player (company-scoped)
    loyalty_agg AS (
      SELECT
        pl.player_id AS p_id,
        -- Portfolio total: SUM across all company properties
        SUM(pl.current_balance) AS portfolio_total,
        -- Per-property breakdown
        jsonb_agg(
          jsonb_build_object(
            'casino_id', pl.casino_id,
            'casino_name', c.name,
            'balance', pl.current_balance,
            'tier', pl.tier
          )
          ORDER BY c.name
        ) AS properties_json,
        -- Local balance (at caller's casino, may be NULL if not enrolled locally)
        MAX(CASE WHEN pl.casino_id = v_casino_id THEN pl.current_balance END) AS local_balance,
        MAX(CASE WHEN pl.casino_id = v_casino_id THEN pl.tier END) AS local_tier
      FROM player_loyalty pl
      JOIN casino c ON c.id = pl.casino_id
      WHERE
        CASE
          WHEN v_company_id IS NOT NULL THEN c.company_id = v_company_id
          ELSE c.id = v_casino_id
        END
      GROUP BY pl.player_id
    ),

    -- Last company visit (Tier 2 scalar extraction — inside SECURITY DEFINER)
    last_visit AS (
      SELECT
        v.player_id AS p_id,
        MAX(v.started_at) AS last_visit_ts
      FROM visit v
      JOIN casino c ON c.id = v.casino_id
      WHERE
        CASE
          WHEN v_company_id IS NOT NULL THEN c.company_id = v_company_id
          ELSE c.id = v_casino_id
        END
      GROUP BY v.player_id
    )

  -- Final assembly
  SELECT
    mp.id                                                AS player_id,
    mp.computed_full_name                                AS full_name,
    mp.p_birth_date                                      AS birth_date,
    COALESCE(ea.enrolled_casinos_json, '[]'::jsonb)      AS enrolled_casinos,
    -- D7 hybrid loyalty surface
    jsonb_build_object(
      'portfolio_total', COALESCE(la.portfolio_total, 0),
      'local_balance', COALESCE(la.local_balance, 0),
      'local_tier', la.local_tier,
      'redeemable_here', COALESCE(la.local_balance, 0),
      'properties', COALESCE(la.properties_json, '[]'::jsonb)
    )                                                    AS loyalty_entitlement,
    -- Active locally: enrolled at caller's casino
    EXISTS (
      SELECT 1 FROM player_casino pc2
      WHERE pc2.player_id = mp.id
      AND pc2.casino_id = v_casino_id
    )                                                    AS active_locally,
    lv.last_visit_ts                                     AS last_company_visit,
    -- Slice 1 stubs — populated by WS6 after player-exclusion merge
    NULL::boolean                                        AS has_sister_exclusions,
    NULL::text                                           AS max_exclusion_severity
  FROM (SELECT DISTINCT p_id, computed_full_name, p_birth_date FROM company_enrollments) mp(id, computed_full_name, p_birth_date)
  LEFT JOIN enrollment_agg ea ON ea.p_id = mp.id
  LEFT JOIN loyalty_agg la ON la.p_id = mp.id
  LEFT JOIN last_visit lv ON lv.p_id = mp.id
  ORDER BY mp.computed_full_name;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 4: Audit event
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'recognition',
    v_actor_id,
    'company_lookup',
    jsonb_build_object(
      'search_term', p_search_term,
      'company_id', v_company_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_lookup_player_company(text) IS
  'ADR-044 D4: Company-scoped player recognition + entitlement surface. SECURITY DEFINER — bypasses RLS, implements company-scoping in WHERE clauses.';

-- Privileges
REVOKE ALL ON FUNCTION public.rpc_lookup_player_company(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_lookup_player_company(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_lookup_player_company(text) TO authenticated;


-- ============================================================================
-- 3. rpc_activate_player_locally (ADR-044 D3)
-- Creates player_casino + player_loyalty at caller's casino. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_activate_player_locally(
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id   uuid;
  v_company_id  uuid;
  v_actor_id    uuid;
  v_staff_role  text;
  v_activated   boolean := false;
  v_already     boolean := false;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024 INV-7)
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_company_id := NULLIF(current_setting('app.company_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 2: Validate context
  -- ═══════════════════════════════════════════════════════════════════
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient role for local activation';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 3: Validate player exists within company boundary
  -- ═══════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1
    FROM player_casino pc
    JOIN casino c ON c.id = pc.casino_id
    WHERE pc.player_id = p_player_id
    AND (
      CASE
        WHEN v_company_id IS NOT NULL THEN c.company_id = v_company_id
        ELSE c.id = v_casino_id
      END
    )
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: player not found within company boundary';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 4: Check if already enrolled locally
  -- ═══════════════════════════════════════════════════════════════════
  IF EXISTS (
    SELECT 1 FROM player_casino
    WHERE player_id = p_player_id AND casino_id = v_casino_id
  ) THEN
    v_already := true;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 5: Create player_casino + player_loyalty (idempotent)
  -- PK (player_id, casino_id) guarantees ON CONFLICT safety
  -- ═══════════════════════════════════════════════════════════════════
  IF NOT v_already THEN
    INSERT INTO player_casino (player_id, casino_id, status, enrolled_at)
    VALUES (p_player_id, v_casino_id, 'active', now())
    ON CONFLICT (player_id, casino_id) DO NOTHING;

    INSERT INTO player_loyalty (player_id, casino_id, current_balance, tier)
    VALUES (p_player_id, v_casino_id, 0, NULL)
    ON CONFLICT (player_id, casino_id) DO NOTHING;

    v_activated := true;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 6: Audit event
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'recognition',
    v_actor_id,
    'local_activation',
    jsonb_build_object(
      'player_id', p_player_id,
      'activated', v_activated,
      'already_enrolled', v_already,
      'company_id', v_company_id
    )
  );

  RETURN jsonb_build_object(
    'activated', v_activated,
    'already_enrolled', v_already
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_activate_player_locally(uuid) IS
  'ADR-044 D3: Local activation — creates player_casino + player_loyalty at caller''s casino. Idempotent via ON CONFLICT DO NOTHING on PK.';

-- Privileges
REVOKE ALL ON FUNCTION public.rpc_activate_player_locally(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_activate_player_locally(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_player_locally(uuid) TO authenticated;


-- ============================================================================
-- 4. rpc_redeem_loyalty_locally (ADR-044 D6)
-- Atomic local balance debit with balance guard.
-- loyalty_ledger is a critical table — session vars set by context injection.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_redeem_loyalty_locally(
  p_player_id uuid,
  p_amount    integer,
  p_reason    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id    uuid;
  v_company_id   uuid;
  v_actor_id     uuid;
  v_staff_role   text;
  v_rows         integer;
  v_new_balance  integer;
  v_portfolio    integer;
  v_ledger_id    uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024 INV-7)
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_company_id := NULLIF(current_setting('app.company_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 2: Validate context
  -- ═══════════════════════════════════════════════════════════════════
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient role for loyalty redemption';
  END IF;

  -- Input validation
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: amount must be a positive integer';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: reason is required';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 3: Validate player enrolled at caller's casino
  -- ═══════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM player_casino
    WHERE player_id = p_player_id AND casino_id = v_casino_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: player not enrolled at this casino';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 4: Atomic debit with balance guard (ADR-044 D6)
  -- No negative balances, no partial debits.
  -- Concurrent safety: UPDATE ... WHERE balance >= p_amount is the
  -- optimistic guard. Each casino debits only its own row.
  -- ═══════════════════════════════════════════════════════════════════
  UPDATE player_loyalty
  SET
    current_balance = current_balance - p_amount,
    updated_at = now()
  WHERE player_id = p_player_id
    AND casino_id = v_casino_id
    AND current_balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: local balance insufficient for redemption of % points', p_amount;
  END IF;

  -- Read updated local balance
  SELECT current_balance INTO v_new_balance
  FROM player_loyalty
  WHERE player_id = p_player_id AND casino_id = v_casino_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 5: Create local loyalty_ledger entry (casino-scoped write)
  -- loyalty_ledger is a critical table (ADR-030 D4)
  -- Session vars already set by set_rls_context_from_staff()
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    staff_id,
    points_delta,
    reason,
    idempotency_key
  )
  VALUES (
    v_casino_id,
    p_player_id,
    v_actor_id,
    -p_amount,          -- negative for redemption
    'redemption',       -- new enum value
    gen_random_uuid()  -- unique per redemption (uuid type)
  )
  RETURNING id INTO v_ledger_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 6: Compute portfolio total (SUM across company properties)
  -- ═══════════════════════════════════════════════════════════════════
  SELECT COALESCE(SUM(pl.current_balance), 0) INTO v_portfolio
  FROM player_loyalty pl
  JOIN casino c ON c.id = pl.casino_id
  WHERE pl.player_id = p_player_id
  AND (
    CASE
      WHEN v_company_id IS NOT NULL THEN c.company_id = v_company_id
      ELSE c.id = v_casino_id
    END
  );

  -- ═══════════════════════════════════════════════════════════════════
  -- STEP 7: Audit event
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'recognition',
    v_actor_id,
    'loyalty_redemption',
    jsonb_build_object(
      'player_id', p_player_id,
      'amount', p_amount,
      'reason', p_reason,
      'new_local_balance', v_new_balance,
      'portfolio_total', v_portfolio,
      'ledger_id', v_ledger_id,
      'company_id', v_company_id
    )
  );

  RETURN jsonb_build_object(
    'redeemed', true,
    'amount', p_amount,
    'local_balance', v_new_balance,
    'portfolio_total', v_portfolio,
    'redeemable_here', v_new_balance,
    'ledger_id', v_ledger_id
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_redeem_loyalty_locally(uuid, integer, text) IS
  'ADR-044 D6: Atomic local loyalty redemption. Debits local player_loyalty row only. Balance guard prevents negative balances. loyalty_ledger write is casino-scoped (ADR-030 D4 compliant).';

-- Privileges
REVOKE ALL ON FUNCTION public.rpc_redeem_loyalty_locally(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem_loyalty_locally(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_loyalty_locally(uuid, integer, text) TO authenticated;


-- ============================================================================
-- 5. INDEX VERIFICATION
-- casino.company_id index already exists (20251220161147)
-- Trigram index ix_player_name_trgm already exists (20251129230733)
-- ============================================================================

-- Verify (idempotent, no-op if exists)
CREATE INDEX IF NOT EXISTS idx_casino_company_id ON casino (company_id);


-- ============================================================================
-- 6. SCHEMA RELOAD
-- ============================================================================

NOTIFY pgrst, 'reload schema';
