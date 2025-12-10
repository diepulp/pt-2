---
id: SEC-001
title: Casino-Scoped RLS Policy Matrix
owner: Security
status: Active
affects: []
created: 2025-11-02
last_review: 2025-12-10
updated: 2025-12-10
superseded_by: null
canonical_reference: docs/30-security/SECURITY_TENANCY_UPGRADE.md
related_adrs: ADR-015
---

## Overview

This matrix extracts the canonical Row-Level Security (RLS) expectations from the Service Responsibility Matrix (SRM) and consolidates them for every casino-scoped data set. Use it to verify that each schema change, policy, or RPC preserves the least-privilege model defined by the owning service.

**Canonical Reference**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md` - For complete migration guide, policy templates, and rationale.

**ADR-015 Compliance**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Canonical RLS patterns for connection pooling compatibility.

## Migration Status

**Schema Foundation**: ✅ **DEPLOYED**
- `staff.user_id uuid references auth.users(id)` - Migration `20251110224223_staff_authentication_upgrade.sql`
- `set_rls_context()` RPC (ADR-015) - Migration `20251209183033_adr015_rls_context_rpc.sql`
- Unique index `staff_user_id_unique` - Partial (where user_id is not null)

**RLS Policies**: ✅ **HYBRID PATTERN DEPLOYED** (Pattern C - Transaction-wrapped with JWT fallback)

**Application Layer**: ⚠️ **IN PROGRESS**
- `withServerAction` wrapper - Updated for ADR-015
- `getAuthContext` helper - Exists in `lib/supabase/rls-context.ts`
- Service key removal - Not yet complete

**See**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md` for complete remediation plan.

---

## Core Principles

- Every casino-scoped table includes a non-null `casino_id` column that anchors ownership.
- Read policies constrain access to authenticated staff from the same `casino_id` via `auth.uid()` → `staff.user_id` lookup.
- **ADR-015 Compliance** - Context injection via transaction-wrapped `set_rls_context()` RPC with JWT fallback.
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

## Canonical RLS Pattern (ADR-015 Compliant)

**Prerequisites**:
- ✅ `staff.user_id uuid references auth.users(id)` (Migration `20251110224223`)
- ✅ `set_rls_context()` RPC for transaction-wrapped injection (Migration `20251209183033_adr015_rls_context_rpc.sql`)
- ✅ JWT `app_metadata` with `casino_id` for fallback (Supabase Auth)

**Pattern C (Hybrid)**: Transaction-wrapped context injection with JWT fallback

This pattern ensures:
1. **User is authenticated** via Supabase auth (`auth.uid()`)
2. **User is linked to active staff** via `staff.user_id`
3. **Casino scope injected** via `set_rls_context()` RPC (single transaction)
4. **JWT fallback** via `auth.jwt() -> 'app_metadata' ->> 'casino_id'`

**Why Hybrid?**
- **Connection pooling safe**: `set_rls_context()` executes all `SET LOCAL` in single transaction
- **JWT fallback**: Works when context injection is not called (direct Supabase client queries)
- **Migration path**: Allows gradual transition from Pattern B to Pattern A (see ADR-015)

**Legacy Pattern (Deprecated)**: The old `exec_sql()` loop pattern fails with Supabase connection pooling. See ADR-015 for details.

---

## Policy Templates

> **Note**: Pattern C (Hybrid) is the recommended pattern for all new policies. Legacy patterns are documented for migration reference only.

### Template 1: Read Access (Hybrid - Preferred)

**Use For**: Most casino-scoped tables (visit, rating_slip, gaming_table, etc.)

**Pattern C (ADR-015 Compliant)**:

