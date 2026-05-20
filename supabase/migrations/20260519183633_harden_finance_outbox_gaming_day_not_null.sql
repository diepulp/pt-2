-- Gate A Step 5 — Harden gaming_day NOT NULL on finance_outbox (PRD-087 WS1A M5)
--
-- Safe only after M4 (backfill) confirms zero NULL rows.
-- Pre-state assertion guards against applying this migration if NULLs remain.

-- Pre-state assertion: no NULLs in gaming_day (M4 must have succeeded)
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.finance_outbox
   WHERE gaming_day IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: % finance_outbox rows have NULL gaming_day. '
      'Apply M4 (backfill_finance_outbox_gaming_day) and resolve all NULLs before hardening.',
      v_count;
  END IF;
END;
$$;

-- Harden NOT NULL
ALTER TABLE public.finance_outbox
  ALTER COLUMN gaming_day SET NOT NULL;

-- Post-state assertion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'finance_outbox'
       AND column_name  = 'gaming_day'
       AND is_nullable  = 'NO'
  ) THEN
    RAISE EXCEPTION 'POST-STATE FAIL: finance_outbox.gaming_day is still nullable after M5.';
  END IF;
END;
$$;
