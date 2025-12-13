# Security & Tenancy Upgrade - RLS Pattern Canonicalization

**Status**: MANDATORY (Enforced at edge + database layer)
**Effective**: 2025-11-09
**Updated**: 2025-12-12
**Purpose**: Eliminate privilege escalation via service keys; enforce multi-tenant isolation via RLS
**Related**: ADR-015 (Connection Pooling), ADR-018 (SECURITY DEFINER Governance), SEC-006 (RLS Audit)

> **⚠️ ADR-015 UPDATE (2025-12-10)**: This document has been superseded by ADR-015 for connection pooling strategy. The `exec_sql` pattern documented below is **DEPRECATED**. Use `set_rls_context()` RPC instead.
>
> **Canonical Reference**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
> **Updated Patterns**: `docs/30-security/SEC-001-rls-policy-matrix.md`

---

## TL;DR

**❌ BANNED:**
```sql
-- Complex OR trees in RLS policies
create policy "read access"
  on visit for select using (
    auth.jwt() ->> 'casino_id' = casino_id::text
    OR auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'permissions' @> '["visit.read"]'::jsonb
  );

-- Service keys in runtime
const supabase = createClient(url, SERVICE_KEY); // ❌ Privilege escalation risk
```

**✅ REQUIRED:**
```sql
-- Hybrid RLS pattern: transaction context + JWT fallback (ADR-015 Pattern C)
create policy "visit read hybrid"
  on visit for select using (
    -- Verify authenticated staff (actor_id from SET LOCAL or JWT staff_id)
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Always use anon key with user context
const supabase = createClient(url, ANON_KEY); // ✅ User context only
```

---

## Problem Statement

### Pitfalls (Current State)

1. **Complex OR trees in RLS**: Hard to audit, prone to logic errors
   ```sql
   -- ❌ BEFORE: 6-way OR with nested conditions
   using (
     (auth.jwt() ->> 'casino_id')::uuid = casino_id
     OR auth.jwt() ->> 'role' = 'admin'
     OR auth.jwt() ->> 'super_admin' = 'true'
     OR auth.jwt() ->> 'permissions' @> '["global.read"]'
     OR casino_id in (select casino_id from user_casino_access where user_id = auth.uid())
     OR public_access = true
   )
   ```
   **Risk**: Accidental bypass via incomplete conditions, hard to validate

2. **Accidental privilege via service keys**: Server actions running with elevated permissions
   ```typescript
   // ❌ BEFORE: Service key bypasses RLS
   const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
   await supabase.from('visit').select('*'); // Reads ALL casinos!
   ```
   **Risk**: Cross-tenant data leakage, privilege escalation

3. **Unvalidated JWT claim reliance (legacy)**: Policies depended solely on JWT claims without DB context
   ```typescript
   // ❌ BEFORE: RLS reads from JWT claims
   auth.jwt() ->> 'casino_id'
   auth.jwt() ->> 'permissions'
   ```
   **Risk**: Token size bloat, stale claims, inconsistent state. **ADR-015 Fix**: Keep claims lean (`casino_id`, `staff_id`, `staff_role`) and use them only as fallback to transaction context.

---

## Solution Architecture

### 1. Canonical RLS Pattern (ADR-015 Hybrid)

**Pattern (Pattern C - Hybrid with JWT fallback):**
```sql
-- Enable RLS
alter table visit enable row level security;

-- Canonical read policy (connection-pooling safe)
create policy "visit read hybrid"
  on visit for select using (
    -- Actor identity check (transaction context OR JWT staff_id)
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    -- Casino scope check (transaction context OR JWT casino_id)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Canonical write policy (role-gated, hybrid)
create policy "visit insert authorized roles"
  on visit for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Why this works (ADR-015 compliant):**
1. **`auth.uid()`**: Validates user is authenticated (Supabase auth)
2. **`current_setting('app.actor_id')` / `current_setting('app.casino_id')`**: Injected by `set_rls_context()` via `SET LOCAL` (transaction scoped)
3. **JWT fallback (`auth.jwt() -> 'app_metadata'`)**: Survives connection pooling when context is absent
4. **COALESCE/NULLIF**: Prevents empty-string settings from bypassing policies
5. **No OR trees**: Single, deterministic path with explicit fallback

---

### 2. RLS Context Injection (Middleware)

> **⚠️ DEPRECATED**: The `exec_sql` pattern below fails with Supabase connection pooling. See ADR-015 for the current implementation using `set_rls_context()` RPC.

**Current Implementation** (`lib/supabase/rls-context.ts`) - **ADR-015 Compliant**:

```typescript
export interface RLSContext {
  actorId: string;  // staff.id
  casinoId: string; // staff.casino_id
  staffRole: string; // staff.role
}

