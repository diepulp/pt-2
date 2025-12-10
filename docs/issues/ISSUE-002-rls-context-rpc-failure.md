# ISSUE-002: RLS Context RPC Injection Failure

**Status:** Open
**Priority:** P0 - Blocking
**Created:** 2025-12-10
**Affects:** All API endpoints using `withServerAction` middleware
**Related:** ADR-015, ISSUE-001 (regression)

## Summary

The Pit Dashboard at `/pit` fails to load with "ERROR LOADING DASHBOARD - Unexpected error". All API endpoints return 500 errors. Root cause is the `set_rls_context()` RPC call failing at runtime despite the migration being applied.

## Symptoms

1. Dashboard shows "ERROR LOADING DASHBOARD - Unexpected error"
2. All API endpoints return 500 Internal Server Error
3. Console shows 18 failed network requests
4. Explicit error on `/api/v1/visits`: `"Failed to inject RLS context"`

## Observed Errors

| Endpoint | Error Count | Error Message |
|----------|-------------|---------------|
| `/api/v1/tables` | 6 | `"Unexpected error"` |
| `/api/v1/rating-slips` | 4 | `"Unexpected error"` |
| `/api/v1/visits` | 4 | `"Failed to inject RLS context"` |
| `/api/v1/casino/gaming-day` | 4 | `"Unexpected error"` |

### Sample Error Response

```json
{
  "ok": false,
  "code": "INTERNAL_ERROR",
  "error": "Failed to inject RLS context",
  "details": {},
  "requestId": "61b954c1-d576-40b9-88aa-d2b32845a1b2",
  "durationMs": 12,
  "timestamp": "2025-12-10T02:58:26.530Z"
}
```

## Root Cause Analysis

### Execution Flow

```
GET /api/v1/visits
    ↓
withServerAction(supabase, handler, options)
    ↓
Middleware chain: withTracing → withAuth → withRLS → handler
    ↓
withAuth: DEV_RLS_CONTEXT injected (dev bypass active) ✅
    ↓
withRLS: calls injectRLSContext(supabase, ctx.rlsContext, correlationId)
    ↓
injectRLSContext: await supabase.rpc('set_rls_context', {...}) ← FAILS HERE
    ↓
DomainError('INTERNAL_ERROR', 'Failed to inject RLS context')
```

### The Failure Point

The `set_rls_context()` RPC call fails at runtime:

```typescript
// lib/supabase/rls-context.ts:93-102
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_rls_context', {
    p_actor_id: context.actorId,
    p_casino_id: context.casinoId,
    p_staff_role: context.staffRole,
    p_correlation_id: correlationId,
  });

  if (error) {
    throw new Error(`Failed to inject RLS context: ${error.message}`);
  }
}
```

### Migration Status

The ADR-015 migrations are **applied** per `supabase migration list`:

| Migration | Status | Description |
|-----------|--------|-------------|
| `20251209183033_adr015_rls_context_rpc.sql` | ✅ Applied | Creates `set_rls_context()` function |
| `20251209183401_adr015_hybrid_rls_policies.sql` | ✅ Applied | Hybrid RLS policies with COALESCE |

### Potential Causes

1. **RPC Grant Issue** - Function may not be granted to `authenticated` role
2. **Type Mismatch** - TypeScript types may not match function signature
3. **UUID Validation** - `DEV_RLS_CONTEXT` UUIDs may not match seed data
4. **Connection Pooling** - Supavisor may be resetting the function call context

## Relationship to ADR-015

This issue is **directly caused by ADR-015 implementation**:

| Workstream | Status | Observation |
|------------|--------|-------------|
| WS1: Database RPC Layer | ✅ Applied | Migration exists, applied to DB |
| WS2: TypeScript Integration | ✅ Complete | `injectRLSContext()` uses `set_rls_context` RPC |
| WS3: Middleware Integration | ✅ Complete | `withRLS` calls `injectRLSContext` |
| WS4: Hybrid RLS Policies | ✅ Applied | Migration applied |
| WS6: Integration Tests | ❌ Pending | **Would have caught this failure** |

