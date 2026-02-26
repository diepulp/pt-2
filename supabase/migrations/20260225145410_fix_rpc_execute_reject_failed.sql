-- ============================================================================
-- Migration: PRD-039 Server-Authoritative CSV Ingestion Worker — Fix rpc_import_execute
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-039-server-csv-ingestion-worker.md
-- ADR References: ADR-024 (authoritative context), ADR-018 (SECURITY DEFINER),
--                 ADR-036 (CSV import strategy)
--
-- Purpose:
--   Fix DA P0-2 bug in rpc_import_execute: failed batches were silently returned
--   instead of being rejected. The old code had:
--     IF v_batch.status IN ('completed', 'failed') THEN RETURN v_batch;
--   Changed to:
--     IF v_batch.status = 'completed' THEN RETURN v_batch;
--   Now 'failed' batches fall through to the status != 'staging' check and
--   raise IMPORT_BATCH_NOT_STAGING, which is the correct behavior — failed
--   batches should not be silently accepted as successful.
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

  -- P0-2 FIX: Only completed batches are returned idempotently.
  -- Failed batches now fall through to the status != 'staging' check below,
  -- which raises IMPORT_BATCH_NOT_STAGING — correct behavior for retryability.
  IF v_batch.status = 'completed' THEN
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
        -- Match through enrollment: player_casino -> player
        -- ═══════════════════════════════════════════════════════════
        v_match_count := 0;

        -- Email match (case-insensitive)
        IF v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN
          SELECT count(*), (array_agg(p.id))[1] INTO v_match_count, v_matched_player_id
          FROM public.player p
          INNER JOIN public.player_casino pc
            ON pc.player_id = p.id AND pc.casino_id = v_casino_id
          WHERE lower(p.email) = lower(v_email);
        END IF;

        -- Phone fallback (only if no email match)
        IF v_match_count = 0 AND v_phone IS NOT NULL AND length(trim(v_phone)) > 0 THEN
          SELECT count(*), (array_agg(p.id))[1] INTO v_match_count, v_matched_player_id
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
  'PRD-037/039: Execute CSV import merge — identifier resolution with casino-scoped matching. '
  'Three outcomes: create (0 matches), link (1 match), conflict (N matches). '
  'Two-phase pattern: production writes roll back on failure, metadata persists. '
  'P0-2 fix: failed batches are now rejected (not silently returned). '
  'SET LOCAL statement_timeout = 120s. Derives context from staff (ADR-024 INV-8).';

ALTER FUNCTION public.rpc_import_execute(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_import_execute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_execute(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_execute(uuid) TO authenticated;

-- ============================================================================
-- PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
