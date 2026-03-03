# ISSUE: RLS Context Regression in Dashboard Tables RPC

**ID**: ISSUE-RLS-CONTEXT-REGRESSION-DASHBOARD-RPC
**Severity**: P0 — Dashboard completely broken for pit terminal
**Status**: RESOLVED
**Date Discovered**: 2026-03-01
**Date Resolved**: 2026-03-01

## Symptom

Pit terminal throws **"Error Loading Dashboard — permission denied for function set_rls_context"** on load.

## Root Cause

Migration `20260301015320_enrich_dashboard_rpc_session_status.sql` (commit `53636b5`, EXEC-038A session UI bugs fix) performed a `CREATE OR REPLACE` on `rpc_get_dashboard_tables_with_counts` to add a `current_session_status` column to the response. The function body was copied from the **pre-ADR-024 version**, re-introducing the deprecated call:

```sql
PERFORM set_rls_context(v_context_actor_id, p_casino_id, v_context_staff_role);
```

The ADR-024 remediation migration (`20251229154013_adr024_dashboard_rpcs.sql`) had already replaced this with `PERFORM set_rls_context_from_staff()`. The deprecation migration (`20251229155051_adr024_deprecate_old_context.sql`) revoked `EXECUTE` on `set_rls_context()` from `authenticated`, `anon`, and `PUBLIC` roles.

Because the newer migration was the last `CREATE OR REPLACE` for this function, it overwrote the ADR-024 fix, causing every authenticated call to fail.

## Affected Function

- `rpc_get_dashboard_tables_with_counts(uuid)` — called by `hooks/dashboard/use-dashboard-tables.ts` via the pit terminal panels

## Fix

Migration `20260301230753_fix_dashboard_tables_rpc_rls_context_regression.sql`:

1. Replaced `PERFORM set_rls_context(v_context_actor_id, p_casino_id, v_context_staff_role)` with `PERFORM set_rls_context_from_staff()` (ADR-024 pattern)
2. Removed unnecessary `v_context_actor_id` / `v_context_staff_role` manual variable extraction
3. Preserved the `current_session_status` LEFT JOIN from EXEC-038A Bug 3

## Prevention

When writing `CREATE OR REPLACE` migrations for existing RPCs:

1. **Always read the current function definition** from the latest migration — not from an older version or from memory
2. **Verify RLS context pattern**: any RPC touching RLS-protected tables must use `set_rls_context_from_staff()`, never the deprecated `set_rls_context()`
3. **ADR-024 compliance check**: search the function body for `set_rls_context(` (without `_from_staff`) before committing

## References

- ADR-024: Authoritative context derivation
- `20251229155051_adr024_deprecate_old_context.sql` — revocation migration
- `20251229154013_adr024_dashboard_rpcs.sql` — original ADR-024 fix for this RPC
- `20260301015320_enrich_dashboard_rpc_session_status.sql` — regression source
- `20260301230753_fix_dashboard_tables_rpc_rls_context_regression.sql` — fix
