# EXEC-045 Pre-Commit Warning Review

**Spec**: EXEC-045 ADR-039 Measurement Layer
**Branch**: `feat/strategic-hardnening`
**Commit**: `fa4c8d5`
**Date**: 2026-03-07

---

## WARNING 1: RLS policy changes without review marker

**File**: `supabase/migrations/20260307114452_adr039_loyalty_measurement_schema.sql`
**Severity**: Cosmetic (hook wants a comment marker)

The 4 RLS policies are correct:

- Pattern C hybrid SELECT with `COALESCE(session_var, JWT)` on `casino_id` — lines 57–63, 112–117
- Write policies (INSERT/UPDATE) properly gated to `pit_boss`/`admin` — lines 68–97
- `auth.uid() IS NOT NULL` present in all policies

**Fix**: Add `-- RLS_REVIEW_COMPLETE` to the migration header. One-liner.

---

## WARNING 2 & 3: `actor_id` lacks ADR-015 hybrid fallback

**Files**:

- `supabase/migrations/20260307114918_adr039_close_slip_materialize_theo.sql`
- `supabase/migrations/20260307115101_adr039_rpc_snapshot_loyalty_liability.sql`

**Severity**: False positive

Both are **SECURITY DEFINER RPCs** that call `set_rls_context_from_staff()` at entry (ADR-024). The session vars (`app.actor_id`, `app.casino_id`, `app.staff_role`) are authoritatively derived from the staff table — there is no JWT fallback path needed inside SECURITY DEFINER functions. The hook is pattern-matching on `current_setting('app.actor_id')` without understanding the SECURITY DEFINER context.

**No fix needed.** This is working as designed per ADR-024.

---

## WARNING 4: `staff_role` lacks ADR-015 hybrid fallback in RLS policies

**File**: `supabase/migrations/20260307114452_adr039_loyalty_measurement_schema.sql` (lines 76, 89, 97)
**Severity**: Low — fails closed, but worth noting

The write policies use bare `current_setting('app.staff_role', true) IN ('pit_boss', 'admin')` without a JWT fallback. If `app.staff_role` is not set (e.g., direct PostgREST without session var injection), the check returns `NULL NOT IN (...)` which is `FALSE` — **access denied**.

This is safe (fails closed), but the hybrid pattern would add resilience:

```sql
COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'staff_role'
) IN ('pit_boss', 'admin')
```

**Recommendation**: Optional fix. The current code denies access rather than granting it when the session var is missing — this is the safe direction. ADR-030 mandates session-var enforcement on write paths, so the bare check is consistent with that ADR's intent. Add hybrid if you want defense-in-depth parity with the `casino_id` check pattern.

---

## Code Quality Summary

| Migration | Assessment |
|-----------|-----------|
| WS1: Theo columns | Clean. Simple ALTER + index + COMMENTs |
| WS2: Theo materialization | Solid. All 3 RPCs updated, exception handler (DA P1-2), `NOT VALID` CHECK constraint at end (DA P0-1) |
| WS3: Loyalty schema | Correct. Pattern C SELECT, write-gated to pit_boss/admin, partial unique index |
| WS4: Snapshot RPC | Clean. ADR-024 context, UPSERT idempotency, audit log, no `p_casino_id` (INV-8) |
| WS5: Measurement views | Correct. `security_invoker=true`, LATERAL prevents fan-out on coverage view, fan-out documented on correlation view |

## Actionable Items

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Add `-- RLS_REVIEW_COMPLETE` marker to WS3 migration header | Low | Open |
| 2 | Optional: Add hybrid fallback for `staff_role` in WS3 write policies | Low | Open |
| 3 | Warnings 2 & 3 (actor_id in SECURITY DEFINER RPCs) | N/A | False positive — no action |