/**
 * Get authenticated user's casino context
 *
 * Flow:
 * 1. auth.getUser() → user_id
 * 2. Query staff table: user_id → staff.id, casino_id, role
 * 3. Validate staff is active and has casino assignment
 */
export async function getAuthContext(
  supabase: SupabaseClient<Database>,
): Promise<RLSContext> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('UNAUTHORIZED: No authenticated user');
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, casino_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['pit_boss', 'admin']) // Exclude dealers (non-authenticated)
    .single();

  if (staffError || !staff || !staff.casino_id) {
    throw new Error('FORBIDDEN: User is not active staff with casino assignment');
  }

  return {
    actorId: staff.id,
    casinoId: staff.casino_id,
    staffRole: staff.role,
  };
}

/**
 * Inject RLS context via set_rls_context() RPC (ADR-015)
 *
 * Uses transaction-wrapped RPC to ensure all SET LOCAL statements
 * execute in the same transaction - connection pooling safe.
 */
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  await supabase.rpc('set_rls_context', {
    p_actor_id: context.actorId,
    p_casino_id: context.casinoId,
    p_staff_role: context.staffRole,
    p_correlation_id: correlationId,
  });
}
```

**Database RPC** (Migration `20251209183033_adr015_rls_context_rpc.sql`):

```sql
CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);
  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;
```

**Hybrid enforcement:** Policies use ADR-015 Pattern C (`COALESCE(current_setting(...), auth.jwt()->'app_metadata'...)`). `set_rls_context()` supplies deterministic `actor_id`/`casino_id`/`staff_role` values; JWT claims provide a pooling-safe fallback when context is not set (e.g., direct Supabase client queries).

<details>
<summary>❌ Legacy Pattern (DEPRECATED - fails with connection pooling)</summary>

```typescript
// ❌ DEPRECATED: exec_sql loop pattern
export async function injectRLSContext(
  supabase: SupabaseClient<Database>,
  context: RLSContext,
  correlationId?: string,
): Promise<void> {
  await supabase.rpc('exec_sql', {
    sql: `
      SET LOCAL app.actor_id = '${context.actorId}';
      SET LOCAL app.casino_id = '${context.casinoId}';
      SET LOCAL app.staff_role = '${context.staffRole}';
      ${correlationId ? `SET LOCAL application_name = '${correlationId}';` : ''}
    `
  });
}
```

**Why this fails**: Supabase Supavisor uses transaction-mode pooling (port 6543). Each RPC call may execute on a different connection, causing `SET LOCAL` to be lost before subsequent queries execute.

</details>

---

### 3. WRAPPER Integration

**Updated `withServerAction`** (`lib/server-actions/with-server-action-wrapper.ts`):

```typescript
export async function withServerAction<T>(
  handler: ServerActionHandler<T>,
  context: ServerActionContext,
): Promise<ServiceResult<T>> {
  const execute = async () => {
    // 1. Get authenticated context (validates auth.uid() → staff)
    const rlsContext = await getAuthContext(context.supabase);

    // 2. Inject RLS context via SET LOCAL
    await injectRLSContext(context.supabase, rlsContext, requestId);

    // 3. Rate limiting (uses rlsContext)
    if (context.endpoint) {
      await rateLimiter.checkLimit(context.endpoint, {
        actorId: rlsContext.actorId,
        casinoId: rlsContext.casinoId,
      });
    }

    // 4. Execute handler with RLS context active
    const result = await handler();

    // 5. Audit log (uses rlsContext)
    await writeAuditLog(context.supabase, {
      ...context,
      userId: rlsContext.actorId,
      casinoId: rlsContext.casinoId,
    }, result);

    return result;
  };

  return runWithCorrelation(requestId, execute);
}
```

**Middleware Flow:**
```
Request → withServerAction → getAuthContext → injectRLSContext → handler → RLS policies
                                   ↓                    ↓
                            auth.uid() → staff     SET LOCAL app.*
