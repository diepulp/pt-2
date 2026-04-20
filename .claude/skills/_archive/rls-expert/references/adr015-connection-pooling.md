# ADR-015: Connection Pooling Strategy

Detailed explanation of the RLS connection pooling problem and solution.

> **Strategy Note:** This document covers technical implementation details. For the strategic decision (Track A hybrid for MVP, Track B JWT-only gated on prerequisites), see **ADR-020**. For external pattern validation, see `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md`.

## The Problem

PT-2 uses Supabase with Supavisor connection pooling in **transaction mode** (port 6543). This creates a critical issue with RLS context injection.

### Why SET LOCAL Fails

In transaction mode:
1. Each query may get a **different connection** from the pool
2. `SET LOCAL` settings apply only to the **current transaction**
3. If `SET LOCAL` and subsequent queries are separate statements, they may run on different connections
4. **Result**: RLS policies using `current_setting('app.casino_id')` fail intermittently

### Visual Explanation

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

**Impact**: Cross-tenant data leakage or empty results (security vulnerability).

---

## The Solution: Transaction-Wrapped Context

All context injection MUST be wrapped in a single transaction with the queries that depend on it.

### Solution Visual

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supavisor (Transaction Mode)                 │
├─────────────────────────────────────────────────────────────────┤
│  Single RPC Call: set_rls_context_from_staff(...)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ BEGIN;                                                  │    │
│  │ SET LOCAL app.casino_id = 'uuid-a';                     │    │
│  │ SET LOCAL app.actor_id = '...';                         │    │
│  │ SET LOCAL app.staff_role = '...';                       │    │
│  │ COMMIT;                                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │ Connection A    │  ← SET LOCAL persists    │
│                    │ (entire txn)    │     for entire txn       │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pattern Comparison

| Pattern | Pooling Safe | Performance | Complexity | Data Freshness |
|---------|-------------|-------------|------------|----------------|
| SET LOCAL loop (legacy) | NO | Medium | Low | Immediate |
| Transaction-wrapped RPC | YES | Medium | Medium | Immediate |
| JWT Claims only | YES | High | Low | On token refresh |
| **Pattern C (Hybrid)** | **YES** | **Medium-High** | **Medium** | **Immediate** |

### Pattern A: JWT-Based Only

```sql
CREATE POLICY "table_read_jwt"
  ON table FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );
```

**Pros**: No RPC needed, pooling-safe
**Cons**: Stale until token refresh, requires logout/login for role changes

### Pattern B: Transaction-Wrapped Only

```sql
CREATE POLICY "table_read_context"
  ON table FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = current_setting('app.casino_id', true)::uuid
  );
```

**Pros**: Always fresh, immediate updates
**Cons**: Fails if context not injected

### Pattern C: Hybrid (Recommended)

```sql
CREATE POLICY "table_read_hybrid"
  ON table FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Pros**: Best of both - fresh when context set, fallback to JWT
**Cons**: Slightly more complex policy

---

## Implementation

### Database RPC (ADR-024 Authoritative Pattern)

> **Note:** The old `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` is **DEPRECATED** (ADR-024).
> The current RPC is `set_rls_context_from_staff()` which derives context authoritatively from JWT + staff table.

```sql
CREATE OR REPLACE FUNCTION set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS TABLE(actor_id uuid, casino_id uuid, staff_role staff_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_staff_id uuid;
  v_jwt_staff_id uuid;
  v_casino_id uuid;
  v_staff_role text;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null';
  END IF;

  -- Get staff_id from JWT (authoritative source)
  v_jwt_staff_id := (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid;
  IF v_jwt_staff_id IS NULL THEN
    RAISE EXCEPTION 'JWT missing staff_id claim in app_metadata';
  END IF;

  -- Lookup staff record and validate user_id binding (INV-3)
  SELECT s.id, s.casino_id, s.role INTO v_staff_id, v_casino_id, v_staff_role
  FROM staff s
  WHERE s.id = v_jwt_staff_id
    AND s.user_id = v_user_id  -- Bind to auth.uid() (prevents mis-issued tokens)
    AND s.status = 'active';   -- INV-4: Block inactive staff

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff not found or inactive for user %', v_user_id;
  END IF;

  -- Set transaction-local context (INV-5: pooler-safe)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_staff_role, true);

  -- Correlation ID for tracing (capped length)
  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name',
      left(regexp_replace(p_correlation_id, '[^a-zA-Z0-9_-]', '', 'g'), 63),
      true);
  END IF;

  -- Return authoritative context (ADR-030 D1)
  RETURN QUERY SELECT v_staff_id, v_casino_id, v_staff_role::staff_role;
END;
$$;
```

### TypeScript API

```typescript
// lib/supabase/rls-context.ts

export interface RLSContext {
  actorId: string;   // staff.id
  casinoId: string;  // staff.casino_id
  staffRole: string; // staff.role
}

