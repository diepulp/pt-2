# API Transport Layer Authentication Flow Audit

**Date:** 2025-12-14
**Auditor:** api-expert agent
**Scope:** Complete authentication flow from HTTP request to database execution
**Context:** AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md (GAP 2, GAP 5)

---

## Executive Summary

PT-2's API transport layer implements a **hybrid authentication model** that combines:
1. **User JWT from Supabase Auth** (anon key + session cookies)
2. **Transaction-wrapped RLS context injection** via `set_rls_context()` RPC
3. **JWT fallback** in RLS policies via `auth.jwt() -> 'app_metadata'`
4. **Dev-mode service role bypass** for local development

**Key Finding:** The architecture is **structurally sound** but exhibits **GAP 2 (ambiguous execution identity)** and **GAP 5 (implicit context dependencies)** as identified in the remediation document. This audit maps the complete flow and identifies specific leakage points.

**Risk Level:** MEDIUM - Auth model is correct but relies on implicit assumptions that could fail under edge cases (connection pooling, dev/prod parity, token staleness).

---

## Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT REQUEST                                                      │
│ fetch('/api/v1/rating-slips', {                                     │
│   headers: {                                                        │
│     'Cookie': 'sb-access-token=<JWT>',  ← User JWT (anon key)       │
│     'x-idempotency-key': '<uuid>',                                  │
│   }                                                                 │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ROUTE HANDLER (app/api/v1/rating-slips/route.ts)                   │
│ 1. createRequestContext(request) → requestId                        │
│ 2. createClient() → SupabaseClient (SSR, anon key + JWT cookies)   │
│ 3. withServerAction(supabase, handler, options)                     │
└─────────────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ MIDDLEWARE CHAIN (lib/server-actions/middleware/compositor.ts)     │
│                                                                     │
│ withTracing()     ← Outermost (error boundary)                      │
│   ↓                                                                 │
│ withAuth()        ← IDENTITY EXTRACTION POINT                       │
│   ├─ DEV MODE: isDevAuthBypassEnabled() ?                           │
│   │   ├─ YES → ctx.supabase = createServiceClient() ⚠️ SERVICE ROLE │
│   │   │         ctx.rlsContext = DEV_RLS_CONTEXT (mock)             │
│   │   └─ NO  → getAuthContext(ctx.supabase)                         │
│   │              ├─ supabase.auth.getUser() → user.id               │
│   │              ├─ SELECT from staff WHERE user_id = user.id       │
│   │              └─ return { actorId, casinoId, staffRole }         │
│   ↓                                                                 │
│ withRLS()         ← RLS CONTEXT INJECTION                           │
│   └─ injectRLSContext(supabase, rlsContext, correlationId)          │
│        └─ supabase.rpc('set_rls_context', {                         │
│              p_actor_id, p_casino_id, p_staff_role, p_correlation_id│
│           })  ← SECURITY DEFINER, single transaction                │
│   ↓                                                                 │
│ withIdempotency() ← Header validation only                          │
│   ↓                                                                 │
│ withAudit()       ← Post-execution logging                          │
│   ↓                                                                 │
│ handler(ctx)      ← SERVICE LAYER                                   │
└─────────────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL with RLS)                                      │
│                                                                     │
│ RLS Policy Evaluation (HYBRID PATTERN C):                          │
│ CREATE POLICY "rating_slip_read_casino"                             │
│   ON rating_slip FOR SELECT USING (                                 │
│     auth.uid() IS NOT NULL  ← Ensures user JWT present              │
│     AND casino_id = COALESCE(                                       │
│       NULLIF(current_setting('app.casino_id', true), '')::uuid,    │
│         ↑ From set_rls_context() (transaction-local)               │
│       (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid         │
│         ↑ JWT fallback (persistent across connections)             │
│     )                                                               │
│   );                                                                │
│                                                                     │
│ SECURITY DEFINER RPCs (privilege escalation points):               │
│ - set_rls_context()           ← Context injection (bypasses RLS)   │
│ - move_rating_slip()           ← Business logic RPC                 │
│ - close_rating_slip()          ← Business logic RPC                 │
│ - rpc_issue_mid_session_reward() ← Loyalty ledger append            │
│ - rpc_create_financial_txn()   ← Finance ledger append              │
│                                                                     │
│ Execution Identity:                                                 │
│ - User path: auth.uid() = <staff.user_id>                           │
│ - Dev mode: auth.uid() = NULL (service role)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## User-Path vs Service-Role Routes

### User-Path Routes (100% - All API Routes)

**Identity:** User JWT (anon key) + RLS context injection
**Client Type:** `createClient()` from `lib/supabase/server.ts` (SSR pattern)
**Key:** `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`

All 50+ route handlers in `app/api/v1/**/*.ts` follow this pattern:

```typescript
// File: /home/diepulp/projects/pt-2/app/api/v1/rating-slips/route.ts
const supabase = await createClient(); // ← SSR client with user JWT
const result = await withServerAction(
  supabase,
  async (mwCtx) => {
    // mwCtx.rlsContext contains { actorId, casinoId, staffRole }
    // mwCtx.supabase is the SAME user JWT client (unless dev mode)
    const service = createRatingSlipService(mwCtx.supabase);
    return service.start(...);
  },
  { domain: 'rating-slip', action: 'start', requireIdempotency: true }
);
```

**Domains audited:**
- `/api/v1/casino/**` - Casino management (5 routes)
- `/api/v1/casinos/**` - Multi-casino operations (3 routes)
- `/api/v1/rating-slips/**` - Rating slip lifecycle (8 routes)
- `/api/v1/visits/**` - Visit management (5 routes)
- `/api/v1/players/**` - Player enrollment (5 routes)
- `/api/v1/loyalty/**` - Loyalty operations (7 routes)
- `/api/v1/finance/**` - Financial transactions (2 routes)
- `/api/v1/mtl/**` - MTL compliance (3 routes)
- `/api/v1/tables/**` - Table management (6 routes)
- `/api/v1/table-context/**` - Chip custody (4 routes)
- `/api/v1/floor-layouts/**` - Floor planning (3 routes)

**Total:** 51 route handlers, ~1150 LOC

### Service-Role Routes (0 in Production)

**Finding:** Zero production API routes use service role client directly.

**Dev-Mode Exception:**
```typescript
// File: /home/diepulp/projects/pt-2/lib/server-actions/middleware/auth.ts:32-42
if (isDevAuthBypassEnabled()) {
  console.warn("[DEV AUTH] Using mock RLS context + service client");
  ctx.rlsContext = DEV_RLS_CONTEXT;
  ctx.supabase = createServiceClient(); // ⚠️ BYPASSES RLS
  return next();
}
```

**Condition:** `NODE_ENV === 'development' && DEV_AUTH_BYPASS !== 'false'`

**Purpose:** Allow local dev without Supabase Auth session

**Risk:** If `NODE_ENV=development` leaks to production, service role executes user operations.

---

## Identity Leakage Risks

### 1. Dev-Mode Service Role Leakage (HIGH)

**Location:** `/home/diepulp/projects/pt-2/lib/server-actions/middleware/auth.ts:32-42`

**Issue:** `withAuth()` middleware swaps user JWT client for service role client when dev bypass is enabled.

**Consequence:**
- All RLS policies bypassed (service role has `bypassrls` grant)
- `auth.uid()` returns NULL
- Operations execute as `postgres` user, not as authenticated staff
- Audit logs attribute actions to mock `DEV_RLS_CONTEXT.actorId`

**Attack Vector:** If `NODE_ENV=development` set in production (deployment misconfiguration), all user operations execute with service role privileges.

**Mitigation Status:** ⚠️ Partial
- Env check exists (`isDevMode()`)
- Console warning emitted
- **Missing:** Runtime assertion that service client is NEVER used when `NODE_ENV=production`

**Recommendation:**
```typescript
// Add to lib/supabase/service.ts:29
export function createServiceClient(): SupabaseClient<Database> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY: Service client forbidden in production');
  }
  // ... existing code
}
```

### 2. Implicit Context Dependencies (MEDIUM)

**Location:** All service methods rely on `ctx.rlsContext` being present

**Example:**
```typescript
// File: /home/diepulp/projects/pt-2/app/api/v1/rating-slips/route.ts:127-129
const slip = await service.start(
  mwCtx.rlsContext!.casinoId,  // ← Non-null assertion (!)
  mwCtx.rlsContext!.actorId,
  input,
);
```

**Issue:** TypeScript non-null assertion (`!`) bypasses compile-time safety. If `withAuth()` fails to populate `rlsContext`, runtime error occurs **inside service layer**, not at boundary.

**Gap Reference:** GAP 5 (Over-reliance on implicit context)

**Better Pattern:**
```typescript
// Explicit validation at route handler boundary
if (!mwCtx.rlsContext) {
  throw new DomainError('INTERNAL_ERROR', 'RLS context missing');
}
const { casinoId, actorId } = mwCtx.rlsContext;
const slip = await service.start(casinoId, actorId, input);
```

### 3. SECURITY DEFINER RPC Authorization (MEDIUM)

**Privileged RPCs:**
- `set_rls_context()` - Context injection (SECURITY DEFINER)
- `move_rating_slip()` - State machine transition
- `close_rating_slip()` - State machine transition
- `rpc_issue_mid_session_reward()` - Loyalty ledger append
- `rpc_create_financial_txn()` - Finance ledger append

**Pattern:**
```sql
-- File: /home/diepulp/projects/pt-2/supabase/migrations/20251209183033_adr015_rls_context_rpc.sql:7-8
CREATE OR REPLACE FUNCTION set_rls_context(...)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

**Issue:** `SECURITY DEFINER` runs as function owner (postgres), bypassing RLS. If RPC doesn't explicitly validate authorization, caller-provided args are trusted.

**Audit Required:**
- [ ] Inventory all `SECURITY DEFINER` functions (10+ migrations)
- [ ] For each: verify explicit `casino_id` validation against `auth.jwt()`
- [ ] Ensure audit trail for privileged operations

**Example Safe Pattern:**
```sql
CREATE FUNCTION move_rating_slip(..., p_casino_id uuid)
SECURITY DEFINER AS $$
DECLARE
  v_jwt_casino_id uuid;
BEGIN
  -- Explicit authorization check
  v_jwt_casino_id := (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid;
  IF p_casino_id != v_jwt_casino_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Casino mismatch';
  END IF;
  -- ... business logic
END;
$$;
```

### 4. JWT Staleness (LOW)

**Issue:** `app_metadata.casino_id` is set at login via `syncUserRLSClaims()`. If staff member's casino assignment changes, JWT remains stale until re-login.

**Location:** `/home/diepulp/projects/pt-2/lib/supabase/auth-admin.ts:64-83`

**Mitigation:** Hybrid RLS policies use `COALESCE(current_setting(...), auth.jwt())`, so `set_rls_context()` overrides stale JWT claims.

**Risk:** If `withRLS()` middleware is skipped (via `skipAuth: true`), policies fall back to stale JWT claims.

---

## Implicit Context Dependencies

### Middleware Ordering Dependency

**Critical Path:** `withAuth()` → `withRLS()` → handler

**File:** `/home/diepulp/projects/pt-2/lib/server-actions/middleware/compositor.ts:106-109`

```typescript
if (!options.skipAuth) {
  middlewares.push(withAuth<T>());
  middlewares.push(withRLS<T>());
}
```

**Implicit Contract:**
1. `withAuth()` MUST populate `ctx.rlsContext`
2. `withRLS()` MUST run after `withAuth()` (depends on `ctx.rlsContext`)
3. Handler MUST NOT execute if auth chain fails

**Failure Mode:** If middleware order is reversed or `withAuth()` fails silently, `withRLS()` throws:
```typescript
// File: /home/diepulp/projects/pt-2/lib/server-actions/middleware/rls.ts:23-27
if (!ctx.rlsContext) {
  throw new DomainError(
    'INTERNAL_ERROR',
    'RLS context not available - withAuth must run first',
  );
}
```

**Recommendation:** Make dependency explicit via TypeScript branded types:
```typescript
type AuthenticatedContext = MiddlewareContext & {
  rlsContext: RLSContext; // No optional (?)
};

export function withRLS<T>(): Middleware<T, AuthenticatedContext> {
  return async (ctx: AuthenticatedContext, next) => {
    // TypeScript enforces that ctx.rlsContext exists
    await injectRLSContext(ctx.supabase, ctx.rlsContext, ctx.correlationId);
    return next();
  };
}
```

### Service Method Casino Scope Assumption

**Pattern:** Services assume `casino_id` in DB matches RLS context.

**File:** `/home/diepulp/projects/pt-2/lib/supabase/rls-context.ts:111-117`

```typescript
export function assertCasinoScope(context: RLSContext, casinoId: string): void {
  if (context.casinoId !== casinoId) {
    throw new Error(
      `FORBIDDEN: Operation targets casino ${casinoId} but user is scoped to ${context.casinoId}`,
    );
  }
}
```

**Usage:** Rarely called explicitly. Most services trust RLS to enforce scope.

**Gap:** If RLS policy has bug or `set_rls_context()` is bypassed, service operates on wrong casino's data.

**Recommendation:** Enforce `assertCasinoScope()` in all write operations:
```typescript
// In service method
async function closeRatingSlip(slipId: string, ctx: RLSContext) {
  const { data: slip } = await supabase
    .from('rating_slip')
    .select('casino_id')
    .eq('id', slipId)
    .single();

  assertCasinoScope(ctx, slip.casino_id); // ← Explicit validation
  // ... proceed with close
}
```

---

## Connection Pooling and Transaction Boundaries

### ADR-015 Compliance

**Pattern:** Transaction-wrapped RLS context injection via `set_rls_context()` RPC

**File:** `/home/diepulp/projects/pt-2/lib/supabase/rls-context.ts:88-103`

```typescript
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_rls_context", {
    p_actor_id: context.actorId,
    p_casino_id: context.casinoId,
    p_staff_role: context.staffRole,
    p_correlation_id: correlationId,
  });
  // Single RPC call = single transaction
}
```

**Database Implementation:**
```sql
-- File: supabase/migrations/20251209183033_adr015_rls_context_rpc.sql:1-20
CREATE OR REPLACE FUNCTION set_rls_context(...)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);
  -- All SET LOCAL in same transaction (third param = true)
