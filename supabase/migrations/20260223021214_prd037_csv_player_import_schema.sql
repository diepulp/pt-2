-- ============================================================================
-- Migration: PRD-037 CSV Player Import — Schema, RPCs, Indexes
-- Created: 2026-02-23
-- PRD Reference: docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-037-csv-player-import.md
-- ADR References: ADR-024 (authoritative context), ADR-018 (SECURITY DEFINER),
--                 ADR-030 (write-path session-var enforcement), ADR-036 (CSV import strategy)
-- Markers: ADR-024, ADR-030, ADR-018, ADR-036
--
-- Purpose:
--   Create staging tables (import_batch, import_row), enums, 3 SECURITY DEFINER
--   RPCs (create, stage, execute), and identifier resolution indexes for the
--   CSV Player Import pipeline. All RPCs derive context via
--   set_rls_context_from_staff() — no spoofable parameters (ADR-024 INV-8).
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE public.import_batch_status AS ENUM (
  'staging',
  'executing',
  'completed',
  'failed'
);

CREATE TYPE public.import_row_status AS ENUM (
  'staged',
  'created',
  'linked',
  'skipped',
  'conflict',
  'error'
);

-- ============================================================================
-- 2. TABLES
-- ============================================================================

CREATE TABLE public.import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id),
  idempotency_key text NOT NULL,
  status public.import_batch_status NOT NULL DEFAULT 'staging',
  file_name text NOT NULL,
  vendor_label text,
  column_mapping jsonb NOT NULL DEFAULT '{}',
  total_rows int NOT NULL DEFAULT 0,
  report_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_import_batch_idempotency UNIQUE (casino_id, idempotency_key)
);

CREATE TABLE public.import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batch(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  raw_row jsonb NOT NULL,
  normalized_payload jsonb NOT NULL,
  status public.import_row_status NOT NULL DEFAULT 'staged',
  reason_code text,
  reason_detail text,
  matched_player_id uuid REFERENCES public.player(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_import_row_batch_row UNIQUE (batch_id, row_number)
);

COMMENT ON TABLE public.import_batch IS 'PRD-037: CSV player import batch metadata. Owned by PlayerImportService.';
COMMENT ON TABLE public.import_row IS 'PRD-037: Individual rows staged for import within a batch. Owned by PlayerImportService.';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- Staging table indexes
CREATE INDEX IF NOT EXISTS idx_import_batch_casino_status
  ON public.import_batch (casino_id, status);

CREATE INDEX IF NOT EXISTS idx_import_row_batch_status
  ON public.import_row (batch_id, status);

-- Identifier resolution indexes (cross-context on player/player_casino)
-- Functional index for case-insensitive email matching
CREATE INDEX IF NOT EXISTS idx_player_email_lower
  ON public.player (lower(email));

-- Phone number index for identifier resolution
CREATE INDEX IF NOT EXISTS idx_player_phone_number
  ON public.player (phone_number)
  WHERE phone_number IS NOT NULL;

-- Composite index for casino-scoped player lookup via enrollment
CREATE INDEX IF NOT EXISTS idx_player_casino_composite
  ON public.player_casino (casino_id, player_id);

-- ============================================================================
-- 4. TRIGGER: updated_at on import_batch
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_import_batch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_import_batch_updated_at
  BEFORE UPDATE ON public.import_batch
  FOR EACH ROW
  EXECUTE FUNCTION public.set_import_batch_updated_at();

-- ============================================================================
-- 5. RPC: rpc_import_create_batch
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_create_batch(
  p_idempotency_key text,
  p_file_name text,
  p_vendor_label text DEFAULT NULL,
  p_column_mapping jsonb DEFAULT '{}'
)
RETURNS public.import_batch
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_batch public.import_batch;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7/INV-8)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Context must be present
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: admin and pit_boss only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'pit_boss') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot create import batches', v_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor context required
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name is required'
      USING ERRCODE = '22023';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IDEMPOTENT UPSERT: return existing batch on key match
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO public.import_batch (
    casino_id, created_by_staff_id, idempotency_key,
    file_name, vendor_label, column_mapping
  ) VALUES (
    v_casino_id, v_actor_id, p_idempotency_key,
    p_file_name, p_vendor_label, p_column_mapping
  )
  ON CONFLICT (casino_id, idempotency_key)
  DO NOTHING;

  -- Always return the batch (whether newly created or existing)
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE casino_id = v_casino_id
    AND idempotency_key = p_idempotency_key;

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_FOUND: failed to create or retrieve batch'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_batch;
END;
$$;

