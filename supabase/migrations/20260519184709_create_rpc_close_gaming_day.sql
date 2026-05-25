-- Migration: 20260519184709_create_rpc_close_gaming_day.sql
-- Purpose: Gaming day close signal writer. Inserts a row into gaming_day_lifecycle
--   to mark a casino+gaming_day as closed. Idempotent (ON CONFLICT DO NOTHING).
--   PRD-087 WS1B_GATE_B_DB Gate B.
--
-- Security: SECURITY DEFINER, service_role EXECUTE only.
-- p_casino_id is a trusted parameter — service_role callers do not have app.casino_id
-- set automatically (no set_rls_context_from_staff call in consumer path).
-- The caller (relay cron / admin trigger) provides casino_id explicitly.
--
-- No authenticated path. Close is permanent within Phase 2.3.

CREATE OR REPLACE FUNCTION public.rpc_close_gaming_day(
  p_casino_id  UUID,
  p_gaming_day DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_casino_id IS NULL THEN
    RAISE EXCEPTION 'rpc_close_gaming_day: p_casino_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_gaming_day IS NULL THEN
    RAISE EXCEPTION 'rpc_close_gaming_day: p_gaming_day is required'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.gaming_day_lifecycle (casino_id, gaming_day)
  VALUES (p_casino_id, p_gaming_day)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL    ON FUNCTION public.rpc_close_gaming_day(UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_close_gaming_day(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.rpc_close_gaming_day(UUID, DATE) IS
  'Inserts a gaming_day_lifecycle row to mark casino+gaming_day as closed. '
  'Idempotent (ON CONFLICT DO NOTHING). p_casino_id is a trusted service_role parameter. '
  'Close is permanent within Phase 2.3. SECURITY DEFINER, service_role EXECUTE only. '
  'PRD-087 WS1B Gate B.';
