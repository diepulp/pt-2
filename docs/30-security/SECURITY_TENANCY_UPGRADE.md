# Security & Tenancy Upgrade - RLS Pattern Canonicalization

**Status**: MANDATORY (Enforced at edge + database layer)
**Effective**: 2025-11-09
**Purpose**: Eliminate privilege escalation via service keys; enforce multi-tenant isolation via RLS

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
-- Canonical RLS pattern: auth + session context
create policy "visit read same casino"
  on visit for select using (
    auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
    AND casino_id = current_setting('app.casino_id')::uuid
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

3. **JWT claim overload**: Auth tokens carry business logic
   ```typescript
   // ❌ BEFORE: RLS reads from JWT claims
   auth.jwt() ->> 'casino_id'
   auth.jwt() ->> 'permissions'
   ```
   **Risk**: Token size bloat, stale claims, inconsistent state

---

## Solution Architecture

### 1. Canonical RLS Pattern (SET LOCAL + current_setting)

**Pattern:**
```sql
-- Enable RLS
alter table visit enable row level security;

-- Canonical read policy
create policy "visit read same casino"
  on visit for select using (
    -- Actor identity check
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    -- Casino scope check
    AND casino_id = current_setting('app.casino_id')::uuid
  );

-- Canonical write policy (role-gated)
create policy "visit insert authorized roles"
  on visit for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Why this works:**
1. **`auth.uid()`**: Validates user is authenticated (from Supabase auth)
2. **`current_setting('app.actor_id')`**: Injected by WRAPPER via `SET LOCAL`
3. **`current_setting('app.casino_id')`**: Injected by WRAPPER via `SET LOCAL`
4. **No OR trees**: Single, deterministic path

---

### 2. RLS Context Injection (Middleware)

**Implementation** (`lib/supabase/rls-context.ts`):

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
 * Inject RLS context via SET LOCAL
 */
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

## RLS Policy Templates

### Template 1: Read Access (Casino-Scoped)

```sql
create policy "{table}_read_same_casino"
  on {schema}.{table}
  for select using (
    -- Verify authenticated user
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    -- Verify casino scope
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

### Template 2: Write Access (Role-Gated)

```sql
create policy "{table}_insert_authorized_roles"
  on {schema}.{table}
  for insert with check (
    -- Verify authenticated user with required role
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
      and status = 'active'
    )
    -- Verify casino scope
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

### Template 3: Append-Only Ledger (Finance, Loyalty)

```sql
-- Insert only (no updates/deletes)
create policy "{table}_append_authorized"
  on {schema}.{table}
  for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('cashier', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
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

### Template 4: Admin Override (Global Access)

```sql
create policy "{table}_admin_global_access"
  on {schema}.{table}
  for all using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role = 'admin'
      and status = 'active'
    )
  );
```

**NOTE:** Use admin override sparingly. Prefer casino-scoped policies.

---

## Migration Guide

### Step 1: Add `user_id` to `staff` Table

```sql
-- Migration: Add user_id column linking to auth.users
alter table staff add column user_id uuid references auth.users(id);

-- Backfill (production must be done carefully)
-- Option A: Manual assignment via admin tool
-- Option B: Invite flow that creates auth.users + staff records atomically

-- Add constraint after backfill
alter table staff alter column user_id set not null;
create unique index staff_user_id_unique on staff(user_id);
```

### Step 2: Create `exec_sql` RPC for SET LOCAL

```sql
-- Migration: Helper function for SET LOCAL
create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;
```

**IMPORTANT:** This function must be secured. Only allow `SET LOCAL` commands.

### Step 3: Migrate RLS Policies (Table by Table)

**Example: `visit` table**

```sql
-- Drop existing policies (if any)
drop policy if exists "visit_read_access" on visit;

-- Enable RLS
alter table visit enable row level security;

-- Apply canonical policy
create policy "visit_read_same_casino"
  on visit for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );

create policy "visit_insert_authorized"
  on visit for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
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

| Service | Tables | Read Policy | Write Policy | Notes |
|---------|--------|-------------|--------------|-------|
| **Casino** | `staff`, `casino_settings` | Same casino | Admin only | Root authority |
| **Player** | `player_casino` | Same casino | Enrollment service | Membership writes |
| **Visit** | `visit` | Same casino | Pit boss, admin | Session lifecycle |
| **Loyalty** | `player_loyalty`, `loyalty_ledger` | Same casino | RPC only (append) | Idempotency enforced |
| **Finance** | `player_financial_transaction` | Same casino | RPC only (append) | Append-only ledger |
| **MTL** | `mtl_entry`, `mtl_audit_note` | Compliance roles | Cashier, compliance | Immutable log |
| **Table Context** | `gaming_table`, `dealer_rotation` | Operations staff | Pit boss, admin | Operational control |
| **Rating Slip** | `rating_slip` | Same casino | Telemetry service | Policy snapshot |
| **Floor Layout** | `floor_layout`, `floor_pit` | Same casino | Admin only | Layout design |

---

## Anti-Patterns

### ❌ DON'T: Complex OR trees

```sql
-- ❌ BAD: 6-way OR (hard to audit)
using (
  casino_id = current_setting('app.casino_id')::uuid
  OR current_setting('app.staff_role') = 'admin'
  OR current_setting('app.permissions')::jsonb @> '["global.read"]'::jsonb
  OR ...
)
```

### ✅ DO: Single deterministic path

```sql
-- ✅ GOOD: One path (easy to audit)
using (
  auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
  AND casino_id = current_setting('app.casino_id')::uuid
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
-- ✅ GOOD: Fresh from DB, SET LOCAL controlled
using (casino_id = current_setting('app.casino_id')::uuid)
```

---

## Audit & Validation

### CI Checklist

- [ ] All tables with `casino_id` have RLS enabled
- [ ] All RLS policies use `current_setting()` pattern (no JWT claims)
- [ ] All RLS policies validate `auth.uid()` against `staff.user_id`
- [ ] No service key usage in runtime code (search for `SERVICE_ROLE_KEY`)
- [ ] All server actions use `withServerAction` wrapper
- [ ] `staff` table has `user_id` column
- [ ] `exec_sql` RPC exists and is secured

### Manual Testing

```bash
# Test RLS enforcement
psql -c "
  set local app.actor_id = '00000000-0000-0000-0000-000000000001';
  set local app.casino_id = '00000000-0000-0000-0000-000000000001';
  select count(*) from visit; -- Should return only casino-1 visits
"

# Test cross-casino isolation
psql -c "
  set local app.actor_id = '00000000-0000-0000-0000-000000000001';
  set local app.casino_id = '00000000-0000-0000-0000-000000000001';
  insert into visit (player_id, casino_id, started_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', now());
  -- Should fail: casino_id mismatch
"
```

---

## References

- **RLS Context**: `lib/supabase/rls-context.ts`
- **WRAPPER Integration**: `lib/server-actions/with-server-action-wrapper.ts`
- **Policy Matrix**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **SRM Security Section**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

---

**Effective Date**: 2025-11-09
**Enforcement**: Mandatory for all edge operations and database access
**Migration**: Staged rollout per service (Priority: Finance → Loyalty → Visit → Others)