COMMENT ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb) IS
  'PRD-037: Create import batch or return existing on idempotency match. '
  'Derives casino_id/actor_id from context (ADR-024 INV-8). Role gate: admin, pit_boss.';

ALTER FUNCTION public.rpc_import_create_batch(text, text, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_create_batch(text, text, text, jsonb) TO authenticated;

-- ============================================================================
-- 6. RPC: rpc_import_stage_rows
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_stage_rows(
  p_batch_id uuid,
  p_rows jsonb
)
RETURNS public.import_batch
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_batch public.import_batch;
  v_new_row_count int;
  v_row jsonb;
  v_row_number int;
  v_raw_row jsonb;
  v_normalized jsonb;
  v_inserted_count int := 0;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7/INV-8)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: admin and pit_boss only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'pit_boss') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot stage import rows', v_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INPUT VALIDATION
  -- ═══════════════════════════════════════════════════════════════════════
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows array must not be empty'
      USING ERRCODE = '22023';
  END IF;

  v_new_row_count := jsonb_array_length(p_rows);

  -- ═══════════════════════════════════════════════════════════════════════
  -- LOCK + VALIDATE BATCH (race-safe: FOR UPDATE prevents concurrent staging)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE id = p_batch_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Status check: only staging batches accept new rows
  IF v_batch.status != 'staging' THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_STAGING: batch status is %', v_batch.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Server-side batch row limit (10,000)
  IF v_batch.total_rows + v_new_row_count > 10000 THEN
    RAISE EXCEPTION 'IMPORT_SIZE_LIMIT_EXCEEDED: total_rows (%) + new_rows (%) would exceed 10000 limit',
      v_batch.total_rows, v_new_row_count
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- INSERT ROWS (ON CONFLICT DO NOTHING for retry safety)
  -- ═══════════════════════════════════════════════════════════════════════
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_number := (v_row ->> 'row_number')::int;
    v_raw_row := v_row -> 'raw_row';
    v_normalized := v_row -> 'normalized_payload';

    IF v_row_number IS NULL THEN
      RAISE EXCEPTION 'IMPORT_ROW_VALIDATION_FAILED: row_number is required'
        USING ERRCODE = '22023';
    END IF;

    IF v_normalized IS NULL THEN
      RAISE EXCEPTION 'IMPORT_ROW_VALIDATION_FAILED: normalized_payload is required'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.import_row (
      batch_id, casino_id, row_number,
      raw_row, normalized_payload, status
    ) VALUES (
      p_batch_id, v_casino_id, v_row_number,
      COALESCE(v_raw_row, '{}'), v_normalized, 'staged'
    )
    ON CONFLICT (batch_id, row_number) DO NOTHING;

    -- Track insertions (DO NOTHING means re-staged rows are not counted)
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- UPDATE BATCH total_rows (count actual staged rows)
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE public.import_batch
  SET total_rows = (
    SELECT count(*)::int FROM public.import_row WHERE batch_id = p_batch_id
  )
  WHERE id = p_batch_id;

  -- Return updated batch
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE id = p_batch_id;

  RETURN v_batch;
END;
$$;

COMMENT ON FUNCTION public.rpc_import_stage_rows(uuid, jsonb) IS
  'PRD-037: Stage import rows into a batch. Locks batch FOR UPDATE, enforces 10k cap. '
  'ON CONFLICT DO NOTHING for retry safety. Derives context from staff (ADR-024 INV-8).';

