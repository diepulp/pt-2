# GAP: Authenticated Role Grant Blind Spot

**Discovered**: 2026-04-08  
**Severity**: P1 — production RLS failure, invisible to all test layers  
**Status**: PARTIALLY RESOLVED — hotfix applied, systemic prevention pending

## Incident

`rpc_get_rating_slip_duration` returned `permission denied` in production for authenticated users. The function lacked `GRANT EXECUTE TO authenticated` — the sole gap across 93 RPCs.

## Root Cause Chain

1. **Migration `20251128221408`** — created the function. Default privileges granted EXECUTE to `authenticated` via `public` role inheritance.
2. **Migration `20260219235800`** (ADR-018 security remediation) — bulk `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` stripped inherited EXECUTE from `authenticated` on all functions, then selectively re-granted. **Missed `rpc_get_rating_slip_duration`.**
3. **Migration `20260302230022`** (SEC-007 remediation) — granted EXECUTE only to `service_role`, not `authenticated`.

The grant gap was **identical on local and remote**. Migrations ran the same sequence on both databases.

## Why It Was Invisible

| Layer | Why It Missed |
|-------|--------------|
| **Local dev** | `DEV_AUTH_BYPASS` short-circuits auth — Supabase client operates with elevated privileges, never exercises `authenticated` role grant checks |
| **Unit tests** | Mock `supabase.rpc()` — never hit Postgres |
| **Integration tests** | Use `service_role` key — bypasses EXECUTE grant checks |
| **E2E tests (Playwright)** | Use `DEV_AUTH_BYPASS` — same blind spot as local dev |
| **Security gates (SEC-007)** | Test RLS policies and context injection patterns, not EXECUTE grants |
| **Migration lint** | Checks for `set_rls_context_*` calls, not `GRANT EXECUTE` |

**No test layer exercises real `authenticated`-role EXECUTE privileges against the actual database.**

## Hotfix Applied

- **Remote**: `GRANT EXECUTE ON FUNCTION public.rpc_get_rating_slip_duration(uuid, timestamptz) TO authenticated` — executed directly via Supabase MCP (2026-04-08).
- **Local**: Same grant applied via `docker exec`.
- **Migration**: `20260408112838_fix_rating_slip_duration_grant.sql` — captures the fix for future `db reset` / CI.

## Systemic Pattern: Bulk REVOKE + Selective GRANT

The ADR-018 remediation used a pattern that is inherently fragile:

```sql
-- Step 1: revoke everything (safe, but scorched-earth)
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Step 2: selectively re-grant (must enumerate every function — any omission is a silent break)
GRANT EXECUTE ON FUNCTION rpc_foo(...) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_bar(...) TO authenticated;
-- ... missed rpc_get_rating_slip_duration
```

Any function omitted in Step 2 silently loses `authenticated` access. The omission is undetectable until a real user hits it in production.

## Prevention: Required Closures

### 1. Grant Audit Gate (security-gates.yml)

Add an assertion to the SEC-007 security gate suite that verifies every `rpc_*` function has `GRANT EXECUTE TO authenticated`, with an explicit exclusion list for internal-only functions.

```sql
-- Assert: all rpc_* functions are callable by authenticated
-- Exclude: internal helpers that are never called via PostgREST
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND p.proname NOT IN (
    -- Explicit exclusion list for internal-only functions
  );
-- Must return 0 rows
```

**Why**: Catches bulk-REVOKE omissions before they reach production. Runs against ephemeral Postgres in CI on every migration PR.

### 2. Authenticated-Role Smoke Test

Add one integration test that creates a real `authenticated`-role session (not `service_role`, not `DEV_AUTH_BYPASS`) and calls a representative set of RPCs, verifying EXECUTE succeeds.

**Why**: Closes the blind spot where every existing test layer uses elevated credentials.

### 3. Migration Lint: Bulk REVOKE Warning

When migration-lint detects `REVOKE ALL ON ALL FUNCTIONS`, emit a warning requiring the PR to include a corresponding grant audit or explicit function enumeration.

**Why**: Makes the dangerous pattern visible during code review.

## Related

- **ADR-018**: SECURITY DEFINER governance (source of the bulk REVOKE)
- **ADR-024**: Authoritative context derivation
- **SEC-007**: Security assertion gates
- **Migration `20260219235800`**: The breaking migration
- **Migration `20260302230022`**: The incomplete remediation
- **Migration `20260408112838`**: The hotfix
