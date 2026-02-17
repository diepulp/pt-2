-- ============================================================================
-- Migration: PRD-030 WS1 — Setup Completion RPC + Label Normalization
-- Created: 2026-02-11
-- PRD Reference: docs/10-prd/PRD-030-setup-wizard-v0.md
-- EXEC-SPEC: docs/20-architecture/specs/PRD-030/EXECUTION-SPEC-PRD-030.md
-- ADR References: ADR-024 (INV-8, no spoofable params), ADR-018 (SECURITY DEFINER),
--                 ADR-015 (SET LOCAL pooler-safe), ADR-030 (session-var best practice)
-- Bounded Contexts: CasinoService (casino_settings), TableContextService (gaming_table)
--
-- Purpose:
--   1. Add setup_completed_by column to casino_settings (audit trail)
--   2. Add label_normalized generated column to gaming_table (case/whitespace-safe uniqueness)
--   3. Add unique index on gaming_table(casino_id, label_normalized) with duplicate guard
--   4. Create rpc_complete_casino_setup — idempotent setup completion for admin role
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add setup_completed_by to casino_settings
-- ============================================================================
-- Tracks which admin staff member completed the setup wizard.
-- Nullable because existing rows were backfilled without this info.
-- ============================================================================

ALTER TABLE casino_settings
  ADD COLUMN IF NOT EXISTS setup_completed_by uuid REFERENCES staff(id);

COMMENT ON COLUMN casino_settings.setup_completed_by IS
  'PRD-030: Staff who completed casino setup wizard. Nullable for pre-existing casinos.';

-- ============================================================================
-- STEP 2: Add label_normalized generated column to gaming_table
-- ============================================================================
-- Case-insensitive, whitespace-normalized label for uniqueness enforcement.
-- lower(trim(regexp_replace(label, '\s+', ' ', 'g')))
--   - Collapses multi-spaces to single space
--   - Trims leading/trailing whitespace
--   - Lowercases for case-insensitive comparison
-- ============================================================================

ALTER TABLE gaming_table
  ADD COLUMN IF NOT EXISTS label_normalized text
    GENERATED ALWAYS AS (lower(trim(regexp_replace(label, '\s+', ' ', 'g')))) STORED;

COMMENT ON COLUMN gaming_table.label_normalized IS
  'PRD-030: Case/whitespace-normalized label for uniqueness. '
  'Generated: lower(trim(regexp_replace(label, \\s+, '' '', ''g''))). '
  'Used by unique index (casino_id, label_normalized) to prevent duplicate table labels.';

-- ============================================================================
-- STEP 3: Fail-fast duplicate check before creating unique index
-- ============================================================================
-- If pre-existing data has duplicate normalized labels within a casino,
-- the index creation would fail with a cryptic error. Instead, we detect
-- duplicates explicitly and raise an actionable error message.
-- ============================================================================

DO $$
DECLARE
  v_dup_count integer;
  v_dup_details text;
BEGIN
  SELECT count(*), string_agg(
    format('casino_id=%s label="%s" count=%s',
      sub.casino_id, sub.label_normalized, sub.cnt),
    '; '
  )
  INTO v_dup_count, v_dup_details
  FROM (
    SELECT casino_id, label_normalized, count(*) AS cnt
    FROM gaming_table
    GROUP BY casino_id, label_normalized
    HAVING count(*) > 1
  ) sub;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'PRD-030 MIGRATION BLOCKED: % duplicate label group(s) found in gaming_table. '
      'Manual dedup required before unique index can be created. Duplicates: %',
      v_dup_count, v_dup_details
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ============================================================================
-- STEP 4: Create unique index on (casino_id, label_normalized)
-- ============================================================================
-- Ensures no two tables in the same casino can have labels that differ only
-- in case or whitespace. e.g. "BJ-01" and "bj-01" conflict, not duplicate.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_gaming_table_casino_label_normalized
  ON gaming_table (casino_id, label_normalized);

-- ============================================================================
-- STEP 5: Create rpc_complete_casino_setup
-- ============================================================================
-- SECURITY DEFINER RPC that idempotently marks casino setup as complete.
--
-- ADR-024 compliant: No p_casino_id or p_actor_id parameters.
-- Context derived via set_rls_context_from_staff().
-- Only admin role is allowed (canonical Enums.staff_role).
-- Transitions from any non-ready state (future-proof).
-- Returns success (idempotent) if already ready.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_complete_casino_setup(
  p_skip boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id  uuid;
  v_actor_id   uuid;
  v_staff_role text;
  v_status     text;
  v_at         timestamptz;
  v_by         uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 1: Context injection (ADR-024, ADR-018)
  -- Derives casino_id, actor_id, staff_role from JWT + staff table
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 2: Read derived context from session variables
  -- ═══════════════════════════════════════════════════════════════════════
  v_casino_id  := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 3: Role authorization — admin only
  -- Canonical Enums.staff_role: dealer, pit_boss, cashier, admin
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: role not allowed'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 4: Precondition — at least 1 gaming table (unless skip)
  -- ═══════════════════════════════════════════════════════════════════════
  IF NOT p_skip THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.gaming_table
      WHERE casino_id = v_casino_id
    ) THEN
      RAISE EXCEPTION 'PRECONDITION_FAILED: no gaming tables configured for this casino'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 5: Fetch current setup state
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT cs.setup_status, cs.setup_completed_at, cs.setup_completed_by
  INTO v_status, v_at, v_by
  FROM public.casino_settings cs
  WHERE cs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: casino_settings row missing for casino %', v_casino_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 6: Idempotent check — already complete
  -- Returns stored values (no now() drift)
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_status = 'ready' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'casino_id', v_casino_id,
      'setup_status', v_status,
      'setup_completed_at', v_at,
      'setup_completed_by', v_by
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 7: Transition to ready (from any non-ready state — future-proof)
  -- Uses RETURNING to capture stored values (no now() drift)
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.casino_settings
  SET setup_status       = 'ready',
      setup_completed_at = now(),
      setup_completed_by = v_actor_id
  WHERE casino_id = v_casino_id
    AND setup_status != 'ready'
  RETURNING setup_status, setup_completed_at, setup_completed_by
  INTO v_status, v_at, v_by;

  RETURN jsonb_build_object(
    'ok', true,
    'casino_id', v_casino_id,
    'setup_status', v_status,
    'setup_completed_at', v_at,
    'setup_completed_by', v_by
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_complete_casino_setup(boolean) IS
  'PRD-030: Idempotent casino setup completion. SECURITY DEFINER, admin-only. '
  'Derives context from set_rls_context_from_staff() (ADR-024 INV-8). '
  'Transitions from any non-ready state. Returns success if already ready.';

-- ============================================================================
-- STEP 6: Grants
-- ============================================================================

REVOKE ALL ON FUNCTION public.rpc_complete_casino_setup(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_complete_casino_setup(boolean) TO authenticated;

-- ============================================================================
-- STEP 7: PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