END;
$$;
```

**Compliance Status:** ✅ COMPLIANT
- All `SET LOCAL` statements execute in single RPC transaction
- Subsequent queries inherit transaction-local config
- Works with Supabase transaction-mode pooling (port 6543)

**Validation:** Integration test at `/home/diepulp/projects/pt-2/lib/supabase/__tests__/rls-pooling-safety.integration.test.ts`

### Multi-Step Workflow Concern

**Issue:** If a single user action requires multiple RPC calls (e.g., close + reopen), each RPC gets a fresh pooled connection.

**Example:**
```typescript
// Step 1: Close current slip
await supabase.rpc('close_rating_slip', { p_slip_id });
// Step 2: Start new slip
await supabase.rpc('start_rating_slip', { ... });
```

**Risk:** If `set_rls_context()` is called once before both RPCs, second RPC may run on different connection without context.

**Current Mitigation:** Each RPC is SECURITY DEFINER and re-validates `auth.jwt()` claims internally (per SEC-007 hardening).

**Better Pattern (Future):** Atomic multi-step RPC:
```sql
CREATE FUNCTION close_and_restart_slip(...) SECURITY DEFINER AS $$
BEGIN
  -- Inject context once
  PERFORM set_rls_context(...);
  -- Both operations in same transaction
  PERFORM close_rating_slip(...);
  PERFORM start_rating_slip(...);
