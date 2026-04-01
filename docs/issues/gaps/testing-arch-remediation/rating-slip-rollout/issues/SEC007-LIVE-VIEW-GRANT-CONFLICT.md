# SEC-007: rpc_get_visit_live_view Grant Conflict

**Filed:** 2026-03-31
**Severity:** Medium
**Status:** Open
**Affects:** `rpc_get_visit_live_view`, authenticated client path

## Problem

`rpc_get_visit_live_view` is `SECURITY INVOKER` and internally calls `rpc_get_rating_slip_duration`. SEC-007 remediation (migration `20260302230022_fix_sec007_p0_rpc_context_grants.sql`) revoked `authenticated` access to `rpc_get_rating_slip_duration` and restricted it to `service_role` only.

This means any authenticated client calling `rpc_get_visit_live_view` gets:

```
permission denied for function rpc_get_rating_slip_duration
```

## Impact

- The visit live view feature does not work from the authenticated client path.
- Integration tests for `getVisitLiveView` cannot exercise the full flow under Mode C auth. Tests currently catch the error and skip assertions.
- Any frontend or API route calling `service.getVisitLiveView()` via an authenticated Supabase client will fail.

## Root Cause

SEC-007 correctly tightened grants on duration RPCs but did not account for the call chain:

```
authenticated client
  -> rpc_get_visit_live_view (SECURITY INVOKER, granted to authenticated)
    -> rpc_get_rating_slip_duration (REVOKED from authenticated, service_role only)
       => PERMISSION DENIED
```

## Fix Options

1. **Make `rpc_get_visit_live_view` SECURITY DEFINER** — the function runs as owner (postgres) and can call any nested function. Requires ADR-018 governance review.
2. **Inline the duration calculation** inside `rpc_get_visit_live_view` instead of calling the separate RPC. Avoids the grant issue entirely.
3. **Re-grant `rpc_get_rating_slip_duration` to authenticated** — reverses part of SEC-007. Needs security review to confirm the RPC is safe for direct authenticated access.

## Affected Tests

- `rating-slip-continuity.integration.test.ts`:
  - `should return correct session totals across multiple slips` — catches error, skips
  - `should handle segments array pagination` — catches error, skips

## References

- SEC-007 grant migration: `supabase/migrations/20260302230022_fix_sec007_p0_rpc_context_grants.sql`
- Live view RPC: `rpc_get_visit_live_view`
- Duration RPC: `rpc_get_rating_slip_duration`
