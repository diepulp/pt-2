-- =====================================================
-- Migration: Add accrual_kind discriminator column to rating_slip
-- Created: 2025-12-27 17:18:05
-- Issue: ISSUE-752833A6 (WS2)
-- Purpose: Add explicit discriminator for loyalty vs compliance-only slips
--          per ADR-014 Ghost Gaming Visits
-- Reference: ADR-014, ADR-019, EXECUTION-SPEC WS2
-- =====================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Add accrual_kind column with inline CHECK constraint
-- Default to 'loyalty' for existing rows (backward compatible)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rating_slip
ADD COLUMN accrual_kind text NOT NULL DEFAULT 'loyalty'
CHECK (accrual_kind IN ('loyalty', 'compliance_only'));

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Backfill existing rows with NULL/missing policy_snapshot.loyalty
-- Mark them as 'compliance_only' BEFORE adding the conditional constraint
-- This prevents CHECK constraint violations on existing bad data
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE rating_slip
SET accrual_kind = 'compliance_only'
WHERE policy_snapshot IS NULL
   OR NOT (policy_snapshot ? 'loyalty');

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Add conditional CHECK constraint
-- NOTE: Must explicitly check IS NOT NULL because Postgres CHECK passes on NULL
--
-- Logic: If accrual_kind = 'loyalty', then policy_snapshot MUST:
--   1. Be NOT NULL
--   2. Contain 'loyalty' key
-- If accrual_kind = 'compliance_only', no constraint on policy_snapshot
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rating_slip
ADD CONSTRAINT chk_policy_snapshot_if_loyalty
CHECK (
  accrual_kind != 'loyalty' OR (policy_snapshot IS NOT NULL AND policy_snapshot ? 'loyalty')
);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Add column comment explaining ADR-014 purpose
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN rating_slip.accrual_kind IS
  'ADR-014: Explicit discriminator. "loyalty" requires policy_snapshot.loyalty for accrual. "compliance_only" is for ghost gaming (MTL/finance tracking only, no loyalty points).';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Update rpc_start_rating_slip to set accrual_kind based on visit_kind