```sql
-- Enable RLS
alter table {table_name} enable row level security;

-- Read policy (hybrid pattern with JWT fallback)
create policy "{table_name}_read_hybrid"
  on {table_name}
  for select using (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**How it works**:
1. `auth.uid() IS NOT NULL` - Ensures user is authenticated via Supabase auth
2. `COALESCE(...)` - Tries transaction context first, falls back to JWT
3. `current_setting('app.casino_id', true)` - Injected by `set_rls_context()` RPC (ADR-015)
4. `NULLIF(..., '')` - Treats empty string as NULL (connection pooling edge case)
5. `auth.jwt() -> 'app_metadata' ->> 'casino_id'` - JWT fallback for direct client queries
6. If all conditions match, user can read rows from their casino only

**Connection Pooling Safe**: This pattern works with Supabase transaction-mode pooling because:
- `set_rls_context()` wraps all `SET LOCAL` in single RPC call (same transaction)
- JWT fallback ensures policy never fails if context not set

**Dealers**: Automatically excluded (dealers have `user_id = null`, cannot satisfy `auth.uid()` check)

---

### Template 1b: Read Access (Legacy - Migration Path)

**Use For**: Existing tables during migration to Pattern C

```sql
-- Legacy pattern (deprecated - fails with connection pooling)
create policy "{table_name}_read_legacy"
  on {table_name}
  for select using (
    auth.uid() = (
      select user_id
      from staff
      where id = current_setting('app.actor_id')::uuid
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

**Warning**: This pattern is deprecated. Use Template 1 (Hybrid) for new policies.

---

### Template 2: Write Access (Role-Gated, Hybrid)

**Use For**: Tables requiring specific roles (pit_boss, admin)

**Pattern C (ADR-015 Compliant)**:

```sql
-- Write policy (role-gated with hybrid context)
create policy "{table_name}_insert_authorized_roles"
  on {table_name}
  for insert with check (
    -- Verify authenticated user with required role
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('pit_boss', 'admin')
      and status = 'active'
      and user_id IS NOT NULL
    )
    -- Verify casino scope
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Update policy (same pattern)
create policy "{table_name}_update_authorized_roles"
  on {table_name}
  for update using (
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('pit_boss', 'admin')
      and status = 'active'
      and user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Role Variations**:
- Admin only: `role = 'admin'`
- Operations: `role in ('pit_boss', 'admin')`
- Cashier/Compliance: Add custom roles as needed (requires extending `staff_role` enum)

**Connection Pooling Safe**: Uses hybrid context resolution for both role check and casino scope verification.

---

### Template 3: Append-Only Ledger (Finance, Loyalty, MTL, Hybrid)

**Use For**: Financial transactions, loyalty ledger, MTL entries

**Pattern C (ADR-015 Compliant)**:

```sql
-- Insert only (role-gated with hybrid context)
create policy "{table_name}_append_authorized"
  on {table_name}
  for insert with check (
    auth.uid() IN (
      select user_id
      from staff
      where casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      and role in ('cashier', 'admin')  -- Adjust roles as needed
      and status = 'active'
      and user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
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

**Connection Pooling Safe**: Hybrid context ensures append-only ledgers work reliably with connection pooling.

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

## RLS Context Injection (ADR-015)

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
 * Inject RLS context via set_rls_context() RPC (ADR-015)
 *
 * This function wraps all SET LOCAL statements in a single transaction-safe RPC call.
 * Connection pooling compatible - all context variables set atomically.
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
    p_correlation_id: correlationId || null,
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
  -- SET LOCAL ensures context persists for entire transaction
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;
```

**Server Action Example**:

```typescript
export async function checkInAction(input: CheckInInput) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context automatically injected by wrapper via set_rls_context() RPC
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

**Why ADR-015?**
- Single RPC call ensures all `SET LOCAL` statements execute in same transaction
- Connection pooling safe (Supabase Supavisor transaction mode compatible)
- Hybrid policies provide JWT fallback for robustness

---

## Anti-Patterns

### ❌ DON'T: Use JWT Claims Only (Without Fallback)

```sql
-- ❌ DISCOURAGED: JWT-only policies can be stale and lack role freshness
create policy "visit_read_jwt_only"
  on visit for select using (
    casino_id::text = auth.jwt() ->> 'casino_id'
    OR auth.jwt() ->> 'role' = 'admin'
  );
```

**Problems**:
- JWT claims not refreshed until next login (stale role data)
- Complex OR trees hard to audit
- Type mismatches (uuid vs text casting)

### ❌ DON'T: Use Legacy SET LOCAL Loop Pattern

```sql
-- ❌ BAD: Fails with connection pooling (each SET LOCAL on different connection)
-- Deprecated pattern from pre-ADR-015
FOR stmt IN array_of_statements LOOP
  EXECUTE 'SET LOCAL ' || stmt;
END LOOP;
```

**Problems**:
- Connection pooling breaks SET LOCAL across statements
- Intermittent failures (context lost between queries)
- See ADR-015 for technical details

### ✅ DO: Use Hybrid Pattern (Pattern C)

```sql
-- ✅ GOOD: Transaction-wrapped context with JWT fallback (ADR-015)
create policy "visit_read_hybrid"
  on visit for select using (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Benefits**:
- Connection pooling safe (set_rls_context() RPC is transaction-wrapped)
- JWT fallback ensures robustness
- Fresh role data from database (via set_rls_context)
- Strongly typed, deterministic

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

**Schema (ADR-015)**:
- [ ] Table DDL includes `casino_id uuid not null references casino(id)`.
- [ ] Table has RLS enabled (`alter table {table} enable row level security`).
- [ ] `staff.user_id` column exists (`\d staff` shows it).
- [ ] `set_rls_context()` RPC exists (`\df set_rls_context` shows it - Migration `20251209183033`).
- [ ] JWT `app_metadata` includes `casino_id` for fallback.

**Policies (Pattern C - Hybrid)**:
- [ ] Policies use `auth.uid() IS NOT NULL` for authentication check.
- [ ] Policies use hybrid `COALESCE()` pattern for `casino_id` resolution:
  - `NULLIF(current_setting('app.casino_id', true), '')::uuid` (transaction context)
  - `(auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid` (JWT fallback)
- [ ] Read policies defined for `SELECT`.
- [ ] Write policies defined for `INSERT`, `UPDATE`, `DELETE` as appropriate.
- [ ] Role-gated policies check `staff.casino_id` matches context (no cross-casino role checks).
- [ ] Append-only ledgers have `no_updates` and `no_deletes` policies.

**RPCs**:
- [ ] Service-owned RPCs validate `casino_id` alignment.
- [ ] RPCs use `security definer` where needed.
- [ ] RPCs enforce idempotency via `idempotency_key` for mutations.
- [ ] All RPC context injection uses `set_rls_context()` (not legacy `exec_sql` loop).

**Application**:
- [ ] Server Actions use `withServerAction` wrapper.
- [ ] `injectRLSContext()` calls `set_rls_context()` RPC (ADR-015 compliant).
- [ ] No `SERVICE_ROLE_KEY` in runtime code (grep codebase).
- [ ] All mutations include `x-idempotency-key` header.
- [ ] All requests include `x-correlation-id` header.

**Access**:
- [ ] No direct table grants exist outside RLS policies.
- [ ] Cross-context access uses DTOs (not direct table reads).
- [ ] Ledger-style tables route corrections through supervised RPCs.

**ADR-015 Compliance**:
- [ ] No legacy `exec_sql()` loop patterns in codebase.
- [ ] All policies support hybrid context resolution.
- [ ] Connection pooling compatibility verified (transaction mode).

---

## Testing RLS Policies

**Manual Test (ADR-015)**:

```sql
-- Set RLS context using set_rls_context() RPC (ADR-015)
SELECT set_rls_context(
  p_actor_id := '00000000-0000-0000-0000-000000000001',
  p_casino_id := 'casino-1-uuid',
  p_staff_role := 'pit_boss',
  p_correlation_id := 'test-correlation-id'
);

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

**Testing Hybrid Fallback (JWT)**:

```sql
-- Test without SET LOCAL (JWT fallback should work)
-- Ensure test user has app_metadata.casino_id set in Supabase Auth
select count(*) from visit;
-- Should still return casino-scoped results via JWT fallback
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
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` (Connection pooling strategy, Pattern C)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.1.0)
- **Migration Analysis**: `docs/audits/RLS_DOCUMENTATION_DRIFT_ANALYSIS_2025-11-13.md`
- **RLS Context**: `lib/supabase/rls-context.ts` (Updated for ADR-015)
- **WRAPPER**: `lib/server-actions/with-server-action-wrapper.ts`
- **RPC Migration**: `supabase/migrations/20251209183033_adr015_rls_context_rpc.sql`

---

**Status**: ✅ **ADR-015 IMPLEMENTED** (2025-12-10)
**Migration**: ✅ Schema deployed, `set_rls_context()` RPC active
**Pattern**: Pattern C (Hybrid) - Transaction-wrapped context with JWT fallback
**Next**: Migrate existing policies to hybrid pattern, update application layer to use `set_rls_context()`
