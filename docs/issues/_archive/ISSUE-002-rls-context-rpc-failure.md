# ISSUE-002: RLS Context RPC Injection Failure

**Status:** ✅ RESOLVED
**Priority:** P0 - Blocking
**Created:** 2025-12-10
**Updated:** 2025-12-10
**Resolved:** 2025-12-10
**Affects:** `/api/v1/visits` endpoint (joins to RLS-enabled `player` table)
**Related:** ADR-015, ISSUE-001 (regression)
**Remediation:** [REM-ISSUE-002](remediation/REM-ISSUE-002-rls-hybrid-policies.md)

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

## Diagnosis Update (2025-12-10)

### Confirmed Root Cause

The original diagnosis was **partially incorrect**. Refined findings:

| Original Assumption | Actual Finding |
|---------------------|----------------|
| RPC call failing | RPC works, but context lost due to **transaction isolation** |
| All endpoints affected | Only endpoints joining RLS-enabled tables affected |
| Migration applied | WS4 hybrid policies **NOT applied** despite file existing |

### Key Evidence

```sql
-- Database has OLD pattern (vulnerable):
casino_id = (current_setting('app.casino_id', true))::uuid

-- Migration file has NEW pattern (fixed, but not applied):
casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, jwt_fallback)
```

### Why `/api/v1/visits` Fails But Others Work

| Table | RLS Enabled | Policy Evaluated | Result |
|-------|-------------|------------------|--------|
| `gaming_table` | No | N/A | 200 OK |
| `rating_slip` | No | N/A | 200 OK |
| `player` (via visit join) | **Yes** | `player_select_enrolled` | **500 Error** |

## FINAL ROOT CAUSE (2025-12-10)

### Migration Conflict Identified

The ADR-015 hybrid policies were **applied and then overwritten** by a later migration:

| Migration | Timestamp | Effect |
|-----------|-----------|--------|
| `20251209183401_adr015_hybrid_rls_policies.sql` | 18:34:01 | Created hybrid policies with JWT fallback |
| `20251209215834_sync_remote_changes.sql` | 21:58:34 | **OVERWROTE** with old policies (no JWT fallback) |

**The Smoking Gun:**
```sql
-- Line 24-29 in sync_remote_changes.sql
create policy "staff_read"
on "public"."staff"
using ((casino_id = (current_setting('app.casino_id'::text, true))::uuid));
-- Missing: auth.uid() guard, JWT fallback
```

This explains the CLI dissonance:
- CLI showed migrations as "applied" - they WERE applied
- Database had old policies - because sync_remote_changes ran AFTER ADR-015
- Remote schema drift caused auto-generated migration to overwrite local changes

### Resolution

See [REM-ISSUE-002: Migration Conflict Resolution](remediation/REM-ISSUE-002-migration-conflict-resolution.md)

**Required Actions:**
```bash
# 1. Delete conflicting migration
rm supabase/migrations/20251209215834_sync_remote_changes.sql

# 2. Reset database (manual - blocked by destructive hook)
npx supabase db reset
```

## Resolution (2025-12-10)

### Actions Taken

1. **Deleted conflicting migration:** `supabase/migrations/20251209215834_sync_remote_changes.sql`
2. **Executed database reset:** `npx supabase db reset`
3. **Verified ADR-015 hybrid policies applied:**
   ```sql
   -- Confirmed Pattern C in player_select_enrolled policy:
   COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid,
            (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)
   ```
4. **Endpoint test passed:** `/api/v1/visits` returns 200

### Verification Results

| Check | Result |
|-------|--------|
| Hybrid policies applied | ✅ COALESCE/NULLIF pattern confirmed |
| auth.uid() guard present | ✅ |
| JWT fallback present | ✅ |
| `/api/v1/visits` status | ✅ 200 OK |

### Lessons Learned

1. **Remote schema drift is dangerous** - auto-generated `sync_remote_changes` migrations can overwrite intentional local changes
2. **CI should validate migrations** - add pre-commit hook to detect old RLS patterns
3. **WS6 integration tests would have caught this** - prioritize test coverage

## Related

- ADR-015: RLS Connection Pooling Strategy
- EXECUTION-SPEC-ADR-015.md: Implementation specification
- ISSUE-001: Dashboard Auth (prior resolution, now regressed)
- `lib/supabase/dev-context.ts`: Dev mode configuration
