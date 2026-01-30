# ISSUE: WS5 Write RLS Tightening Breaks Direct Table Writes

**Severity:** P0 — migration must be revised before merge
**Component:** `supabase/migrations/20260129193824_auth_hardening_write_rls_tightening.sql`
**Discovered:** 2026-01-30, smoke test against local Supabase
**Status:** Open
**Blocks:** AUTH-HARDENING v0.1 merge to main

---

## Summary

WS5 removes the JWT COALESCE fallback from **all** write (INSERT/UPDATE/DELETE) RLS policies, replacing it with session-var-only checks (`current_setting('app.casino_id', true)`). This assumes `set_rls_context_from_staff()` RPC sets `SET LOCAL` vars that persist for subsequent writes.

**The assumption is incorrect for direct table writes.** `SET LOCAL` is transaction-scoped. Each Supabase JS client call (`.rpc()`, `.from().insert()`, `.from().update()`) is a separate PostgREST HTTP request and therefore a **separate PostgreSQL transaction**. The `SET LOCAL` vars set by the RPC in transaction T1 do not exist in transaction T2 when the direct write executes.

## Root Cause

```
Middleware calls:  supabase.rpc('set_rls_context_from_staff')  →  Transaction T1 (SET LOCAL sets vars, COMMIT)
Service calls:     supabase.from('visit').update(...)          →  Transaction T2 (vars are empty, RLS denies)
```

PostgreSQL `set_config(name, value, true)` — the `true` parameter means "local to current transaction." When the transaction commits, the setting is gone. PostgREST does not maintain persistent connections with session state between HTTP requests.

**ADR-018 confirms this architecture:**
> "SECURITY DEFINER RPCs self-inject context within the same function body/transaction. Writes within the RPC share the transaction and see the SET LOCAL vars."

This means:
- **SECURITY DEFINER RPCs**: Context injection and data writes happen in the **same transaction** — safe to remove JWT fallback
- **Direct table writes**: Context injection (RPC) and data write (`.from().update()`) are **separate transactions** — JWT COALESCE fallback is **required**

## Affected Tables

### Tables with direct PostgREST writes (MUST keep COALESCE fallback)

| Table | Direct write location | Write type |
|-------|----------------------|------------|
| `visit` | `services/visit/crud.ts` | `.from('visit').insert()`, `.from('visit').update()` |
| `rating_slip` | `services/rating-slip/crud.ts` | `.from('rating_slip').update()` |
| `player_loyalty` | `services/loyalty/crud.ts` | `.from('player_loyalty').update()` |
| `loyalty_ledger` | `services/loyalty/crud.ts` | `.from('loyalty_ledger').insert()` (SECURITY INVOKER RPCs also) |

### Tables safe to tighten (writes only via SECURITY DEFINER RPCs)

| Table | RPC write path | Confidence |
|-------|---------------|------------|
| `player_casino` | `rpc_create_player` (SECURITY DEFINER) | High |
| `rating_slip_pause` | `rpc_pause_rating_slip`, `rpc_resume_rating_slip` (SECURITY DEFINER) | High |
| `gaming_table` | `rpc_update_table_status` (SECURITY DEFINER) | High |
| `dealer_rotation` | No write operations found in codebase | High |
| `player_financial_transaction` | `rpc_create_financial_txn` (SECURITY DEFINER) | High |
| `staff` | `services/casino/crud.ts` — uses service-role client (bypasses RLS) | High |

## Smoke Test Evidence

```sql
-- Transaction T1: SET LOCAL works within the same transaction
BEGIN;
  SELECT set_config('app.casino_id', '<uuid>', true);
  UPDATE visit SET ... WHERE id = '<id>';
  -- UPDATE 1 (success)
COMMIT;

-- Transaction T2: SET LOCAL from T1 does not persist
-- (simulates: RPC in one request, write in next request)
SELECT set_config('app.casino_id', '<uuid>', true);  -- T1
UPDATE visit SET ... WHERE id = '<id>';               -- T2 (separate transaction)
-- UPDATE 0 (RLS denied — app.casino_id is empty in T2)
```

The Supabase JS client reported this as "success" (HTTP 200, empty array) because PostgREST returns 200 with zero rows for zero-row updates. The `.select()` after `.update()` confirmed data was unchanged.

## Required Fix

Revise the WS5 migration to split into two categories:

### Category A: Tighten (session-var only) — tables with RPC-only writes

Remove COALESCE fallback for: `player_casino`, `rating_slip_pause`, `gaming_table`, `dealer_rotation`, `player_financial_transaction`, `staff`

```sql
-- Tightened pattern (no JWT fallback)
NULLIF(current_setting('app.casino_id', true), '') IS NOT NULL
AND NULLIF(current_setting('app.actor_id', true), '') IS NOT NULL
AND casino_id = current_setting('app.casino_id', true)::uuid
```

### Category B: Preserve COALESCE (hybrid) — tables with direct writes

Keep JWT fallback for: `visit`, `rating_slip`, `player_loyalty`, `loyalty_ledger`

```sql
-- Hybrid pattern preserved (ADR-015 Pattern C)
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

For Category B tables, the hardening improvement is to **add** the `auth.uid() IS NOT NULL` guard and role checks without removing the COALESCE fallback.

## Relationship to ADRs

| ADR | Relevance |
|-----|-----------|
| ADR-015 | Pattern C (hybrid COALESCE) is canonical for direct table access via PostgREST |
| ADR-018 | SECURITY DEFINER RPCs self-inject context in same transaction (safe to tighten) |
| ADR-020 | Track A hybrid is the MVP architecture; JWT fallback is intentional |
| ADR-024 | `set_rls_context_from_staff()` sets `SET LOCAL` — transaction-scoped by design |

## Verification Plan

After revising the migration:

1. `supabase db reset` to apply all migrations cleanly
2. Smoke test Category A tables via RPC writes (should succeed)
3. Smoke test Category B tables via direct `.from().update()` (should succeed with JWT fallback)
4. Negative test: verify Category A tables reject writes without RPC context
5. Negative test: verify Category B tables still enforce casino scope via JWT

## Notes

- The WS5 migration file `20260129193824_auth_hardening_write_rls_tightening.sql` has **not been applied** to production
- The local DB had a reset pending; the migration was written but the smoke test exposed this issue before any deployment
- This is a design-time catch, not a production incident
