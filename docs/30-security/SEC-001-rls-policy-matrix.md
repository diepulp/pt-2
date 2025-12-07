---
id: SEC-001
title: Casino-Scoped RLS Policy Matrix
owner: Security
status: Active
affects: []
created: 2025-11-02
last_review: 2025-11-13
updated: 2025-11-13
superseded_by: null
canonical_reference: docs/30-security/SECURITY_TENANCY_UPGRADE.md
---

## Overview

This matrix extracts the canonical Row-Level Security (RLS) expectations from the Service Responsibility Matrix (SRM) and consolidates them for every casino-scoped data set. Use it to verify that each schema change, policy, or RPC preserves the least-privilege model defined by the owning service.

**Canonical Reference**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md` - For complete migration guide, policy templates, and rationale.

## Migration Status

**Schema Foundation**: ✅ **DEPLOYED**
- `staff.user_id uuid references auth.users(id)` - Migration `20251110224223_staff_authentication_upgrade.sql`
- `exec_sql(text)` RPC for SET LOCAL - Migration `20251110224223_staff_authentication_upgrade.sql`
- Unique index `staff_user_id_unique` - Partial (where user_id is not null)

**RLS Policies**: ⚠️ **PENDING** - Schema ready, policies not yet applied (see Priority 0 below)

**Application Layer**: ⚠️ **IN PROGRESS**
- `withServerAction` wrapper - Partial implementation
- `getAuthContext` helper - Exists in `lib/supabase/rls-context.ts`
- Service key removal - Not yet complete

**See**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md` for complete remediation plan.

---

## Core Principles

- Every casino-scoped table includes a non-null `casino_id` column that anchors ownership.
- Read policies constrain access to authenticated staff from the same `casino_id` via `auth.uid()` → `staff.user_id` lookup.
- **No JWT claims for business logic** - All context injected via `SET LOCAL` session variables.
- **No service keys in runtime** - All operations use anon key + user authentication.
- Write paths are delegated to service-owned RPCs or role-specific policies; direct table writes must be disabled unless explicitly listed.
- Cross-context joins rely on declared foreign keys; implicit string-based joins are forbidden.
- Append-only ledgers (finance, loyalty, compliance) enforce idempotency and block deletes; corrections flow through supervised RPCs.

---

## Policy Matrix

> **Updated 2025-12-06**: Visit Service Evolution (EXEC-VSE-001) - Ghost visits have `player_id = NULL` but are still scoped by `casino_id`.

| Context | Tables / Views | Read Access | Write Path | Notes |
| --- | --- | --- | --- | --- |
| CasinoService (Foundational) | `staff`, `casino_settings`, `report` | Authenticated staff in same `casino_id` (role-gated) | Admin (`staff_role = 'admin'`) only | `casino_settings` is the sole temporal authority; policies block cross-casino visibility. Dealers excluded (non-authenticated). |
| Player & Visit (Identity & Session) | `player_casino`, `visit` | Authenticated staff in same `casino_id` | Enrollment/Visit services; admin override only | Membership writes funnel through enrollment workflows; prevents cross-property session leakage. **Ghost visits**: `player_id` is NULL but `casino_id` scoping still applies. |
| LoyaltyService (Reward) | `player_loyalty`, `loyalty_ledger` | Authenticated staff in same `casino_id` | `rpc_issue_mid_session_reward` (append-only) | RLS blocks direct ledger updates; idempotency enforced via `idempotency_key`. Only `gaming_identified_rated` visits eligible for accrual. |
| TableContextService (Operational) | `game_settings`, `gaming_table`, `gaming_table_settings`, `dealer_rotation` | Authenticated operations staff for same `casino_id` | Admin + `pit_boss` roles | Trigger `assert_table_context_casino` enforces table/casino alignment. |
| RatingSlipService (Telemetry) | `rating_slip` | Authenticated staff in same `casino_id` | Authorized telemetry service roles | Policy snapshot and status updates limited to service-managed RPCs. **Updated**: `visit_id` and `table_id` are NOT NULL. |
| PlayerFinancialService (Finance) | `player_financial_transaction` | Authenticated finance & compliance staff in same `casino_id` | `rpc_create_financial_txn` (cashier/compliance services) | Append-only ledger; deletes disabled; gaming day derived via trigger. |
| MTLService (Compliance) | `mtl_entry`, `mtl_audit_note` | Authenticated compliance staff within `casino_id` | Cashier + compliance services with matching `casino_id` | Immutable cash transaction log; notes append-only; thresholds hinge on casino settings. Ghost visits are first-class for CTR/cash movement. |

---

## Canonical RLS Pattern (DEPLOYED Schema)