END;
$$;
```

---

## Audit Trail Compliance

### Audit Log Coverage

**File:** `/home/diepulp/projects/pt-2/lib/server-actions/middleware/audit.ts:73-98`

```typescript
async function writeAuditEntry<T>(ctx: MiddlewareContext, result: ServiceResult<T>) {
  const payload = {
    casino_id: ctx.rlsContext?.casinoId ?? null,  // ← Optional chaining
    domain: ctx.domain ?? ctx.endpoint ?? 'unknown',
    actor_id: ctx.rlsContext?.actorId ?? null,
    action: ctx.action ?? 'unknown',
    details: toJson({
      correlationId: ctx.correlationId,
      idempotencyKey: ctx.idempotencyKey ?? null,
      durationMs: Date.now() - ctx.startedAt,
      ok: result.ok,
      code: result.code,
      error: result.error ?? null,
    }),
  };
  await ctx.supabase.from('audit_log').insert(payload);
}
```

**Coverage:**
- ✅ Correlation ID propagation
- ✅ Actor attribution (`actor_id` from RLS context)
- ✅ Casino scope (`casino_id` from RLS context)
- ✅ Domain/action classification
- ✅ Success/failure tracking

**Gaps:**
- ⚠️ Optional `ctx.rlsContext` - if `withAuth()` skipped, audit log has NULL actor/casino
- ⚠️ Production-only (`if (process.env.NODE_ENV === 'production')`) - dev actions unaudited
- ⚠️ Fire-and-forget (errors logged but don't fail request) - could lose audit trail

**Recommendation:**
```typescript
// Make audit mandatory for mutations
if (ctx.action && ctx.action !== 'read' && !ctx.rlsContext) {
  throw new DomainError('INTERNAL_ERROR', 'Cannot audit mutation without RLS context');
}
```

### Privileged Operation Audit

**SECURITY DEFINER RPCs:** No systematic audit trail inside RPC bodies.

**Example Missing:** `move_rating_slip()` RPC doesn't write to `audit_log` directly.

**Current Pattern:** Audit happens in middleware AFTER RPC returns. If RPC throws, audit still fires (middleware catches error).

**Gap:** If RPC is called directly (e.g., via SQL client, not via API), no audit.

**Recommendation:** Add `INSERT INTO audit_log` inside all SECURITY DEFINER RPCs:
```sql
CREATE FUNCTION move_rating_slip(...) SECURITY DEFINER AS $$
BEGIN
  -- Business logic
  UPDATE rating_slip SET table_id = p_new_table_id WHERE id = p_slip_id;

  -- Explicit audit
  INSERT INTO audit_log (casino_id, actor_id, domain, action, details)
  VALUES (
    p_casino_id,
    (auth.jwt() ->> 'staff_id')::uuid,
    'rating-slip',
    'move',
    jsonb_build_object('slip_id', p_slip_id, 'new_table_id', p_new_table_id)
  );
