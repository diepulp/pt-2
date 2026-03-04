-- PostgREST Surface Inventory
-- Generates a complete inventory of all rpc_* functions visible to PostgREST.
--
-- Usage:
--   psql -f supabase/scripts/postgrest_surface_inventory.sql
--   -- or --
--   supabase db reset && psql -h localhost -p 54322 -U postgres -d postgres -f supabase/scripts/postgrest_surface_inventory.sql
--
-- Regenerate after any migration that adds, modifies, or drops rpc_* functions.
-- Output is formatted text suitable for copy-paste into docs/30-security/postgrest_surface_inventory.md.
--
-- Reference: SEC-007 (Gap D: PostgREST surface inventory is missing)

-- ============================================================================
-- 1. Full RPC Inventory: name, args, security type, volatility, granted roles
-- ============================================================================
SELECT
  p.proname                                           AS function_name,
  p.pronargs                                          AS arg_count,
  pg_get_function_arguments(p.oid)                    AS arg_types,
  p.pronargdefaults                                   AS default_arg_count,
  CASE p.prosecdef
    WHEN true  THEN 'DEFINER'
    WHEN false THEN 'INVOKER'
  END                                                 AS security_type,
  p.provolatile::text                                 AS volatility,
  CASE WHEN has_function_privilege('public', p.oid, 'EXECUTE')
    THEN '** PUBLIC **'
    ELSE ''
  END                                                 AS public_execute,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
    THEN 'YES'
    ELSE 'no'
  END                                                 AS anon_execute,
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
    THEN 'YES'
    ELSE 'no'
  END                                                 AS authenticated_execute,
  CASE WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
    THEN 'YES'
    ELSE 'no'
  END                                                 AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
ORDER BY p.proname, p.pronargs;

-- ============================================================================
-- 2. Highlight: Functions with PUBLIC EXECUTE (should be 0 or auth-flow only)
-- ============================================================================
SELECT
  '** WARNING: PUBLIC EXECUTE **'                     AS alert,
  p.proname                                           AS function_name,
  p.pronargs                                          AS arg_count,
  pg_get_function_arguments(p.oid)                    AS arg_types,
  CASE p.prosecdef
    WHEN true  THEN 'DEFINER'
    WHEN false THEN 'INVOKER'
  END                                                 AS security_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
  AND has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- ============================================================================
-- 3. Highlight: Functions with multiple overloads (PostgREST ambiguity risk)
-- ============================================================================
SELECT
  '** WARNING: MULTIPLE OVERLOADS **'                 AS alert,
  p.proname                                           AS function_name,
  count(*)                                            AS overload_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
GROUP BY p.proname
HAVING count(*) > 1
ORDER BY p.proname;

-- ============================================================================
-- 4. Highlight: SECURITY DEFINER functions (require ADR-018 governance)
-- ============================================================================
SELECT
  p.proname                                           AS function_name,
  pg_get_function_arguments(p.oid)                    AS arg_types,
  CASE WHEN has_function_privilege('public', p.oid, 'EXECUTE')
    THEN '** PUBLIC **'
    ELSE 'OK'
  END                                                 AS public_status,
  CASE WHEN 'p_actor_id' = ANY(p.proargnames)
    THEN '** HAS p_actor_id **'
    ELSE 'OK'
  END                                                 AS identity_param_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
  AND p.prosecdef = true
ORDER BY p.proname;

-- ============================================================================
-- 5. Highlight: Functions with identity parameters (p_actor_id) — should be 0
-- ============================================================================
SELECT
  '** WARNING: IDENTITY PARAM **'                     AS alert,
  p.proname                                           AS function_name,
  unnest(p.proargnames)                               AS arg_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
  AND 'p_actor_id' = ANY(p.proargnames)
ORDER BY p.proname;