```

---

### 4. No Service Keys in Runtime

**✅ CORRECT: Use anon key + user context**

```typescript
// lib/supabase/server.ts
export const createClient = async (): Promise<SupabaseClient<Database>> => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ✅ Anon key only
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { /* ... */ },
      },
    },
  );
};
```

**❌ FORBIDDEN:**
```typescript
// ❌ NEVER DO THIS
const supabase = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ❌ Bypasses RLS!
);
```

**When to use service key (rare):**
- Background jobs with no user context (must still set `app.casino_id`)
- System migrations
- Admin scripts (must audit all operations)

---

## Dealer Role Exception

**CRITICAL**: Dealers are **not authenticated** and do not require `user_id` linkage.

### Dealer Role Characteristics

- **Non-Authenticated**: Dealer records in `staff` table have `user_id = null`
- **No Login**: Dealers cannot log in to the application
- **No RLS Context**: Dealers have no `app.actor_id` injection (cannot execute authenticated queries)
- **Scheduling Only**: Dealer rotations are managed by pit boss/admin roles via administrative APIs

### Implementation Requirements

**1. Staff Query Filtering**

When querying staff for authentication context, **exclude dealers**:

```typescript
const { data: staff } = await supabase
  .from('staff')
  .select('id, casino_id, role')
  .eq('user_id', user.id)
  .in('role', ['pit_boss', 'admin']) // ✅ Exclude dealers
  .single();
