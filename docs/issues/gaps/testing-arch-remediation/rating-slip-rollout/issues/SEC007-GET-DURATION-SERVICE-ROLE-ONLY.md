# SEC-007: rpc_get_rating_slip_duration Restricted to service_role

**Filed:** 2026-03-31
**Severity:** Low
**Status:** Open — by design, but integration test coverage affected

## Problem

`rpc_get_rating_slip_duration` is only granted to `service_role` per SEC-007 remediation. This means:

1. The `getDuration()` service method cannot be called from an authenticated client.
2. Integration tests must use the service-role `setupClient` to verify duration calculations.
3. Any API route exposing duration must use a server-side Supabase client with service-role credentials.

## Current State

The restriction was intentional (SEC-007 P0). The integration test works around it:

```typescript
// getDuration RPC restricted to service_role per SEC-007
const { data: duration } = await setupClient.rpc('rpc_get_rating_slip_duration', {
  p_rating_slip_id: slip.id,
  p_as_of: new Date().toISOString(),
});
```

## Impact

- Low risk — production API routes already use server-side clients.
- Test fidelity is slightly reduced: the test bypasses RLS for the duration check rather than going through the full auth path.
- This is also the root cause of the `rpc_get_visit_live_view` grant conflict (see SEC007-LIVE-VIEW-GRANT-CONFLICT.md).

## Action Items

- [ ] Confirm all production callers of `getDuration()` use server-side routes with service-role credentials
- [ ] Consider whether `rpc_get_rating_slip_duration` should be re-granted to `authenticated` with SECURITY DEFINER wrapping (would also fix the live view issue)

## References

- SEC-007 grant migration: `supabase/migrations/20260302230022_fix_sec007_p0_rpc_context_grants.sql`
- Test: `rating-slip.integration.test.ts` — "should get current duration for open slip"
