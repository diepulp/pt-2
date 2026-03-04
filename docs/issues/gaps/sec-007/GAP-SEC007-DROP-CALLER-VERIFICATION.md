# GAP-SEC007: Pre-Drop Caller Verification Missing

**Severity**: P1 (caused runtime dashboard failure)
**Status**: Resolved — fix migration applied, CI gate institutionalized
**Discovered**: 2026-03-03
**Root cause**: EXEC-040 WS4 dropped `set_rls_context()` without verifying all callers were remediated

---

## Summary

SEC-007 migration `20260302230024` dropped `set_rls_context(uuid,uuid,text,text)` based on
an unverified assumption that all function-body callers had been overridden by later
`CREATE OR REPLACE` migrations. Three SECURITY INVOKER RPCs from PRD-017 were never
overridden, causing `permission denied for function set_rls_context` on dashboard load.

## Affected RPCs

| RPC | Origin Migration | Signature | Security |
|-----|------------------|-----------|----------|
| `rpc_check_table_seat_availability` | `20251222142642` | `(uuid, int)` | INVOKER |
| `rpc_get_visit_loyalty_summary` | `20251222142643` | `(uuid)` | INVOKER |
| `rpc_get_visit_last_segment` | `20251222142644` | `(uuid)` | INVOKER |

## Why These Were Missed

1. **EXEC-040 (SEC-007)** scoped WS4 around SECURITY DEFINER RPCs. No workstream included a
   `pg_proc` body scan for all callers. The DROP migration comment (lines 15-17) stated
   callers were "overridden by later CREATE OR REPLACE migrations" — assumed, not verified.

2. **EXEC-041 (PRD-041)** scoped on `p_casino_id` parameter removal (INV-8). These three
   RPCs have no `p_casino_id`, so they were correctly excluded. However, line 160 asserted
   "All RPCs already call `set_rls_context_from_staff()`" — factually wrong, never validated.

3. **SEC-007 Callsite Audit** inventoried TS callsites but did not scan SQL function bodies.

4. **SEC-003 CI gate** checked function arguments, not function bodies.

## Resolution

### Fix migration

`20260303212259_fix_prd017_rpcs_dropped_set_rls_context.sql`:
- Replaces `PERFORM set_rls_context(...)` with `PERFORM set_rls_context_from_staff()`
- Adds `SET search_path = pg_catalog, public`

### CI gate: SEC-008

`supabase/tests/security/08_deprecated_function_body_check.sql` — registered in
`run_all_gates.sh` as gate 8 of 8.

Two checks:

1. **Resurrection guard** — fails if `set_rls_context()` reappears in `pg_proc` catalog
   after being dropped in `20260302230024`.
2. **Body scan** — strips comments and string literals from every public function body,
   removes approved variant names (`_from_staff`, `_internal`), then fails if any bare
   `set_rls_context(` remains in executable code.

Scope: all public functions, not limited to `rpc_*` prefix. Supersedes gate 05 (bash,
rpc-only).

### Catalog verification

```sql
-- Returns 0 rows on clean database
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%set_rls_context(%'
  AND p.prosrc NOT ILIKE '%set_rls_context_from_staff%'
  AND p.prosrc NOT ILIKE '%set_rls_context_internal%';
```

Confirmed 0 rows on local after fix migration.

## Process Fix for Future DROPs

Any migration that DROPs a deprecated function must include a prerequisite catalog scan
verifying zero callers remain. Gate SEC-008 now enforces this continuously in CI, but the
pre-drop verification should also be inline in the migration itself as a DO block that
raises an exception if callers exist.

## Related Documents

- EXEC-041: `docs/21-exec-spec/EXEC-041-adr024-p2-validate-to-derive.md`
- SEC-007 Callsite Audit: `docs/30-security/SEC-007-CALLSITE-AUDIT-REPORT-2026-03-02.md`
- PRD-041: `docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md`
- Fix migration: `supabase/migrations/20260303212259_fix_prd017_rpcs_dropped_set_rls_context.sql`
- CI gate: `supabase/tests/security/08_deprecated_function_body_check.sql`