```

**2. RLS Policies**

All RLS policies that reference `staff.user_id` automatically exclude dealers (since `user_id = null`):

```sql
create policy "visit_read_same_casino"
  on visit for select using (
    -- Dealers cannot satisfy this condition (user_id = null)
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**3. Rotation Management**

Dealer rotations are administrative operations performed **by authenticated staff**:

```typescript
// ✅ CORRECT: Pit boss starts dealer rotation
export async function startDealerRotation(input: {
  tableId: string;
  dealerId: string; // References staff.id where role = 'dealer'
}) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context is pit_boss (authenticated)
      // Dealer is the subject of the rotation, not the actor
      const { data } = await supabase
        .from('dealer_rotation')
        .insert({
          table_id: input.tableId,
          staff_id: input.dealerId,
          started_at: new Date().toISOString(),
        });

      return data;
    },
    { supabase, endpoint: 'table-context.start-rotation' }
  );
}
```

### Validation Queries

**Verify dealer records have no user_id**:
```sql
select count(*) from staff
where role = 'dealer' and user_id is not null;
-- Should return 0
```

**Verify authenticated staff have user_id**:
```sql
select count(*) from staff
where role in ('pit_boss', 'admin') and user_id is null;
-- Should return 0
```

### See Also

- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` - Dealer Role Semantics section
- Migration `20251110231330_dealer_role_clarification.sql` - Schema documentation
- `docs/audits/DEALER_ROLE_BLAST_RADIUS_AUDIT_NOV_10.md` - Complete analysis

---

## RLS Policy Templates

### Template 1: Read Access (Hybrid - ADR-015 Pattern C)

```sql
create policy "{table}_read_hybrid"
  on {schema}.{table}
  for select using (
    -- Verify authenticated staff
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    -- Verify casino scope (SET LOCAL + JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Template 2: Write Access (Role-Gated, Hybrid)

```sql
create policy "{table}_insert_authorized_roles"
  on {schema}.{table}
  for insert with check (
    -- Verify authenticated user with required role
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('pit_boss', 'admin')
      and status = 'active'
    )
    -- Verify casino scope
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Template 3: Append-Only Ledger (Hybrid)

```sql
-- Insert only (no updates/deletes)
create policy "{table}_append_authorized"
  on {schema}.{table}
  for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('cashier', 'admin')
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Explicitly deny updates
create policy "{table}_no_updates"
  on {schema}.{table}
  for update using (false);

-- Explicitly deny deletes
create policy "{table}_no_deletes"
  on {schema}.{table}
  for delete using (false);
```

### Template 4: Admin Override (Hybrid, Global Access)

```sql
create policy "{table}_admin_global_access"
  on {schema}.{table}
  for all using (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role = 'admin'
      and status = 'active'
    )
  );
```

**NOTE:** Use admin override sparingly. Prefer casino-scoped hybrid policies.

---

### Template 5: SECURITY DEFINER Context Validation (MANDATORY - ADR-018)

**Use For**: All SECURITY DEFINER functions that accept `p_casino_id` as a parameter

> **⚠️ MANDATORY (ADR-018)**: All SECURITY DEFINER functions bypass RLS entirely. Functions accepting `p_casino_id` MUST validate against authenticated context to prevent privilege escalation. See `docs/80-adrs/ADR-018-security-definer-governance.md`.

**Pattern (SEC-006 Hardened)**:

```sql
CREATE OR REPLACE FUNCTION rpc_example_mutation(
  p_casino_id uuid,
  p_other_params text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, ADR-018)
  -- MANDATORY for all SECURITY DEFINER functions accepting p_casino_id
  -- ═══════════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Proceed with mutation only after validation passes
  INSERT INTO table_name (casino_id, ...) VALUES (p_casino_id, ...);
END;
$$;
```

**Why This Is Critical**:
- SECURITY DEFINER functions run with function owner's privileges, **bypassing all RLS**
- Without validation, caller-provided `p_casino_id` enables cross-tenant data access
- SEC-006 audit identified 7 vulnerable RPCs (now hardened)

**Hardened Functions (SEC-006)**:
| Function | Service | Validation Added |
|----------|---------|------------------|
| `rpc_create_floor_layout` | FloorLayoutService | ✅ 2025-12-12 |
| `rpc_activate_floor_layout` | FloorLayoutService | ✅ 2025-12-12 |
| `rpc_log_table_inventory_snapshot` | TableContextService | ✅ 2025-12-12 |
| `rpc_request_table_fill` | TableContextService | ✅ 2025-12-12 |
| `rpc_request_table_credit` | TableContextService | ✅ 2025-12-12 |
| `rpc_log_table_drop` | TableContextService | ✅ 2025-12-12 |
| `rpc_issue_mid_session_reward` | LoyaltyService | ✅ 2025-12-12 |

---

### Template 6: Derived Casino Scope (Subquery Pattern)

**Use For**: Tables without direct `casino_id` that derive scope from parent FK

> **SEC-006 Pattern**: For tables like `floor_layout_version`, `floor_pit`, `floor_table_slot` that reference parent tables containing the `casino_id`.

**Pattern (Pattern C variant with EXISTS subquery)**:

```sql
-- For tables deriving casino_id from parent (e.g., floor_pit → floor_layout_version → floor_layout)
CREATE POLICY floor_pit_select_same_casino ON floor_pit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_pit.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
  );
```

**When to Use**:
- Child tables with no direct `casino_id` column
- Multi-level hierarchies (slot → version → layout → casino)
- Preserves normalization while enforcing RLS

**Applied To (SEC-006)**:
- `floor_layout_version` → via `layout_id` → `floor_layout.casino_id`
- `floor_pit` → via `layout_version_id` → `floor_layout_version.layout_id` → `floor_layout.casino_id`
- `floor_table_slot` → via `layout_version_id` → `floor_layout_version.layout_id` → `floor_layout.casino_id`

---

## Migration Guide

### Step 1: Add `user_id` to `staff` Table

```sql
-- Migration: Add user_id column linking to auth.users
alter table staff add column user_id uuid references auth.users(id);

-- Backfill (production must be done carefully)
-- Option A: Manual assignment via admin tool
-- Option B: Invite flow that creates auth.users + staff records atomically

-- Create unique index (partial to allow null for dealers)
create unique index staff_user_id_unique on staff(user_id) where user_id is not null;
```

**IMPORTANT**: Do NOT add `NOT NULL` constraint. The `user_id` column must remain nullable to support the dealer role (see Dealer Role Exception below).

### Step 2: Create `set_rls_context` RPC (ADR-015)

> **Note**: The legacy `exec_sql` RPC has been replaced with `set_rls_context()` per ADR-015.

```sql
-- Migration: 20251209183033_adr015_rls_context_rpc.sql
CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);
  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;
