-- 2025-10-22 — Gaming Day normalization (TIME) + RPC arg order/types
-- SRM alignment: casino_settings.gaming_day_start_time = time
--                 compute_gaming_day(ts timestamptz, gstart time)

BEGIN;

-- 1) Normalize casino_settings.gaming_day_start_time to TIME
--    (safe if already TIME; will cast from text if needed)
ALTER TABLE public.casino_settings
  ALTER COLUMN gaming_day_start_time TYPE time
  USING gaming_day_start_time::time;

-- 2) Clean up any legacy/incorrect compute_gaming_day signatures
--    (defensive: drop various possible variants if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'compute_gaming_day'
      AND pg_get_function_identity_arguments(p.oid) = 'ts timestamp with time zone, gstart interval'
  ) THEN
    EXECUTE 'DROP FUNCTION public.compute_gaming_day(ts timestamptz, gstart interval)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'compute_gaming_day'
      AND pg_get_function_identity_arguments(p.oid) = 'gstart interval, ts timestamp with time zone'
  ) THEN
    EXECUTE 'DROP FUNCTION public.compute_gaming_day(gstart interval, ts timestamptz)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'compute_gaming_day'
      AND pg_get_function_identity_arguments(p.oid) = 'ts timestamp with time zone, gstart time without time zone'
  ) THEN
    EXECUTE 'DROP FUNCTION public.compute_gaming_day(ts timestamptz, gstart time)';
  END IF;
END $$;

-- 3) Recreate canonical compute_gaming_day(ts, gstart time)
--    Note: Convert TIME to an interval since midnight to perform the shift.
CREATE OR REPLACE FUNCTION public.compute_gaming_day(
  ts timestamptz,
  gstart time
) RETURNS date
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (date_trunc('day', ts - (gstart - time '00:00'))
          + (gstart - time '00:00'))::date
$fn$;

-- 4) Update trigger function to use TIME (no ::interval casts)
CREATE OR REPLACE FUNCTION public.set_fin_txn_gaming_day()
RETURNS trigger
LANGUAGE plpgsql
AS $plpgsql$
DECLARE
  v_gstart time;
BEGIN
  SELECT gaming_day_start_time
    INTO v_gstart
    FROM public.casino_settings
   WHERE casino_id = NEW.casino_id;

  NEW.gaming_day :=
    public.compute_gaming_day(
      COALESCE(NEW.created_at, now()),
      COALESCE(v_gstart, time '06:00')
    );

  RETURN NEW;
END
$plpgsql$;

-- 5) Rebind trigger (idempotent drop/create)
DROP TRIGGER IF EXISTS trg_fin_gaming_day ON public.player_financial_transaction;
CREATE TRIGGER trg_fin_gaming_day
BEFORE INSERT OR UPDATE ON public.player_financial_transaction
FOR EACH ROW EXECUTE FUNCTION public.set_fin_txn_gaming_day();

COMMIT;

-- Post-migration notes (not executed):
-- - Regenerate types so the client sees:
--   * casino_settings.gaming_day_start_time: string
--   * Functions.compute_gaming_day.Args: { ts: string; gstart: string }, Returns: string
-- - Example: supabase gen types typescript --local > types/remote/database.types.ts
