-- Migration: Convert ratingslip.id from TEXT to UUID for schema consistency
-- Impact: Low (test data only, nascent domain, no production coupling)
-- Dependencies: accrual_history.session_id references ratingslip.id

BEGIN;

-- Step 1: Drop dependent foreign key constraint
ALTER TABLE accrual_history
  DROP CONSTRAINT IF EXISTS accrual_history_session_id_fkey;

-- Step 2: Clear test data (UUID conversion from arbitrary TEXT is non-deterministic)
-- Since this is test data only, cleanest approach is to truncate
TRUNCATE TABLE accrual_history CASCADE;
TRUNCATE TABLE ratingslip CASCADE;

-- Step 3: Convert ratingslip.id column from TEXT to UUID
ALTER TABLE ratingslip
  DROP CONSTRAINT IF EXISTS ratingslip_pkey CASCADE,
  ALTER COLUMN id TYPE UUID USING gen_random_uuid(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 4: Re-establish primary key constraint on ratingslip.id
ALTER TABLE ratingslip
  ADD PRIMARY KEY (id);

-- Step 5: Convert accrual_history.session_id from TEXT to UUID
ALTER TABLE accrual_history
  ALTER COLUMN session_id TYPE UUID USING session_id::uuid;

-- Step 6: Re-establish foreign key constraint with UUID types
ALTER TABLE accrual_history
  ADD CONSTRAINT accrual_history_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES ratingslip(id)
  ON DELETE CASCADE;

-- Step 7: Re-enable RLS policies (ensure they remain active after truncation)
ALTER TABLE ratingslip ENABLE ROW LEVEL SECURITY;
ALTER TABLE accrual_history ENABLE ROW LEVEL SECURITY;

-- Step 8: Note - No function changes needed
-- The existing start_rated_visit function in 20250920060318_visit_service_rpc_functions.sql
-- already uses RETURNING id INTO v_rating_slip_id, which will now return UUID instead of TEXT

-- Verification: Ensure schema consistency achieved
DO $$
DECLARE
  ratingslip_id_type TEXT;
  accrual_session_id_type TEXT;
BEGIN
  SELECT data_type INTO ratingslip_id_type
  FROM information_schema.columns
  WHERE table_name = 'ratingslip' AND column_name = 'id';

  SELECT data_type INTO accrual_session_id_type
  FROM information_schema.columns
  WHERE table_name = 'accrual_history' AND column_name = 'session_id';

  IF ratingslip_id_type != 'uuid' THEN
    RAISE EXCEPTION 'Migration failed: ratingslip.id is %, expected uuid', ratingslip_id_type;
  END IF;

  IF accrual_session_id_type != 'uuid' THEN
    RAISE EXCEPTION 'Migration failed: accrual_history.session_id is %, expected uuid', accrual_session_id_type;
  END IF;

  RAISE NOTICE 'Schema consistency migration successful: ratingslip.id and accrual_history.session_id are now UUID';
END $$;

COMMIT;