```

**Why this is better than `exec_sql`:**
- All `SET LOCAL` statements execute in a single transaction
- Connection pooling safe (works with Supavisor transaction mode)
- Typed parameters prevent SQL injection
- Strongly typed function signature

### Step 3: Migrate RLS Policies (Table by Table)

**Example: `visit` table (Hybrid Pattern C)**

```sql
-- Drop existing policies (if any)
drop policy if exists "visit_read_access" on visit;

-- Enable RLS
alter table visit enable row level security;

-- Apply canonical hybrid policies (connection pooling safe)
create policy "visit_read_hybrid"
  on visit for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

create policy "visit_insert_authorized"
  on visit for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Step 4: Update Server Actions

```typescript
// app/actions/visit.ts

export async function checkInAction(input: CheckInInput) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // Handler automatically has RLS context injected
      const { data, error } = await supabase
        .from('visit')
        .insert({
          player_id: input.playerId,
          casino_id: input.casinoId, // Must match current_setting('app.casino_id')
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      supabase,
      endpoint: 'visit.check-in',
      action: 'visit.create',
    },
  );
}
```

### Step 5: Validate RLS Enforcement

```sql
-- Test RLS as different users
set local app.actor_id = 'staff-uuid-1';
set local app.casino_id = 'casino-uuid-1';

-- Should return only casino-1 visits
select * from visit;

-- Should fail (cross-casino access)
insert into visit (player_id, casino_id, started_at)
values ('player-uuid', 'casino-uuid-2', now());
```

---

## RLS Policy Matrix (By Service)

> **SEC-006 Update (2025-12-12)**: FloorLayoutService tables now have full RLS coverage with Pattern C policies. Tables without direct `casino_id` use Template 6 (subquery pattern).

| Service | Tables | Read Policy | Write Policy | Notes |
|---------|--------|-------------|--------------|-------|
| **Casino** | `staff`, `casino_settings` | Same casino | Admin only | Root authority |
| **Player** | `player_casino` | Same casino | Enrollment service | Membership writes |
| **Visit** | `visit` | Same casino | Pit boss, admin | Session lifecycle |
| **Loyalty** | `player_loyalty`, `loyalty_ledger` | Same casino | RPC only (append) | Idempotency enforced; denial policies |
| **Finance** | `player_financial_transaction` | Same casino | RPC only (append) | Append-only ledger |
| **MTL** | `mtl_entry`, `mtl_audit_note` | Compliance roles | Cashier, compliance | Immutable log; denial policies |
| **Table Context** | `gaming_table`, `dealer_rotation`, `table_*` | Operations staff | Pit boss, admin | RPCs hardened (Template 5) |
| **Rating Slip** | `rating_slip` | Same casino | Telemetry service | Policy snapshot |
| **Floor Layout** | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | Same casino (Template 1 + Template 6) | Pit boss, admin; Delete: admin only | **SEC-006**: Full RLS; subquery pattern for derived tables; RPCs hardened (Template 5) |

---

## Anti-Patterns

### ❌ DON'T: Complex OR trees

```sql
-- ❌ BAD: 6-way OR (hard to audit)
using (
  casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
  OR current_setting('app.staff_role') = 'admin'
  OR current_setting('app.permissions')::jsonb @> '["global.read"]'::jsonb
  OR ...
)
```