### Prior State (ISSUE-001 Resolution)

ISSUE-001 was resolved on 2025-12-09 with the dev auth bypass. At that time:
- `injectRLSContext()` used multiple `exec_sql` calls (old pattern)
- Dashboard was working with dev bypass

### Current State (Regression)

After ADR-015 WS1/WS2 implementation:
- `injectRLSContext()` now uses single `set_rls_context` RPC (new pattern)
- RPC call fails → all endpoints fail

## Classification

| Category | Pertinence to ADR-015 |
|----------|----------------------|
| `"Failed to inject RLS context"` | **Directly Related** - Core WS1/WS2 implementation failure |
| `"Unexpected error"` (generic) | **Possibly Related** - May be downstream effect of RLS failure |

**Conclusion:** All observed errors are pertinent to the ADR-015 refactoring effort.

## Diagnostic Steps

```bash
# 1. Verify RPC function exists
psql "$DATABASE_URL" -c "\df set_rls_context"

# 2. Verify grants
psql "$DATABASE_URL" -c "SELECT grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name = 'set_rls_context';"

# 3. Test RPC directly
psql "$DATABASE_URL" -c "SELECT set_rls_context('5a000000-0000-0000-0000-000000000001'::uuid, 'ca000000-0000-0000-0000-000000000001'::uuid, 'pit_boss', NULL);"

# 4. Check DEV_RLS_CONTEXT UUIDs in seed data
psql "$DATABASE_URL" -c "SELECT id, casino_id, role FROM staff WHERE id = '5a000000-0000-0000-0000-000000000001';"
```

## Affected Files

| File | Role |
|------|------|
| `lib/supabase/rls-context.ts` | RPC caller (WS2 implementation) |
| `lib/server-actions/middleware/rls.ts` | Middleware invoking injection |
| `supabase/migrations/20251209183033_adr015_rls_context_rpc.sql` | RPC function definition |
| `lib/supabase/dev-context.ts` | Dev bypass context values |

## Proposed Resolution

### Option A: Debug RPC Failure

1. Add detailed error logging to capture `error.message` from RPC
2. Run diagnostic SQL commands above
3. Fix grant/signature/UUID issues as discovered

### Option B: Complete WS6 Integration Tests

Per EXECUTION-SPEC-ADR-015.md, WS6 would validate:
- [ ] Context persists across multiple queries
- [ ] Cross-tenant access blocked
- [ ] Concurrent requests isolated correctly

These tests would identify the exact failure mode.

### Option C: Rollback to exec_sql Pattern (Temporary)

If immediate fix needed, revert `injectRLSContext()` to use multiple `exec_sql` calls while investigating.

```typescript
// Temporary rollback
const statements = [
  `SET LOCAL app.actor_id = '${context.actorId}'`,
  `SET LOCAL app.casino_id = '${context.casinoId}'`,
  `SET LOCAL app.staff_role = '${context.staffRole}'`,
];

for (const stmt of statements) {
  const { error } = await supabase.rpc('exec_sql', { sql: stmt });
  if (error) throw new Error(`RLS injection failed: ${error.message}`);
}
```

**Risk:** This re-introduces the connection pooling issue ADR-015 was designed to solve.

## Action Items

- [ ] Run diagnostic SQL commands to identify RPC failure cause
- [ ] Add error message logging to `injectRLSContext()`
- [ ] Verify `authenticated` role grant on `set_rls_context`
- [ ] Verify DEV_RLS_CONTEXT UUIDs match seed data
- [ ] Complete WS6 integration tests
- [ ] Update EXECUTION-SPEC-ADR-015.md with findings

## Related

- ADR-015: RLS Connection Pooling Strategy
- EXECUTION-SPEC-ADR-015.md: Implementation specification
- ISSUE-001: Dashboard Auth (prior resolution, now regressed)
- `lib/supabase/dev-context.ts`: Dev mode configuration