--
-- Logic:
--   - Look up visit.visit_kind for the given p_visit_id
--   - If visit_kind = 'gaming_ghost_unrated' → accrual_kind = 'compliance_only'
--   - Else → accrual_kind = 'loyalty'
--   - For 'compliance_only' slips, policy_snapshot is still populated for
--     potential future use, but accrual is skipped at close time
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_result rating_slip;
  v_player_id UUID;
  v_visit_kind visit_kind;
  v_accrual_kind text;
  v_policy_snapshot JSONB;
  v_game_settings_lookup RECORD;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════

  -- Validate visit is open and get player_id + visit_kind for processing
  SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
  FROM visit
  WHERE id = p_visit_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- DETERMINE ACCRUAL_KIND (ADR-014 Ghost Gaming Support)
  -- Ghost visits (gaming_ghost_unrated) are compliance-only, no loyalty
  -- ═══════════════════════════════════════════════════════════════════════
  v_accrual_kind := CASE
    WHEN v_visit_kind = 'gaming_ghost_unrated' THEN 'compliance_only'
    ELSE 'loyalty'
  END;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD POLICY_SNAPSHOT (ISSUE-752833A6 Fix, ADR-019 D2)
  -- ═══════════════════════════════════════════════════════════════════════
  -- TABLE-AUTHORITATIVE: game_settings table is canonical source
  -- p_game_settings is for runtime state (average_bet), NOT policy values
  -- Priority: 1) game_settings table, 2) hardcoded defaults
  --
  -- For compliance_only slips: Still build snapshot for potential future use,
  -- but accrual is skipped by rpc_accrue_on_close based on accrual_kind
  -- ═══════════════════════════════════════════════════════════════════════

  -- Lookup from game_settings table via gaming_table.type (AUTHORITATIVE)
  SELECT gs.house_edge, gs.decisions_per_hour, gs.points_conversion_rate, gs.point_multiplier
  INTO v_game_settings_lookup
  FROM gaming_table gt
  LEFT JOIN game_settings gs
    ON gs.game_type = gt.type
    AND gs.casino_id = gt.casino_id
  WHERE gt.id = p_table_id
    AND gt.casino_id = p_casino_id;

  -- Build snapshot from canonical sources only (NO p_game_settings for policy)
  v_policy_snapshot := jsonb_build_object(
    'loyalty', jsonb_build_object(
      'house_edge', COALESCE(v_game_settings_lookup.house_edge, 1.5),
      'decisions_per_hour', COALESCE(v_game_settings_lookup.decisions_per_hour, 70),
      'points_conversion_rate', COALESCE(v_game_settings_lookup.points_conversion_rate, 10.0),
      'point_multiplier', COALESCE(v_game_settings_lookup.point_multiplier, 1.0),
      'policy_version', 'loyalty_points_v1'
    ),
    '_source', jsonb_build_object(
      'house_edge', CASE WHEN v_game_settings_lookup.house_edge IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'decisions_per_hour', CASE WHEN v_game_settings_lookup.decisions_per_hour IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'points_conversion_rate', CASE WHEN v_game_settings_lookup.points_conversion_rate IS NOT NULL THEN 'game_settings' ELSE 'default' END,
      'point_multiplier', CASE WHEN v_game_settings_lookup.point_multiplier IS NOT NULL THEN 'game_settings' ELSE 'default' END
    )
  );
  -- ═══════════════════════════════════════════════════════════════════════

  -- Create slip with policy_snapshot and accrual_kind (ISSUE-752833A6 + ADR-014)
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id,
    seat_number, game_settings, policy_snapshot, accrual_kind, status, start_time
  )
  VALUES (
    p_casino_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, v_policy_snapshot, v_accrual_kind, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log with policy source tracking and accrual_kind
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'visit_id', p_visit_id,
      'player_id', v_player_id,
      'table_id', p_table_id,
      'visit_kind', v_visit_kind,
      'accrual_kind', v_accrual_kind,
      'policy_snapshot_populated', true,
      'policy_snapshot_source', v_policy_snapshot->'_source',
      'policy_values', v_policy_snapshot->'loyalty'
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_start_rating_slip(UUID, UUID, UUID, TEXT, JSONB, UUID) IS
  'Creates new rating slip for active visit/table. SEC-007 hardened with Template 5 context validation. ISSUE-752833A6: Populates policy_snapshot.loyalty from game_settings (ADR-019 D2). ADR-014: Sets accrual_kind based on visit_kind (ghost visits are compliance_only).';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: Update rpc_accrue_on_close to skip compliance_only slips
-- This is the "shift left" defense - accrual is skipped, not failed
-- ═══════════════════════════════════════════════════════════════════════════

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
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_caller_role text;
  v_slip record;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_base_points int;
  v_existing_entry record;
  v_balance_after int;
  v_player_loyalty_exists boolean;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  PERFORM set_rls_context(
    COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    ),
    p_casino_id,
    v_context_staff_role
  );
  -- =======================================================================

  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (SEC-001)
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id is required)';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

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
  -- IDEMPOTENCY: Check for existing entry (business uniqueness)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_existing_entry
  FROM loyalty_ledger
  WHERE casino_id = p_casino_id
    AND rating_slip_id = p_rating_slip_id
    AND reason = 'base_accrual';

  IF FOUND THEN
    SELECT current_balance INTO v_balance_after
    FROM player_loyalty
    WHERE player_id = v_existing_entry.player_id AND casino_id = p_casino_id;

    RETURN QUERY SELECT
      v_existing_entry.id,
      v_existing_entry.points_delta,
      (v_existing_entry.metadata->'calc'->>'theo')::numeric,
      COALESCE(v_balance_after, 0),
      true;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUSINESS LOGIC: Fetch rating slip and validate
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_FOUND: Rating slip % not found', p_rating_slip_id;
  END IF;

  IF v_slip.status != 'closed' THEN
    RAISE EXCEPTION 'LOYALTY_SLIP_NOT_CLOSED: Base accrual requires status=closed (current: %)', v_slip.status;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-014: Skip accrual for compliance_only slips (ghost gaming)
  -- Return zero points instead of failing - this is the correct behavior
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_slip.accrual_kind = 'compliance_only' THEN
    -- No-op for compliance-only slips: return zeros without creating ledger entry
    RETURN QUERY SELECT
      NULL::uuid,     -- no ledger_id
      0::int,         -- zero points
      0::numeric,     -- zero theo
      0::int,         -- balance unchanged (or would need lookup)
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
  v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);

  -- HARDENED: Apply NULLIF pattern to points_conversion_rate extraction
  v_base_points := ROUND(v_theo * COALESCE(
    NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
    10.0
  ));

  IF v_base_points < 0 THEN
    v_base_points := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT LEDGER ENTRY (RLS enforced: casino_id + role check)
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO loyalty_ledger (
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
    v_slip.player_id,
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
  RETURNING id INTO ledger_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE PLAYER BALANCE (upsert pattern)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS(
    SELECT 1 FROM player_loyalty
    WHERE player_id = v_slip.player_id AND casino_id = p_casino_id
  ) INTO v_player_loyalty_exists;

  IF v_player_loyalty_exists THEN
    UPDATE player_loyalty
    SET current_balance = current_balance + v_base_points,
        updated_at = now()
    WHERE player_id = v_slip.player_id
      AND casino_id = p_casino_id
    RETURNING current_balance INTO v_balance_after;
  ELSE
    INSERT INTO player_loyalty (
      player_id,
      casino_id,
      current_balance,
      tier,
      preferences,
      updated_at
    ) VALUES (
      v_slip.player_id,
      p_casino_id,
      v_base_points,
      NULL,
      '{}',
      now()
    )
    RETURNING current_balance INTO v_balance_after;
  END IF;

  RETURN QUERY SELECT ledger_id, v_base_points, v_theo, v_balance_after, false;
END;
$$;

COMMENT ON FUNCTION rpc_accrue_on_close IS
  'Base accrual RPC: Mints points on rating slip close using deterministic theo calculation from policy_snapshot.loyalty. SECURITY INVOKER with role gate (pit_boss, admin). Idempotent via business uniqueness (one per slip). ADR-014: Skips accrual for compliance_only slips (ghost gaming). ADR-015 Phase 1A: Self-injects RLS context. ISSUE-752833A6: Hardened JSON extraction with NULLIF pattern.';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 7: Add index for accrual_kind queries (filtering loyalty vs compliance)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS ix_rating_slip_accrual_kind
  ON rating_slip (casino_id, accrual_kind, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY POSTGREST TO RELOAD SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Verify accrual_kind column exists:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'rating_slip' AND column_name = 'accrual_kind';
--
-- Verify CHECK constraint:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'rating_slip'::regclass AND conname LIKE 'chk_%';
--
-- Verify backfill worked (should be 0):
-- SELECT COUNT(*) FROM rating_slip
-- WHERE accrual_kind = 'loyalty'
--   AND (policy_snapshot IS NULL OR NOT (policy_snapshot ? 'loyalty'));
--
-- Test CHECK constraint rejection:
-- INSERT INTO rating_slip (casino_id, visit_id, table_id, accrual_kind, policy_snapshot, status, start_time)
-- VALUES ('uuid', 'uuid', 'uuid', 'loyalty', NULL, 'open', now());
-- -- Expected: ERROR: new row violates check constraint "chk_policy_snapshot_if_loyalty"
--