**Prerequisites**:
- ✅ `staff.user_id uuid references auth.users(id)` (Migration `20251110224223`)
- ✅ `exec_sql(text)` RPC for SET LOCAL injection (Migration `20251110224223`)
- ⚠️ `withServerAction` wrapper to inject context (In Progress)

**Pattern**: `auth.uid()` + `staff.user_id` + `current_setting()`

This pattern ensures:
1. **User is authenticated** via Supabase auth (`auth.uid()`)
2. **User is linked to active staff** via `staff.user_id`
3. **Casino scope injected** via `SET LOCAL app.casino_id`
4. **Actor identity injected** via `SET LOCAL app.actor_id`

---

## Policy Templates

### Template 1: Read Access (Casino-Scoped)

**Use For**: Most casino-scoped tables (visit, rating_slip, gaming_table, etc.)

```sql
-- Enable RLS
alter table {table_name} enable row level security;

-- Read policy (canonical pattern)
create policy "{table_name}_read_same_casino"
  on {table_name}
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

**How it works**:
1. `auth.uid()` - Returns authenticated user's UUID from Supabase auth
2. Subquery checks if that user_id matches a staff record with id = `app.actor_id`
3. `current_setting('app.actor_id')` - Injected by `withServerAction` via `SET LOCAL`
4. `current_setting('app.casino_id')` - Injected by `withServerAction` via `SET LOCAL`
5. If all conditions match, user can read rows from their casino only

**Dealers**: Automatically excluded (dealers have `user_id = null`, cannot satisfy auth.uid() check)

---

### Template 2: Write Access (Role-Gated)

**Use For**: Tables requiring specific roles (pit_boss, admin)

```sql
-- Write policy (role-gated)
create policy "{table_name}_insert_authorized_roles"
  on {table_name}
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

-- Update policy (same pattern)
create policy "{table_name}_update_authorized_roles"
  on {table_name}
  for update using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
      and status = 'active'
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Role Variations**:
- Admin only: `role = 'admin'`
- Operations: `role in ('pit_boss', 'admin')`
- Cashier/Compliance: Add custom roles as needed (requires extending `staff_role` enum)

---

### Template 3: Append-Only Ledger (Finance, Loyalty, MTL)

**Use For**: Financial transactions, loyalty ledger, MTL entries

```sql
-- Insert only (role-gated)
create policy "{table_name}_append_authorized"
  on {table_name}
  for insert with check (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('cashier', 'admin')  -- Adjust roles as needed
      and status = 'active'
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );

-- Explicitly deny updates
create policy "{table_name}_no_updates"
  on {table_name}
  for update using (false);

-- Explicitly deny deletes
create policy "{table_name}_no_deletes"
  on {table_name}
  for delete using (false);
```

**Idempotency**: Tables MUST include `idempotency_key` column with partial unique index:
```sql
create unique index ux_{table}_idempotency
  on {table_name} (casino_id, idempotency_key)
  where idempotency_key is not null;
```

---

### Template 4: Admin Global Override (Use Sparingly)

**Use For**: System-wide admin operations (emergency access, cross-casino reporting)

```sql
create policy "{table_name}_admin_global_access"
  on {table_name}
  for all using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
      and role = 'admin'
      and status = 'active'
    )
    -- Note: No casino_id check - global admin access
  );
```

**⚠️ WARNING**: Use only when absolutely necessary. Prefer casino-scoped policies.

---

## RLS Context Injection

**Required**: All Server Actions MUST use `withServerAction` wrapper to inject RLS context.

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
 * 1. auth.getUser() → user_id from auth.users
 * 2. Query staff: user_id → staff.id, casino_id, role
 * 3. Validate active staff with casino assignment
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

**Server Action Example**:

```typescript
export async function checkInAction(input: CheckInInput) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context automatically injected by wrapper
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

---

## Anti-Patterns

### ❌ DON'T: Use JWT Claims for Business Logic

```sql
-- ❌ BAD: JWT claims can be stale, bloated, and inconsistent
create policy "visit_read_bad"
  on visit for select using (
    casino_id::text = auth.jwt() ->> 'casino_id'
    OR auth.jwt() ->> 'role' = 'admin'
  );