/**
 * Inject RLS context via set_rls_context_from_staff() RPC (ADR-024)
 *
 * Uses authoritative derivation — NO spoofable parameters.
 * RPC derives context from JWT + staff table lookup, then
 * RETURNS TABLE with the authoritative values.
 * Middleware populates ctx.rlsContext from the return value (ADR-030 D1).
 */
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  correlationId?: string,
): Promise<RLSContext> {
  const { data, error } = await supabase.rpc('set_rls_context_from_staff', {
    p_correlation_id: correlationId,
  });

  if (error) {
    throw new Error(`Failed to inject RLS context: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error('Failed to inject RLS context: RPC returned no data');
  }

  return {
    actorId: row.actor_id,
    casinoId: row.casino_id,
    staffRole: row.staff_role,
  };
}
```

### Server Action Integration

```typescript
// lib/server-actions/with-server-action-wrapper.ts

export async function withServerAction<T>(
  action: () => Promise<T>,
  options: {
    supabase: SupabaseClient<Database>;
    endpoint: string;
    action: string;
  },
): Promise<T> {
  // 1. Inject context via ADR-024 RPC (derives from JWT + staff table)
  // No spoofable parameters — context is authoritative
  const rlsContext = await injectRLSContext(
    options.supabase,
    `${options.endpoint}:${Date.now()}`
  );

  // 2. Execute action (RLS now enforced, ctx.rlsContext populated from return value)
  return await action();
}
```

---

## JWT Claims Sync (Phase 2)

For robustness, JWT claims are synced when staff records change:

### Database Trigger

```sql
-- Sync JWT claims when staff changes
CREATE FUNCTION sync_staff_jwt_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update auth.users.raw_app_meta_data
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(raw_app_meta_data, '{}'::jsonb),
        '{casino_id}', to_jsonb(NEW.casino_id::text)
      ),
      '{staff_id}', to_jsonb(NEW.id::text)
    ),
    '{staff_role}', to_jsonb(NEW.role::text)
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_staff_jwt_claims
  AFTER INSERT OR UPDATE OF casino_id, role ON staff
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION sync_staff_jwt_claims();
```

### TypeScript Sync

```typescript
// lib/supabase/auth-admin.ts

export async function syncUserRLSClaims(
  supabaseAdmin: SupabaseClient,
  userId: string,
  claims: {
    casino_id: string;
    staff_id: string;
    staff_role: string;
  }
): Promise<void> {
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: claims
  });
}
```

---

## NULLIF Explained

Why we use `NULLIF(current_setting('app.casino_id', true), '')`:

1. `current_setting('app.casino_id', true)` returns `''` (empty string) if not set
2. Empty string cast to UUID would fail
3. `NULLIF(value, '')` converts empty string to NULL
4. `COALESCE(NULL, jwt_fallback)` then uses JWT

```sql
-- Without NULLIF - fails on empty string
current_setting('app.casino_id', true)::uuid
-- Error: invalid input syntax for type uuid: ""

-- With NULLIF - properly falls back
COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
-- Returns JWT value when context is empty
```

---

## Migration Steps

### Phase 1: Transaction-Wrapped RPC (Implemented)

1. Create `set_rls_context_from_staff()` RPC (ADR-024) — **DONE**
2. Update `injectRLSContext()` to use authoritative RPC — **DONE**
3. Update `withServerAction` wrapper — **DONE**
4. Test context persistence across queries

### Phase 2: JWT Claims Integration

1. Add custom claims to `auth.users.app_metadata` on staff changes
2. Create database trigger for automatic sync
3. Add hybrid policies with JWT fallback
4. Monitor for policy failures

### Phase 3: Policy Modernization (Future)

1. Migrate all policies to Pattern C (Hybrid)
2. Phase out pure SET LOCAL dependencies
3. Keep session mode for admin/migration tasks only
4. Update SEC-001 documentation

---

## Verification

```sql
-- Test 1: Context persists within transaction (ADR-024 compliant)
BEGIN;
-- Derives context from JWT + staff table — no spoofable parameters
SELECT * FROM set_rls_context_from_staff(p_correlation_id := 'test-verification');

-- Should show values derived authoritatively
SELECT
  current_setting('app.actor_id', true) as actor,
  current_setting('app.casino_id', true) as casino,
  current_setting('app.staff_role', true) as role;

-- Query should use context
SELECT count(*) FROM visit;
COMMIT;

-- Test 2: JWT fallback works (SELECT only — Pattern C)
RESET ALL;
-- (Query as authenticated user with app_metadata)
SELECT count(*) FROM visit;
-- Should still return casino-scoped results via JWT fallback
```

---

## References

- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **Implementation**: `lib/supabase/rls-context.ts`
- **Migration**: `20251209183033_adr015_rls_context_rpc.sql`
- **Hybrid Policies**: `20251209183401_adr015_hybrid_rls_policies.sql`
- **JWT Sync**: `20251210001858_adr015_backfill_jwt_claims.sql`
- **Supabase Docs**: [Connection Pooling FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq)