### ✅ DO: Single deterministic path

```sql
-- ✅ GOOD: One path (easy to audit)
using (
  auth.uid() = (
    select user_id
    from staff
    where id = COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    )
  )
  AND casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
)
```

### ❌ DON'T: Service keys in runtime

```typescript
// ❌ BAD: Bypasses RLS
const supabase = createClient(url, SERVICE_ROLE_KEY);
```

### ✅ DO: Anon key + user context

```typescript
// ✅ GOOD: Enforces RLS
const supabase = createClient(url, ANON_KEY);
```

### ❌ DON'T: JWT claim business logic

```sql
-- ❌ BAD: Stale claims, token bloat
using (auth.jwt() ->> 'casino_id' = casino_id::text)
```

### ✅ DO: Database session context

```sql
-- ✅ GOOD: Fresh from DB, SET LOCAL controlled with JWT fallback (ADR-015)
using (
  casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
)
```

---

## Audit & Validation

### CI Checklist

- [ ] All tables with `casino_id` have RLS enabled
- [ ] All RLS policies use hybrid `COALESCE()` pattern (ADR-015 Pattern C)
- [ ] All RLS policies validate `auth.uid() IS NOT NULL`
- [ ] No service key usage in runtime code (search for `SERVICE_ROLE_KEY`)
- [ ] All server actions use `withServerAction` wrapper
- [ ] `staff` table has `user_id` column
- [ ] `set_rls_context()` RPC exists (Migration `20251209183033`)
- [ ] No legacy `exec_sql` loop pattern in codebase

### Manual Testing

```sql
-- Test RLS enforcement using set_rls_context() RPC (ADR-015)
SELECT set_rls_context(
  p_actor_id := '00000000-0000-0000-0000-000000000001',
  p_casino_id := '00000000-0000-0000-0000-000000000001',
  p_staff_role := 'pit_boss',
  p_correlation_id := 'test-correlation-id'
);

-- Should return only casino-1 visits
SELECT count(*) FROM visit;

-- Test cross-casino isolation
INSERT INTO visit (player_id, casino_id, started_at)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', now());
-- Expected: violates row-level security policy (casino_id mismatch)

-- Test hybrid fallback (JWT claims)
-- Ensure test user has app_metadata.casino_id AND app_metadata.staff_id set in Supabase Auth
-- Run in a new session WITHOUT calling set_rls_context() to validate fallback
SELECT count(*) FROM visit;
-- Should still return casino-scoped results via JWT fallback (Pattern C)
```

---

## References

- **ADR-015 (Canonical)**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Connection pooling, Pattern C
- **ADR-018**: `docs/80-adrs/ADR-018-security-definer-governance.md` - SECURITY DEFINER function governance
- **SEC-001**: `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy matrix and templates
- **SEC-006**: `docs/30-security/SEC-006-rls-strategy-audit-2025-12-11.md` - RLS audit findings and remediation
- **RLS Context**: `lib/supabase/rls-context.ts`
- **JWT Sync**: `lib/supabase/auth-admin.ts` (Phase 2 JWT claims)
- **WRAPPER Integration**: `lib/server-actions/with-server-action-wrapper.ts`
- **SRM Security Section**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **RPC Migration**: `supabase/migrations/20251209183033_adr015_rls_context_rpc.sql`
- **JWT Backfill Migration**: `supabase/migrations/20251210001858_adr015_backfill_jwt_claims.sql`
- **SEC-006 Migration**: `supabase/migrations/20251212080915_sec006_rls_hardening.sql` - FloorLayout RLS + RPC hardening

---

**Effective Date**: 2025-11-09
**Updated**: 2025-12-12 (SEC-006 remediation, ADR-018 governance)
**Enforcement**: Mandatory for all edge operations and database access
**Migration**: Staged rollout per service (Priority: Finance → Loyalty → Visit → Others)
**Status**: Phase 1+2+3 implemented. SEC-006 RLS hardening complete (FloorLayoutService + RPC validation).