```

**Problems**:
- JWT claims not refreshed until next login
- Token size bloat as business logic grows
- Complex OR trees hard to audit
- Type mismatches (uuid vs text)

### ✅ DO: Use Database Session Context

```sql
-- ✅ GOOD: Fresh from database, strongly typed, deterministic
create policy "visit_read_good"
  on visit for select using (
    auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

---

### ❌ DON'T: Use Service Keys in Runtime

```typescript
// ❌ BAD: Bypasses all RLS policies
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Dangerous!
);
```

**Problems**:
- Cross-tenant data leakage
- Privilege escalation
- No audit trail of who accessed what

### ✅ DO: Use Anon Key + User Context

```typescript
// ✅ GOOD: RLS enforced via auth.uid() and session context
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

**When to use service key** (rare):
- Background jobs with system-level access (must still set `app.casino_id`)
- System migrations (one-time scripts)
- Admin tools with explicit audit logging

---

### ❌ DON'T: Complex OR Trees

```sql
-- ❌ BAD: Hard to audit, prone to logic errors
create policy "complex_bad"
  on visit for select using (
    casino_id = current_setting('app.casino_id')::uuid
    OR current_setting('app.staff_role') = 'admin'
    OR current_setting('app.permissions')::jsonb @> '["global.read"]'
    OR is_public = true
  );
```

### ✅ DO: Single Deterministic Path

```sql
-- ✅ GOOD: One path, easy to verify
create policy "simple_good"
  on visit for select using (
    auth.uid() = (select user_id from staff where id = current_setting('app.actor_id')::uuid)
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

---

## Verification Checklist

**Schema**:
- [ ] Table DDL includes `casino_id uuid not null references casino(id)`.
- [ ] Table has RLS enabled (`alter table {table} enable row level security`).
- [ ] `staff.user_id` column exists (`\d staff` shows it).
- [ ] `exec_sql(text)` RPC exists (`\df exec_sql` shows it).

**Policies**:
- [ ] Policies use `auth.uid()` + `staff.user_id` pattern (not JWT claims).
- [ ] Policies use `current_setting('app.casino_id')::uuid` (not hardcoded values).
- [ ] Policies use `current_setting('app.actor_id')::uuid` for staff lookup.
- [ ] Read policies defined for `SELECT`.
- [ ] Write policies defined for `INSERT`, `UPDATE`, `DELETE` as appropriate.
- [ ] Append-only ledgers have `no_updates` and `no_deletes` policies.

**RPCs**:
- [ ] Service-owned RPCs (`rpc_issue_mid_session_reward`, `rpc_create_financial_txn`, etc.) validate `casino_id` alignment.
- [ ] RPCs use `security definer` where needed.
- [ ] RPCs enforce idempotency via `idempotency_key` for mutations.

**Application**:
- [ ] Server Actions use `withServerAction` wrapper.
- [ ] No `SERVICE_ROLE_KEY` in runtime code (grep codebase).
- [ ] All mutations include `x-idempotency-key` header.
- [ ] All requests include `x-correlation-id` header.

**Access**:
- [ ] No direct table grants exist outside RLS policies.
- [ ] Cross-context access uses DTOs (not direct table reads).
- [ ] Ledger-style tables route corrections through supervised RPCs.

---

## Testing RLS Policies

**Manual Test**:

```sql
-- Set RLS context (simulates withServerAction)
set local app.actor_id = '00000000-0000-0000-0000-000000000001';
set local app.casino_id = 'casino-1-uuid';

-- Should return only casino-1 visits
select count(*) from visit;

-- Should FAIL (cross-casino access)
insert into visit (player_id, casino_id, started_at)
values ('player-uuid', 'casino-2-uuid', now());
-- Expected: violates row-level security policy

-- Should SUCCEED (same casino)
insert into visit (player_id, casino_id, started_at)
values ('player-uuid', 'casino-1-uuid', now());
```

**Automated Test** (recommended):

See `docs/30-security/SECURITY_TENANCY_UPGRADE.md` lines 659-676 for complete test suite.

---

## Migration Priority

**Phase 1: Critical Tables** (Deploy First)
1. `player_financial_transaction` (Finance)
2. `loyalty_ledger` (Loyalty)
3. `mtl_entry`, `mtl_audit_note` (Compliance)

**Phase 2: Operational Tables**
4. `visit` (Session)
5. `rating_slip` (Telemetry)
6. `player_loyalty` (Balance)

**Phase 3: Administrative Tables**
7. `gaming_table`, `dealer_rotation` (TableContext)
8. `floor_layout*` (FloorLayout)
9. `staff`, `casino_settings` (Casino)

**See**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md` for complete migration plan.

---

## References

- **Canonical Guide**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md` (AUTHORITATIVE)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.1.0)
- **Migration Analysis**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md`
- **RLS Context**: `lib/supabase/rls-context.ts`
- **WRAPPER**: `lib/server-actions/with-server-action-wrapper.ts`

---

**Status**: ✅ Updated to canonical pattern (2025-11-13)
**Migration**: ⚠️ Schema ready, policies pending deployment
**Next**: Deploy RLS policies per priority order above
