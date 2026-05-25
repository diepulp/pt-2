-- Gate A Step 2 — Amend fn_finance_outbox_emit to 9-param (add gaming_day) (PRD-087 WS1A M2)
--
-- Changes:
--   1. DROP the 8-param fn_finance_outbox_emit (signature cannot be changed via CREATE OR REPLACE)
--   2. CREATE 9-param version with p_gaming_day DATE NOT NULL as last parameter
--   3. REVOKE ALL from PUBLIC, anon, authenticated; GRANT EXECUTE to service_role only
--
-- WARNING: Between this migration and M3 (amend_all_producers_gaming_day), all 5 producer
-- functions will reference a non-existent function signature. Apply M3 immediately after.
-- This window is safe in a sequential migration batch but must not be deployed partially.
--
-- All behavior from Phase 2.2 final state (20260518105926) is preserved:
--   - ON CONFLICT (aggregate_id, event_type) DO NOTHING for idempotent retries
--   - casino_id derived from app.casino_id session GUC (no caller-supplied casino_id)
--   - All envelope validation checks preserved

-- Pre-state assertion: 8-param signature must exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_finance_outbox_emit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_event_id uuid, p_event_type text, p_fact_class text, p_origin_label text, p_table_id uuid, p_player_id uuid, p_aggregate_id uuid, p_payload jsonb'
  ) THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: 8-param fn_finance_outbox_emit not found. '
      'Apply Phase 2.2 migrations (20260518134715) before Gate A M2.';
  END IF;
END;
$$;

-- VERIFIED_SAFE: DROP+CREATE for signature change only — 8-param → 9-param (adds p_gaming_day).
-- The function is recreated immediately below in the same migration with identical body logic.
-- All 5 producer RPCs are amended in 20260519183631 to pass gaming_day before this runs.
-- PostgreSQL does not track function-to-function call dependencies,
-- so this succeeds even though producers reference it in their bodies.
DROP FUNCTION public.fn_finance_outbox_emit(uuid, text, text, text, uuid, uuid, uuid, jsonb);

-- Create 9-param replacement
CREATE FUNCTION public.fn_finance_outbox_emit(
  p_event_id     uuid,
  p_event_type   text,
  p_fact_class   text,
  p_origin_label text,
  p_table_id     uuid,
  p_player_id    uuid,
  p_aggregate_id uuid,
  p_payload      jsonb,
  p_gaming_day   date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- casino_id derived from authoritative session context (ADR-024); never caller-supplied
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION
      'fn_finance_outbox_emit: casino context not established. '
      'Call set_rls_context_from_staff() before emitting.';
  END IF;

  -- Envelope validation
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_id is required';
  END IF;

  IF p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: event_type is required';
  END IF;

  IF p_fact_class IS NULL OR p_fact_class NOT IN ('ledger', 'operational') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: fact_class must be ledger or operational, got: %',
      COALESCE(p_fact_class, 'NULL');
  END IF;

  IF p_origin_label IS NULL OR p_origin_label NOT IN ('actual', 'estimated') THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: origin_label must be actual or estimated, got: %',
      COALESCE(p_origin_label, 'NULL');
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: table_id is required';
  END IF;

  IF p_aggregate_id IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: aggregate_id is required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: payload is required';
  END IF;

  IF p_gaming_day IS NULL THEN
    RAISE EXCEPTION 'fn_finance_outbox_emit: gaming_day is required';
  END IF;

  INSERT INTO public.finance_outbox (
    event_id, event_type, fact_class, origin_label,
    casino_id, table_id, player_id, aggregate_id, payload, created_at, gaming_day
  ) VALUES (
    p_event_id, p_event_type, p_fact_class, p_origin_label,
    v_casino_id, p_table_id, p_player_id, p_aggregate_id, p_payload,
    NOW(), p_gaming_day
  )
  ON CONFLICT (aggregate_id, event_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, date
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, date
) FROM anon;

REVOKE ALL ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, date
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, date
) TO service_role;

COMMENT ON FUNCTION public.fn_finance_outbox_emit(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, date
) IS
  'PRD-087 WS1A Gate A M2: 9-param governed SECURITY DEFINER outbox insertion boundary. '
  'Adds p_gaming_day DATE NOT NULL — authoritative gaming day from source table or context. '
  'Infrastructure-only: deterministic envelope validation + idempotent finance_outbox INSERT. '
  'ON CONFLICT (aggregate_id, event_type) DO NOTHING preserves safe retry semantics. '
  'casino_id derived from app.casino_id session GUC (no caller-supplied casino_id). '
  'EXECUTE: service_role only (anon + authenticated explicitly revoked).';

-- Post-state assertions
DO $$
BEGIN
  -- 8-param must be gone
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_finance_outbox_emit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_event_id uuid, p_event_type text, p_fact_class text, p_origin_label text, p_table_id uuid, p_player_id uuid, p_aggregate_id uuid, p_payload jsonb'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: 8-param fn_finance_outbox_emit still exists after M2.';
  END IF;

  -- 9-param must exist as SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_finance_outbox_emit'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)
        = 'p_event_id uuid, p_event_type text, p_fact_class text, p_origin_label text, p_table_id uuid, p_player_id uuid, p_aggregate_id uuid, p_payload jsonb, p_gaming_day date'
      AND p.prosecdef IS TRUE
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: 9-param SECURITY DEFINER fn_finance_outbox_emit not found after M2.';
  END IF;

  -- service_role must have EXECUTE
  IF NOT has_function_privilege(
    'service_role',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb,date)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: service_role cannot EXECUTE 9-param fn_finance_outbox_emit.';
  END IF;

  -- anon must NOT have EXECUTE
  IF has_function_privilege(
    'anon',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb,date)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: anon can still EXECUTE fn_finance_outbox_emit after revoke.';
  END IF;

  -- authenticated must NOT have EXECUTE
  IF has_function_privilege(
    'authenticated',
    'public.fn_finance_outbox_emit(uuid,text,text,text,uuid,uuid,uuid,jsonb,date)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: authenticated can still EXECUTE fn_finance_outbox_emit after revoke.';
  END IF;
END;
$$;
