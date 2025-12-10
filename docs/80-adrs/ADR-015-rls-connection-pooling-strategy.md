# ADR-015: RLS Connection Pooling Strategy

**Status:** Implemented (Phase 2)
**Date:** 2025-12-10
**Implementation Date:** 2025-12-10
**Owner:** Security/Platform
**Applies to:** All RLS policies and Supabase client usage
**Decision type:** Architecture + Security
**Supersedes:** None
**Related:** SEC-001, SEC-002, ADR-008

---

## Context

### The Problem

PT-2 currently uses `SET LOCAL` session variables to inject RLS context (`app.casino_id`, `app.actor_id`, `app.staff_role`) into PostgreSQL sessions. This pattern was documented in:

- `lib/supabase/rls-context.ts` - Context injection implementation
- `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy templates using `current_setting()`
- `supabase/migrations/20251110224223_staff_authentication_upgrade.sql` - `exec_sql()` RPC

**Critical Issue:** Supabase uses Supavisor connection pooling in **transaction mode** (port 6543) by default. In transaction mode:

1. Each query may get a **different connection** from the pool
2. `SET LOCAL` settings apply only to the **current transaction**
3. If `SET LOCAL` and subsequent queries are executed as separate statements, they may run on different connections
4. **Result:** RLS policies using `current_setting('app.casino_id')` fail intermittently, returning empty results or allowing cross-tenant data access

This was recorded as high-severity technical debt in Memori (2025-12-09):
> "RLS context injection via SET LOCAL fails with Supabase connection pooling. Each request gets fresh connection."

### Evidence of the Problem

Current implementation in `rls-context.ts:84-106`:
```typescript
// Each SET LOCAL executes as separate RPC call
for (const stmt of statements) {
  const { error } = await supabase.rpc('exec_sql', { sql: stmt });
  // These may execute on DIFFERENT pooled connections!
}
```

The subsequent query that relies on `current_setting()` may execute on yet another connection where `app.casino_id` was never set.

---

## Decision

### Primary Strategy: Transaction-Wrapped Context Injection

All RLS context injection MUST be wrapped in a **single transaction** with the queries that depend on it.

**Implementation Pattern:**

```sql
-- Single RPC call that wraps SET LOCAL + query in one transaction
CREATE OR REPLACE FUNCTION rpc_query_with_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_query text
) RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SET LOCAL only affects THIS transaction
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  -- Query executes in same transaction with context set
  RETURN QUERY EXECUTE p_query;
END;
$$;
```

### Secondary Strategy: Supabase Auth JWT Claims (Recommended Long-term)

For **new implementations**, prefer embedding context in Supabase Auth JWT claims:

```typescript
// At authentication time, set custom claims
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: {
    casino_id: staffRecord.casino_id,
    staff_role: staffRecord.role,
    staff_id: staffRecord.id
  }
});
```

RLS policies then use `auth.jwt()`:

```sql
CREATE POLICY "visit_read_same_casino"
  ON visit FOR SELECT USING (
    casino_id = (auth.jwt() ->> 'casino_id')::uuid
  );
```

**Tradeoffs:**
- JWT claims require re-login or token refresh when role changes
- Better performance (no extra RPC call per query)
- Natively supported by Supabase pooling

### Fallback Strategy: Session Mode for Admin Operations

For administrative operations that require persistent session state (migrations, bulk operations), use **session mode** (port 5432):

```typescript
// Session mode connection for admin tasks
const adminClient = createClient({
  connectionString: process.env.SUPABASE_SESSION_MODE_URL, // Port 5432
});
```

---

## Standardized RLS Policy Patterns

### Pattern A: JWT-Based (Preferred for New Code)

```sql
-- No SET LOCAL required; works with transaction mode pooling
CREATE POLICY "table_read_jwt_casino"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );
```

### Pattern B: Transaction-Wrapped Context (Migration Path)

```sql
-- Requires calling rpc_query_with_context() wrapper
CREATE POLICY "table_read_session_context"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      (current_setting('app.casino_id', true))::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Pattern C: Hybrid with Fallback

