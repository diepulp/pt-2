-- Gate A Step 4 — Backfill gaming_day in finance_outbox from authoritative sources
-- (PRD-087 WS1A M4 — DEC-EXEC-3)
--
-- Backfill strategy per DEC-EXEC-3:
--   - ledger rows (fact_class='ledger'): JOIN player_financial_transaction ON id = aggregate_id
--   - grind.observed (fact_class='operational', event_type='grind.observed'):
--     JOIN table_buyin_telemetry ON id = aggregate_id (aggregate_id IS the telemetry row id)
--   - fill.recorded / credit.recorded: pre-assert count=0 (timestamp inference BANNED);
--     if non-zero, Gate A fails closed with RAISE EXCEPTION
--
-- Post-assert: no NULL gaming_day remains after backfill. Gate A fails closed if any remain.
--
-- Timestamp inference (compute_gaming_day from created_at) is EXPLICITLY BANNED for all
-- event types. Only authoritative source-table joins are permitted.

-- Step 1: Pre-assert — no fill.recorded or credit.recorded rows exist
-- Gate A fails closed: these tables have no gaming_day column for authoritative backfill.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.finance_outbox
   WHERE event_type IN ('fill.recorded', 'credit.recorded');

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'PRE-STATE FAIL: % fill.recorded/credit.recorded rows exist in finance_outbox. '
      'Gate A fails closed: table_fill/table_credit have no gaming_day column; '
      'timestamp inference is banned (DEC-EXEC-3). '
      'Remediation options: '
      '(1) Add gaming_day to table_fill/table_credit before this migration; '
      '(2) Clear operational rows if environment is local-disposable; '
      '(3) Apply a prerequisite migration that amends those source tables.',
      v_count;
  END IF;
END;
$$;

-- Step 2: Backfill ledger rows (fact_class='ledger') from player_financial_transaction
-- aggregate_id = player_financial_transaction.id for buyin.recorded and adjustment.recorded
UPDATE public.finance_outbox fo
   SET gaming_day = pft.gaming_day
  FROM public.player_financial_transaction pft
 WHERE pft.id = fo.aggregate_id
   AND fo.fact_class = 'ledger'
   AND fo.gaming_day IS NULL;

-- Step 3: Backfill grind.observed from table_buyin_telemetry
-- aggregate_id = table_buyin_telemetry.id for grind.observed
UPDATE public.finance_outbox fo
   SET gaming_day = tbt.gaming_day
  FROM public.table_buyin_telemetry tbt
 WHERE tbt.id = fo.aggregate_id
   AND fo.event_type = 'grind.observed'
   AND fo.gaming_day IS NULL;

-- Step 4: Post-assert — no NULL gaming_day remains
-- Gate A fails closed: M5 (NOT NULL hardening) must not proceed while NULLs exist.
DO $$
DECLARE
  v_null_count integer;
  v_sample     text;
BEGIN
  SELECT COUNT(*) INTO v_null_count
    FROM public.finance_outbox
   WHERE gaming_day IS NULL;

  IF v_null_count > 0 THEN
    SELECT string_agg(event_type || ' (fact=' || fact_class || ')', ', ' ORDER BY event_type)
      INTO v_sample
      FROM (
        SELECT DISTINCT event_type, fact_class
          FROM public.finance_outbox
         WHERE gaming_day IS NULL
         LIMIT 10
      ) s;

    RAISE EXCEPTION
      'POST-STATE FAIL: % finance_outbox rows still have NULL gaming_day after backfill. '
      'Event types affected: [%]. '
      'Gate A fails closed: resolve NULL rows before M5 (NOT NULL hardening). '
      'These rows may require manual remediation per DEC-EXEC-3.',
      v_null_count, v_sample;
  END IF;
END;
$$;