END;
$$;
```

---

## Recommendations

### Immediate (Pre-MVP Release)

1. **[HIGH] Production Service Role Guard**
   ```typescript
   // File: /home/diepulp/projects/pt-2/lib/supabase/service.ts:29
   export function createServiceClient(): SupabaseClient<Database> {
     if (process.env.NODE_ENV === 'production') {
       throw new Error('SECURITY: Service client forbidden in production runtime');
     }
     // ... existing code
   }
   ```

2. **[HIGH] Explicit RLS Context Validation**
   ```typescript
   // In all route handlers before service calls
   if (!mwCtx.rlsContext) {
     throw new DomainError('INTERNAL_ERROR', 'RLS context required');
   }
   ```

3. **[MEDIUM] SECURITY DEFINER Inventory & Audit**
   - [ ] Document all SECURITY DEFINER functions (10+ found)
   - [ ] Add explicit `casino_id` validation to each
   - [ ] Add audit log writes inside privileged RPCs

### Short-Term (Post-MVP Hardening)

4. **[MEDIUM] Typed Middleware Dependencies**
   ```typescript
   type AuthenticatedContext = MiddlewareContext & { rlsContext: RLSContext };
   export function withRLS<T>(): Middleware<T, AuthenticatedContext>;
   ```

5. **[MEDIUM] Casino Scope Assertions**
   ```typescript
   // Enforce in all write operations
   assertCasinoScope(ctx.rlsContext, slip.casino_id);
   ```

6. **[LOW] Mandatory Audit for Mutations**
   ```typescript
   // Fail request if audit write fails for mutations
   if (isMutation && auditError) {
     throw new DomainError('INTERNAL_ERROR', 'Audit write failed');
   }
   ```

### Long-Term (JWT-First Migration)

7. **[STRATEGIC] Migrate to JWT-Only RLS (ADR-015 Phase 3)**
   - Deprecate `set_rls_context()` RPC
   - Rely solely on `auth.jwt() -> 'app_metadata'`
   - Eliminate session variable dependencies
   - **Benefit:** Perfect connection pooling safety, simpler auth model

8. **[STRATEGIC] Atomic Multi-Step RPCs**
   - Combine `close + reopen` into single RPC
   - Eliminate multi-call transaction boundary issues

---

## Conclusion

**Overall Assessment:** The authentication transport layer is **architecturally sound** but exhibits **operational complexity** due to hybrid pattern (session vars + JWT fallback + dev bypass).

**Key Strengths:**
- ✅ Consistent user JWT enforcement across all API routes
- ✅ ADR-015 compliant transaction-wrapped context injection
- ✅ Zero production service role leakage (currently)
- ✅ Comprehensive middleware chain (auth → RLS → idempotency → audit)

**Key Weaknesses:**
- ⚠️ Dev-mode service role bypass creates identity ambiguity (GAP 2)
- ⚠️ Implicit RLS context dependencies (non-null assertions) (GAP 5)
- ⚠️ SECURITY DEFINER RPCs lack systematic authorization checks
- ⚠️ Audit trail relies on optional context (could be NULL)

**Risk Mitigation Priority:**
1. Add production guard to `createServiceClient()` (5 minutes)
2. Explicit context validation in route handlers (1 hour)
3. SECURITY DEFINER inventory and hardening (2-3 days)
4. Migrate to JWT-only pattern (1-2 weeks, post-MVP)

**References:**
- `docs/issues/AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md` - Original gap analysis
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - RLS architecture
- `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy inventory
- `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` - Middleware chain