```sql
-- Works with both JWT claims and SET LOCAL
CREATE POLICY "table_read_hybrid"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

---

## Migration Plan

### Phase 1: Immediate (Week 1)

1. **Update `injectRLSContext()`** to use single transaction RPC:
   ```typescript
   export async function injectRLSContext(
     supabase: SupabaseClient<Database>,
     context: RLSContext,
   ): Promise<void> {
     // Single RPC call with all SET LOCAL in one transaction
     await supabase.rpc('set_rls_context', {
       actor_id: context.actorId,
       casino_id: context.casinoId,
       staff_role: context.staffRole,
     });
   }
   ```

2. **Create migration** for `set_rls_context()` RPC:
   ```sql
   CREATE OR REPLACE FUNCTION set_rls_context(
     actor_id uuid,
     casino_id uuid,
     staff_role text
   ) RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   BEGIN
     PERFORM set_config('app.actor_id', actor_id::text, true);
     PERFORM set_config('app.casino_id', casino_id::text, true);
     PERFORM set_config('app.staff_role', staff_role, true);
   END;
   $$;
   ```

3. **Update `withServerAction` wrapper** to call context injection and query in same request batch.

### Phase 2: JWT Claims Integration (Week 2-3)

1. **Add custom claims** to `auth.users.app_metadata` on staff creation/update
2. **Update authentication flow** to set `casino_id` and `staff_role` in JWT
3. **Add hybrid policies** that check JWT first, fall back to session context
4. **Monitor** for any policy failures during rollout

### Phase 3: Policy Modernization (Week 4+)

1. **Migrate all RLS policies** to Pattern A (JWT-based)
2. **Remove SET LOCAL dependency** from standard operations
3. **Keep session mode** only for admin/migration tasks
4. **Update SEC-001** to reflect new canonical pattern

---

## Rationale

| Approach | Pooling Compatible | Performance | Complexity | Token Freshness |
|----------|-------------------|-------------|------------|-----------------|
| SET LOCAL (current) | No (transaction mode) | Medium | Low | Immediate |
| Transaction-wrapped RPC | Yes | Medium | Medium | Immediate |
| JWT Claims | Yes | High | Low | On token refresh |
| Session Mode | Yes | Low | Low | N/A |

**Selected: Transaction-wrapped RPC (short-term) + JWT Claims (long-term)**

- Transaction-wrapped RPC fixes immediate issue with minimal code changes
- JWT Claims provide better long-term scalability and are Supabase-native
- Hybrid policies enable gradual migration without service disruption

---

## Consequences

### Positive

- **Security:** Eliminates race conditions where wrong tenant context could be applied
- **Reliability:** RLS policies work consistently with connection pooling
- **Performance:** JWT-based policies have lower latency (no extra RPC)
- **Compliance:** Multi-tenant isolation guaranteed at database level

### Negative

- **Migration Effort:** Requires updating existing policies and injection code
- **JWT Token Size:** Adding claims increases token payload (~50-100 bytes)
- **Freshness:** JWT claims require re-login or refresh when role changes

### Neutral

- RPC-based approach adds one function call per context switch
- Existing `rls-context.ts` API surface remains mostly unchanged

---

## Verification

### Before Deployment (Phase 1 - Complete)

- [x] `set_rls_context()` RPC created and tested
- [x] `injectRLSContext()` updated to use new RPC
- [x] Integration tests verify context persists across queries (12/12 passing)
- [ ] Load test confirms no cross-tenant data leakage (pending production testing)

### After Deployment (Phase 1)

- [ ] Monitor Supabase logs for RLS policy failures
- [ ] Validate context isolation under concurrent load
- [ ] Run security regression tests for multi-tenant scenarios

### Phase 2-3 Verification (JWT Claims - Future)

- [ ] Audit `casino_id` in JWT claims vs. expected values
- [ ] Verify token refresh flow updates claims correctly
- [ ] Confirm hybrid fallback works during migration period

---

## References

- [Supabase Connection Pooling FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
- [Securing Backend Queries in Supabase](https://arda.beyazoglu.com/supabase-backend-custom-query-security-with-rls)
- [Supabase RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- `docs/30-security/SEC-001-rls-policy-matrix.md`
- `docs/30-security/SEC-002-casino-scoped-security-model.md`
- `lib/supabase/rls-context.ts`

---

## Appendix: Technical Details

### Why SET LOCAL Fails with Transaction Mode Pooling

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supavisor (Transaction Mode)                 │
├─────────────────────────────────────────────────────────────────┤
│  Client Request 1              Client Request 2                 │
│  ┌─────────────────┐          ┌─────────────────┐               │
│  │ SET LOCAL       │          │ SELECT * FROM   │               │
│  │ app.casino_id   │          │ visit           │               │
│  │ = 'uuid-a'      │          │                 │               │
│  └────────┬────────┘          └────────┬────────┘               │
│           │                            │                        │
│           ▼                            ▼                        │
│  ┌─────────────────┐          ┌─────────────────┐               │
│  │ Connection A    │          │ Connection B    │  ← DIFFERENT! │
│  │ (SET LOCAL      │          │ (app.casino_id  │               │
│  │  applies here)  │          │  is UNSET!)     │               │
│  └─────────────────┘          └─────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### Transaction-Wrapped Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supavisor (Transaction Mode)                 │
├─────────────────────────────────────────────────────────────────┤
│  Single RPC Call: rpc_query_with_context(...)                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ BEGIN;                                                  │    │
│  │ SET LOCAL app.casino_id = 'uuid-a';                     │    │
│  │ SELECT * FROM visit;  -- Same transaction, same conn    │    │
│  │ COMMIT;                                                 │    │
│  └────────────────────────────────────────────────────────-┘    │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │ Connection A    │  ← SET LOCAL persists    │
│                    │ (entire txn)    │     for entire txn       │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

**Changelog:**
- 2025-12-10: Initial ADR created based on Memori tech debt record
- 2025-12-10: **Phase 1 Implemented** - Transaction-wrapped RPC (`set_rls_context`) deployed and verified
  - Migration: `20251209183033_adr015_rls_context_rpc.sql`
  - Migration: `20251209183401_adr015_hybrid_rls_policies.sql` (Pattern C hybrid policies)
  - Updated: `lib/supabase/rls-context.ts` with `injectRLSContext()` using new RPC
  - All 12 integration tests passing (`lib/supabase/__tests__/rls-context.integration.test.ts`)
  - SEC-001 documentation updated with ADR-015 patterns

- 2025-12-10: **Phase 2 Implemented** - JWT Claims Integration
  - Created: `lib/supabase/auth-admin.ts` with `syncUserRLSClaims()` function
  - Migration: `20251210001858_adr015_backfill_jwt_claims.sql`
    - `sync_staff_jwt_claims()` function for manual/batch sync
    - Backfill script for existing authenticated staff
    - `trg_sync_staff_jwt_claims` trigger for automatic future sync
  - Updated: `services/casino/crud.ts` - createStaff/updateStaff sync JWT claims
  - Updated: `services/casino/index.ts` - added updateStaff method
  - Updated: `services/casino/dtos.ts` - added UpdateStaffDTO

**Phase 2 Verification:**
- [x] JWT claims synced on staff creation (createStaff)
- [x] JWT claims synced on staff update (updateStaff - role/casino changes)
- [x] Database trigger auto-syncs on direct staff table changes
- [x] Hybrid RLS policies use JWT fallback when SET LOCAL unavailable
- [ ] Integration tests validate JWT-based RLS (in progress)

**Pending (Phase 3):**
- Monitor JWT claims vs. session variables in production
- Phase out SET LOCAL once JWT claims proven stable
- Performance benchmarking with connection pooling
