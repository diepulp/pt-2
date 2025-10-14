-- =====================================================
-- Wave 2 Schema Verification Script
-- =====================================================
-- Purpose: Verify database schema matches Wave 2 hardening requirements
-- Run this BEFORE starting Wave 2 implementation to establish baseline
-- Run this AFTER Wave 2 to verify all changes applied correctly
--
-- Usage: psql <connection-string> -f WAVE_2_VERIFICATION_SCRIPT.sql
-- =====================================================

\echo '========================================='
\echo 'Wave 2 Schema Verification'
\echo 'Date:' `date`
\echo '========================================='
\echo ''

-- =====================================================
-- CHECK 1: loyalty_ledger base columns (Wave 0)
-- =====================================================
\echo 'CHECK 1: loyalty_ledger base columns (Wave 0)'
\echo '---------------------------------------------'

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'loyalty_ledger'
  AND table_schema = 'public'
ORDER BY ordinal_position;

\echo ''

-- =====================================================
-- CHECK 2: loyalty_ledger hardening columns (Wave 2)
-- =====================================================
\echo 'CHECK 2: loyalty_ledger hardening columns (Wave 2)'
\echo '---------------------------------------------------'
\echo 'Expected: staff_id, balance_before, balance_after, tier_before, tier_after, correlation_id'
\echo ''

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'staff_id'
    ) THEN '✓ staff_id exists'
    ELSE '✗ staff_id MISSING'
  END AS staff_id_check;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'balance_before'
    ) THEN '✓ balance_before exists'
    ELSE '✗ balance_before MISSING'
  END AS balance_before_check;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'balance_after'
    ) THEN '✓ balance_after exists'
    ELSE '✗ balance_after MISSING'
  END AS balance_after_check;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'tier_before'
    ) THEN '✓ tier_before exists'
    ELSE '✗ tier_before MISSING'
  END AS tier_before_check;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'tier_after'
    ) THEN '✓ tier_after exists'
    ELSE '✗ tier_after MISSING'
  END AS tier_after_check;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_ledger'
        AND column_name = 'correlation_id'
    ) THEN '✓ correlation_id exists'
    ELSE '✗ correlation_id MISSING'
  END AS correlation_id_check;

\echo ''

-- =====================================================
-- CHECK 3: Idempotency index (Wave 0)
-- =====================================================
\echo 'CHECK 3: Idempotency unique index'
\echo '----------------------------------'

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'loyalty_ledger'
  AND indexname = 'idx_loyalty_ledger_session_type_source';

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'loyalty_ledger'
        AND indexname = 'idx_loyalty_ledger_session_type_source'
        AND indexdef LIKE '%UNIQUE%'
    ) THEN '✓ Idempotency index exists and is UNIQUE'
    ELSE '✗ Idempotency index MISSING or not UNIQUE'
  END AS idempotency_index_check;

\echo ''

-- =====================================================
-- CHECK 4: Correlation ID index (Wave 2)
-- =====================================================
\echo 'CHECK 4: Correlation ID index (Wave 2)'
\echo '---------------------------------------'

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'loyalty_ledger'
  AND indexname = 'idx_loyalty_ledger_correlation';

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'loyalty_ledger'
        AND indexname = 'idx_loyalty_ledger_correlation'
    ) THEN '✓ Correlation ID index exists'
    ELSE '✗ Correlation ID index MISSING'
  END AS correlation_index_check;

\echo ''

-- =====================================================
-- CHECK 5: Staff audit index (Wave 2)
-- =====================================================
\echo 'CHECK 5: Staff audit index (Wave 2)'
\echo '------------------------------------'

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'loyalty_ledger'
  AND indexname = 'idx_loyalty_ledger_staff';

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'loyalty_ledger'
        AND indexname = 'idx_loyalty_ledger_staff'
    ) THEN '✓ Staff audit index exists'
    ELSE '✗ Staff audit index MISSING'
  END AS staff_index_check;

\echo ''

-- =====================================================
-- CHECK 6: increment_player_loyalty RPC signature
-- =====================================================
\echo 'CHECK 6: increment_player_loyalty RPC return columns'
\echo '-----------------------------------------------------'
\echo 'Expected: player_id, balance_before, balance_after, tier_before, tier_after, tier_progress, lifetime_points, updated_at, row_locked'
\echo ''

SELECT
  proname AS function_name,
  pg_get_function_result(oid) AS return_type
FROM pg_proc
WHERE proname = 'increment_player_loyalty'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Check if return type includes balance_before (indicator of hardening)
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'increment_player_loyalty'
        AND pg_get_function_result(oid) LIKE '%balance_before%'
    ) THEN '✓ RPC returns enhanced result (includes balance_before)'
    ELSE '✗ RPC returns basic result (balance_before NOT in return type)'
  END AS rpc_enhancement_check;

\echo ''

-- =====================================================
-- CHECK 7: RPC row locking verification
-- =====================================================
\echo 'CHECK 7: RPC row locking (verify in function body)'
\echo '---------------------------------------------------'

SELECT
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'increment_player_loyalty'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Check if function body contains FOR UPDATE
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'increment_player_loyalty'
        AND pg_get_functiondef(oid) LIKE '%FOR UPDATE%'
    ) THEN '✓ RPC uses FOR UPDATE row locking'
    ELSE '✗ RPC does NOT use FOR UPDATE (concurrency risk)'
  END AS rpc_locking_check;

\echo ''

-- =====================================================
-- CHECK 8: Data integrity verification
-- =====================================================
\echo 'CHECK 8: Data integrity checks'
\echo '-------------------------------'

-- Check if any ledger entries exist
SELECT
  COUNT(*) AS total_ledger_entries,
  COUNT(DISTINCT player_id) AS unique_players,
  SUM(points_change) AS total_points_awarded
FROM loyalty_ledger;

-- Check for duplicate session entries (should be 0 if idempotency working)
SELECT
  COUNT(*) AS duplicate_session_entries
FROM (
  SELECT session_id, transaction_type, source, COUNT(*)
  FROM loyalty_ledger
  WHERE session_id IS NOT NULL
  GROUP BY session_id, transaction_type, source
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  CASE
    WHEN (
      SELECT COUNT(*) FROM (
        SELECT session_id, transaction_type, source, COUNT(*)
        FROM loyalty_ledger
        WHERE session_id IS NOT NULL
        GROUP BY session_id, transaction_type, source
        HAVING COUNT(*) > 1
      ) duplicates
    ) = 0 THEN '✓ No duplicate session entries (idempotency working)'
    ELSE '✗ DUPLICATE session entries found (idempotency BROKEN)'
  END AS idempotency_integrity_check;

\echo ''

-- =====================================================
-- SUMMARY
-- =====================================================
\echo '========================================='
\echo 'VERIFICATION SUMMARY'
\echo '========================================='
\echo ''
\echo 'Run this script before Wave 2 implementation to see current state.'
\echo 'Run this script after Wave 2 implementation to verify all changes applied.'
\echo ''
\echo 'Key indicators of Wave 2 readiness:'
\echo '  1. loyalty_ledger has 6 hardening columns (staff_id, balance_before/after, tier_before/after, correlation_id)'
\echo '  2. idx_loyalty_ledger_correlation index exists'
\echo '  3. idx_loyalty_ledger_staff index exists'
\echo '  4. increment_player_loyalty returns 9 columns (including balance_before/after, row_locked)'
\echo '  5. RPC function body contains FOR UPDATE'
\echo '  6. No duplicate session entries in ledger'
\echo ''
\echo '========================================='