ALTER FUNCTION public.rpc_import_stage_rows(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_import_stage_rows(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_stage_rows(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_stage_rows(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 7. RPC: rpc_import_execute
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_execute(
  p_batch_id uuid
)
RETURNS public.import_batch
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_batch public.import_batch;
  v_row RECORD;
  v_email text;
  v_phone text;
  v_match_count int;
  v_matched_player_id uuid;
  v_new_player_id uuid;
  v_row_status public.import_row_status;
  v_reason_code text;
  v_reason_detail text;
  v_report jsonb;
  v_created_count int := 0;
  v_linked_count int := 0;
  v_skipped_count int := 0;
  v_conflict_count int := 0;
  v_error_count int := 0;
BEGIN
  -- Bound execution time (EXEC-SPEC requirement)
  SET LOCAL statement_timeout = '120s';

  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT INJECTION (ADR-024 INV-7/INV-8)
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM public.set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: admin and pit_boss only
  IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'pit_boss') THEN
    RAISE EXCEPTION 'FORBIDDEN: role % cannot execute import batches', v_staff_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from context'
      USING ERRCODE = 'P0001';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- LOCK BATCH (concurrent callers wait; already completed returns immediately)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE id = p_batch_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: if already completed or failed, return as-is
  IF v_batch.status IN ('completed', 'failed') THEN
    RETURN v_batch;
  END IF;

  -- Only staging batches can be executed
  IF v_batch.status = 'executing' THEN
    -- Another call is executing concurrently and we got the lock after it finished
    -- Re-read to get the final state
    SELECT * INTO v_batch
    FROM public.import_batch
    WHERE id = p_batch_id;
    RETURN v_batch;
  END IF;

  IF v_batch.status != 'staging' THEN
    RAISE EXCEPTION 'IMPORT_BATCH_NOT_STAGING: batch status is %', v_batch.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Transition to executing
  UPDATE public.import_batch
  SET status = 'executing'
  WHERE id = p_batch_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- PROCESS ROWS: two-phase pattern
  --   Inner: production writes in subtransaction (SAVEPOINT)
  --   Outer: failure metadata persists even on rollback
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    -- SAVEPOINT for production writes
    FOR v_row IN
      SELECT ir.id AS row_id, ir.row_number, ir.normalized_payload
      FROM public.import_row ir
      WHERE ir.batch_id = p_batch_id
        AND ir.status = 'staged'
      ORDER BY ir.row_number
    LOOP
      -- Extract identifiers from normalized payload
      v_email := v_row.normalized_payload -> 'identifiers' ->> 'email';
      v_phone := v_row.normalized_payload -> 'identifiers' ->> 'phone';
      v_matched_player_id := NULL;
      v_row_status := 'error';
      v_reason_code := NULL;
      v_reason_detail := NULL;

      -- Skip rows with no identifiers
      IF (v_email IS NULL OR length(trim(v_email)) = 0)
         AND (v_phone IS NULL OR length(trim(v_phone)) = 0) THEN
        v_row_status := 'skipped';
        v_reason_code := 'NO_IDENTIFIER';
        v_reason_detail := 'Row has no email or phone identifier';
      ELSE
        -- ═══════════════════════════════════════════════════════════
        -- IDENTIFIER RESOLUTION: casino-scoped via player_casino join
        -- Match through enrollment: player_casino → player
        -- ═══════════════════════════════════════════════════════════
        v_match_count := 0;

        -- Email match (case-insensitive)
        IF v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN
          SELECT count(*), min(p.id) INTO v_match_count, v_matched_player_id
          FROM public.player p
          INNER JOIN public.player_casino pc
            ON pc.player_id = p.id AND pc.casino_id = v_casino_id
          WHERE lower(p.email) = lower(v_email);
        END IF;

        -- Phone fallback (only if no email match)
        IF v_match_count = 0 AND v_phone IS NOT NULL AND length(trim(v_phone)) > 0 THEN
          SELECT count(*), min(p.id) INTO v_match_count, v_matched_player_id
          FROM public.player p
          INNER JOIN public.player_casino pc
            ON pc.player_id = p.id AND pc.casino_id = v_casino_id
          WHERE p.phone_number = v_phone;
        END IF;

        -- ═══════════════════════════════════════════════════════════
        -- OUTCOME ROUTING
        -- ═══════════════════════════════════════════════════════════
        IF v_match_count = 0 THEN
          -- CREATE: new player + enrollment
          INSERT INTO public.player (first_name, last_name, email, phone_number, birth_date)
          VALUES (
            COALESCE(v_row.normalized_payload -> 'profile' ->> 'first_name', 'Unknown'),
            COALESCE(v_row.normalized_payload -> 'profile' ->> 'last_name', 'Unknown'),
            NULLIF(trim(v_email), ''),
            NULLIF(trim(v_phone), ''),
            (v_row.normalized_payload -> 'profile' ->> 'dob')::date
          )
          RETURNING id INTO v_new_player_id;

          -- Enroll in casino
          INSERT INTO public.player_casino (player_id, casino_id, enrolled_by, status)
          VALUES (v_new_player_id, v_casino_id, v_actor_id, 'active');

          v_matched_player_id := v_new_player_id;
          v_row_status := 'created';
          v_reason_code := 'NEW_PLAYER';
          v_reason_detail := 'Created new player and enrollment';
          v_created_count := v_created_count + 1;

        ELSIF v_match_count = 1 THEN
          -- LINK: existing player found, no updates to player fields
          v_row_status := 'linked';
          v_reason_code := 'EXISTING_PLAYER';
          v_reason_detail := 'Linked to existing player ' || v_matched_player_id::text;
          v_linked_count := v_linked_count + 1;

        ELSE
          -- CONFLICT: multiple matches — no production writes
          v_matched_player_id := NULL;
          v_row_status := 'conflict';
          v_reason_code := 'MULTIPLE_MATCHES';
          v_reason_detail := 'Found ' || v_match_count || ' matching players';
          v_conflict_count := v_conflict_count + 1;
        END IF;
      END IF;

      -- Update row with outcome
      UPDATE public.import_row
      SET status = v_row_status,
          reason_code = v_reason_code,
          reason_detail = v_reason_detail,
          matched_player_id = v_matched_player_id
      WHERE id = v_row.row_id;

      IF v_row_status = 'skipped' THEN
        v_skipped_count := v_skipped_count + 1;
      END IF;
    END LOOP;

    -- Build report summary
    v_report := jsonb_build_object(
      'total_rows', v_batch.total_rows,
      'created', v_created_count,
      'linked', v_linked_count,
      'skipped', v_skipped_count,
      'conflict', v_conflict_count,
      'error', v_error_count,
      'completed_at', now()::text
    );

    -- Mark batch as completed
    UPDATE public.import_batch
    SET status = 'completed',
        report_summary = v_report
    WHERE id = p_batch_id;

  EXCEPTION WHEN OTHERS THEN
    -- Two-phase pattern: production writes roll back (via exception propagation
    -- up to the savepoint), but we catch here to persist failure metadata.
    -- The row inserts into player/player_casino are rolled back.
    -- We update the batch status to 'failed' with error details.
    UPDATE public.import_batch
    SET status = 'failed',
        report_summary = jsonb_build_object(
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'failed_at', now()::text,
          'created', v_created_count,
          'linked', v_linked_count,
          'skipped', v_skipped_count,
          'conflict', v_conflict_count,
          'error_count', v_error_count
        )
    WHERE id = p_batch_id;
  END;

  -- Return final batch state
  SELECT * INTO v_batch
  FROM public.import_batch
  WHERE id = p_batch_id;

  RETURN v_batch;
END;
$$;

COMMENT ON FUNCTION public.rpc_import_execute(uuid) IS
  'PRD-037: Execute CSV import merge — identifier resolution with casino-scoped matching. '
  'Three outcomes: create (0 matches), link (1 match), conflict (N matches). '
  'Two-phase pattern: production writes roll back on failure, metadata persists. '
  'SET LOCAL statement_timeout = 120s. Derives context from staff (ADR-024 INV-8).';

ALTER FUNCTION public.rpc_import_execute(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_import_execute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_execute(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_execute(uuid) TO authenticated;

-- ============================================================================
-- 8. ENABLE RLS (defense-in-depth — policies created in WS2 migration)
-- ============================================================================

ALTER TABLE public.import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch FORCE ROW LEVEL SECURITY;

ALTER TABLE public.import_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_row FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
