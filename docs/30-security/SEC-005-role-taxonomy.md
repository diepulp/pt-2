---
id: SEC-005
title: Role Taxonomy and Capabilities Matrix
owner: Security
status: Active
affects: [SEC-001, SEC-003, PRD-008, PRD-009, ADR-017]
created: 2025-11-17
last_review: 2025-12-10
version: 1.2.0
---

## Purpose

This document defines the complete role taxonomy for the PT-2 casino management system, including role definitions, capabilities, hierarchy, inheritance, and the mapping between authentication claims and RLS policy enforcement. This taxonomy is the authoritative source for all role-based access control (RBAC) decisions across the application.

## Scope

- `staff_role` enum definitions and semantics
- Service claims and their issuance
- Per-role capabilities across all bounded contexts
- Role hierarchy and inheritance
- Authentication and authorization flow
- RLS policy role mapping

## Role Registry

### Primary Staff Roles (`staff_role` enum)

The `staff_role` enum defines four core roles stored in the `staff` table:

```sql
create type staff_role as enum ('dealer', 'pit_boss', 'admin', 'cashier');
```

#### 1. Admin

**Definition**: Full administrative access within a casino's scope. Admins have unrestricted read and write access to all casino-scoped data and can manage staff, configuration, and operational settings.

**Authentication**: REQUIRED
- `staff.user_id` MUST reference `auth.users.id`
- Must authenticate via Supabase Auth
- RLS context injected via `withServerAction` wrapper

**Capabilities**:
- **CasinoService**: Full read/write on casino settings, staff registry, audit logs, reports
- **PlayerService**: Full read/write on player profiles and enrollment (override capability)
- **VisitService**: Full read/write on visit sessions
- **TableContextService**: Full read/write on gaming tables, settings, dealer rotations, chip custody
- **RatingSlipService**: Full read/write on rating slips and telemetry
- **LoyaltyService**: Full read/write on loyalty balances and ledger
- **PlayerFinancialService**: Full read on financial transactions (write via RPC only)
- **MTLService**: Full read on compliance entries and audit notes
- **FloorLayoutService**: Full read/write on floor layouts and activation

**RLS Pattern**:
```sql
-- Admin read access (casino-scoped)
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role = 'admin'
  and status = 'active'
)
AND casino_id = current_setting('app.casino_id')::uuid
```

**Realtime**: Can join all casino-scoped channels

**Claims Context**:
- `app.actor_id`: staff.id
- `app.casino_id`: staff.casino_id
- `app.staff_role`: 'admin'

---

#### 2. Pit Boss

**Definition**: Operational staff with floor management permissions. Pit bosses supervise table games, manage dealer rotations, approve chip custody operations, and handle player rewards.

**Authentication**: REQUIRED
- `staff.user_id` MUST reference `auth.users.id`
- Must authenticate via Supabase Auth
- RLS context injected via `withServerAction` wrapper

**Capabilities**:
- **CasinoService**: Read-only on casino settings and staff registry
- **PlayerService**: Read-only on player profiles and enrollment
- **VisitService**: Full read/write on visit sessions
- **TableContextService**: Full read/write on gaming tables, settings, dealer rotations, chip custody (fills, drops, credits, inventory)
- **RatingSlipService**: Full read/write on rating slips and telemetry updates
- **LoyaltyService**: Read on loyalty balances; can approve mid-session rewards via RPC
- **PlayerFinancialService**: Read on financial transactions; Write table buy-ins via `rpc_create_financial_txn` (direction='in', tender_type IN ('cash','chips'), requires visit_id)
- **MTLService**: No access
- **FloorLayoutService**: Read-only on floor layouts

**RLS Pattern**:
```sql
-- Pit boss read access (casino-scoped)
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role = 'pit_boss'
  and status = 'active'
)
AND casino_id = current_setting('app.casino_id')::uuid

-- Pit boss write access (operations tables)
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role in ('pit_boss', 'admin')
  and status = 'active'
)
AND casino_id = current_setting('app.casino_id')::uuid
```

**Realtime**: Can join casino-scoped operational channels (visits, rating slips, table context, loyalty)

**Claims Context**:
- `app.actor_id`: staff.id
- `app.casino_id`: staff.casino_id
- `app.staff_role`: 'pit_boss'

---

#### 3. Dealer

**Definition**: Non-authenticated scheduling metadata only. Dealers are tracked in the system for operational visibility (dealer rotations, table assignments) but have ZERO application permissions.

**Authentication**: PROHIBITED
- `staff.user_id` is **NULL** for all dealer records
- Dealers CANNOT authenticate to the application
- Dealers CANNOT access the database directly
- Dealers have **zero application permissions**

**Capabilities**:
- **None**: Dealers have no read or write access to any tables
- Tracked in `dealer_rotation` for scheduling visibility only
- All dealer rotation management is performed by pit_boss/admin roles

**RLS Pattern**:
```sql
-- Dealers are EXCLUDED from all RLS policies
-- RLS policies check: role in ('pit_boss', 'admin')
-- This automatically excludes dealers
```

**Realtime**: No channel access

**Claims Context**: None (dealers never authenticate)

**Critical Notes**:
- Dealer role exists in `staff_role` enum for scheduling purposes only
- `dealer_rotation` table tracks scheduling, NOT access control
- RLS policies explicitly exclude dealer role
- Migration `20251110231330_dealer_role_clarification.sql` documents this pattern
- See `docs/audits/DEALER_ROLE_BLAST_RADIUS_AUDIT_NOV_10.md` for complete analysis

---

#### 4. Cashier

**Definition**: Financial service role for cage operations, player financial transactions, and cashiering workflows. Cashiers process buy-ins, cash-outs, marker issuance/settlement, and manage chip custody operations.

**Authentication**: REQUIRED
- `staff.user_id` MUST reference `auth.users.id`
- Must authenticate via Supabase Auth
- RLS context injected via `withServerAction` wrapper

**Role Assignment**: Assignment of `staff.role = 'cashier'` is restricted to admin-only workflows (see SEC-003 / Staff Admin UI). Direct SQL grants are prohibited in production environments.

**Capabilities**:
- **CasinoService**: Read-only on casino settings
- **PlayerService**: Read-only on player profiles
- **VisitService**: Read-only on visit sessions
- **TableContextService**: No access to tables; Full read/write on chip custody operations (fills, credits, drops, inventory)
- **RatingSlipService**: Read-only on rating slips
- **LoyaltyService**: Read-only on loyalty balances
- **PlayerFinancialService**: Full read; Write via `rpc_create_financial_txn` only
- **MTLService**: Read-only on MTL entries (for reconciliation); Write to create MTL entries for large transactions
- **FloorLayoutService**: No access

**RLS Pattern**:
```sql
-- Cashier financial transaction access
-- Uses current_setting('app.staff_role') as the ONLY authority
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and status = 'active'
)
AND current_setting('app.staff_role', true) IN ('cashier', 'admin')
AND casino_id = current_setting('app.casino_id')::uuid
```

**Realtime**: Can join finance and loyalty channels (casino-scoped)

**Claims Context**:
- `app.actor_id`: staff.id
- `app.casino_id`: staff.casino_id
- `app.staff_role`: 'cashier'

**Implementation Notes**:
- Cashier is a `staff_role` enum value (per ADR-017)
- Uses same authentication flow as pit_boss/admin
- All financial mutations MUST use `x-idempotency-key` header
- Single-role limitation: staff record has exactly one role (future ADR may add capabilities)

---

### Service Claims (Extended Roles)

Service claims are additional roles beyond the core `staff_role` enum. They are issued as JWT claims by the authentication gateway for specific service operations. Unlike staff roles, service claims are not stored in the database but are injected via session context.

> **Note**: As of ADR-017, **cashier** is now a primary staff role (not a service claim). The remaining service claims below are reserved for future specialized operations.

#### 5. Compliance

**Definition**: Compliance and audit role with read access to financial/MTL data and ability to append audit notes.

**Issuer**: Authentication gateway (explicit JWT claim)

**Scope**: Single casino, time-limited

**Capabilities**:
- **CasinoService**: Read-only on casino settings
- **PlayerService**: Read-only on player profiles (compliance view)
- **VisitService**: Read-only on visit sessions
- **TableContextService**: No access
- **RatingSlipService**: Read-only on rating slips
- **LoyaltyService**: No access
- **PlayerFinancialService**: Full read on financial transactions
- **MTLService**: Full read on MTL entries; Write to `mtl_audit_note` (append-only)
- **FloorLayoutService**: No access

**RLS Pattern**:
```sql
-- Compliance read access
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role in ('compliance', 'admin')
  and status = 'active'
)
AND casino_id = current_setting('app.casino_id')::uuid

-- Compliance audit note append
create policy "mtl_audit_note_compliance_append"
  on mtl_audit_note
  for insert with check (
    auth.uid() = (
      select user_id from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('compliance', 'admin')
      and status = 'active'
    )
    AND (select casino_id from mtl_entry where id = mtl_entry_id)
        = current_setting('app.casino_id')::uuid
  );
```

**Realtime**: Can join MTL read channels (casino-scoped)

**Claims Context**:
- `app.actor_id`: staff.id
- `app.casino_id`: staff.casino_id
- `app.staff_role`: 'compliance'

**Implementation Notes**:
- Compliance role may be added to `staff_role` enum in future
- Currently modeled as service claim for separation of concerns
- Read-only by default; write limited to audit annotations

---

#### 6. Reward Issuer

**Definition**: Loyalty service role for issuing mid-session rewards.

**Issuer**: Authentication gateway or loyalty service (explicit scope)

**Scope**: Single casino, time-limited, specific operations

**Capabilities**:
- **CasinoService**: Read-only on casino settings (reward policies)
- **PlayerService**: Read-only on player profiles
- **VisitService**: Read-only on visit sessions
- **TableContextService**: Read-only on gaming tables (for context)
- **RatingSlipService**: Read-only on rating slips
- **LoyaltyService**: Read on loyalty balances; Issue rewards via `rpc_issue_mid_session_reward`
- **PlayerFinancialService**: No access
- **MTLService**: No access
- **FloorLayoutService**: No access

**RLS Pattern**:
```sql
-- Reward issuer access (via RPC)
-- Enforced within rpc_issue_mid_session_reward
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role in ('reward_issuer', 'pit_boss', 'admin')
  and status = 'active'
)
```

**Realtime**: Can join loyalty channels (casino-scoped)

**Claims Context**:
- `app.actor_id`: staff.id
- `app.casino_id`: staff.casino_id
- `app.staff_role`: 'reward_issuer'

---

#### 7. Automation

**Definition**: Limited automation role for scheduled tasks and system operations.

**Issuer**: System service accounts (explicit, audited)

**Scope**: Single casino or global (depending on operation), time-limited

**Capabilities**:
- **CasinoService**: Read-only on casino settings; Limited writes for configuration updates
- **PlayerService**: No access
- **VisitService**: No access
- **TableContextService**: Read-only on tables and settings
- **RatingSlipService**: No access
- **LoyaltyService**: No access (except batch processing jobs)
- **PlayerFinancialService**: No access
- **MTLService**: No access
- **FloorLayoutService**: No access

**RLS Pattern**:
```sql
-- Automation read access
auth.uid() = (
  select user_id from staff
  where id = current_setting('app.actor_id')::uuid
  and role = 'automation'
  and status = 'active'
)
```

**Realtime**: No channel access

**Claims Context**:
- `app.actor_id`: service_account_id
- `app.casino_id`: target_casino_id (or null for global)
- `app.staff_role`: 'automation'

**Implementation Notes**:
- Use sparingly; prefer user-driven operations
- All automation actions must be audited
- Limit scope to specific, well-defined operations

---

## Role Hierarchy and Inheritance

### Hierarchy

```
Admin (highest privilege)
  ├─ Pit Boss (operational)
  ├─ Cashier (financial)
  ├─ Compliance (audit)
  ├─ Reward Issuer (loyalty)
  └─ Automation (system)

Dealer (zero privilege, metadata only)
```

### Inheritance Rules

1. **Admin inherits all capabilities**: Admin role has all permissions of pit_boss, cashier, compliance, and reward_issuer combined
2. **Specialized roles do NOT inherit**: Pit boss, cashier, compliance, and reward_issuer have distinct, non-overlapping capabilities
3. **Dealer inherits nothing**: Dealer role has zero permissions and cannot inherit any capabilities

### Role Composition

For operations requiring multiple role capabilities:
- **Use RPC-based access control**: Define service RPCs that check multiple roles
- **Example**: `rpc_create_financial_txn` allows `cashier` OR `admin`
- **Avoid**: OR conditions in RLS policies (prefer deterministic single-path policies)

---

## Capabilities Matrix by Bounded Context

### Casino Service (Foundational)

| Role | Read Settings | Write Settings | Read Staff | Manage Staff | Read Audit Logs |
|------|--------------|----------------|------------|--------------|-----------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ❌ | ✅ | ❌ | ✅ |
| Cashier | ✅ | ❌ | ❌ | ❌ | ❌ |
| Compliance | ✅ | ❌ | ❌ | ❌ | ✅ |
| Reward Issuer | ✅ | ❌ | ❌ | ❌ | ❌ |
| Automation | ✅ | ⚠️ (limited) | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ | ❌ | ❌ |

### Player & Visit Service (Identity & Session)

| Role | Read Player | Write Player | Read Visit | Create/Update Visit | Close Visit |
|------|-------------|--------------|------------|---------------------|-------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cashier | ✅ | ❌ | ✅ | ❌ | ❌ |
| Compliance | ✅ | ❌ | ✅ | ❌ | ❌ |
| Reward Issuer | ✅ | ❌ | ✅ | ❌ | ❌ |
| Automation | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ | ❌ | ❌ |

### Table Context Service (Operational)

| Role | Read Tables | Update Tables | Manage Rotations | Chip Custody Ops |
|------|-------------|---------------|------------------|------------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ✅ | ✅ | ✅ |
| Cashier | ❌ | ❌ | ❌ | ✅ |
| Compliance | ❌ | ❌ | ❌ | ❌ |
| Reward Issuer | ✅ | ❌ | ❌ | ❌ |
| Automation | ✅ | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ | ❌ |

### Rating Slip Service (Telemetry)

| Role | Read Rating Slips | Update Status | Close Slip |
|------|-------------------|---------------|------------|
| Admin | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ✅ | ✅ |
| Cashier | ✅ | ❌ | ❌ |
| Compliance | ✅ | ❌ | ❌ |
| Reward Issuer | ✅ | ❌ | ❌ |
| Automation | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ |

### Loyalty Service (Reward)

| Role | Read Balance | Read Ledger | Issue Rewards (RPC) | Approve Rewards |
|------|--------------|-------------|---------------------|-----------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ✅ | ⚠️ (via RPC) | ✅ |
| Cashier | ✅ | ❌ | ❌ | ❌ |
| Compliance | ❌ | ❌ | ❌ | ❌ |
| Reward Issuer | ✅ | ✅ | ✅ | ✅ |
| Automation | ❌ | ❌ | ⚠️ (batch only) | ❌ |
| Dealer | ❌ | ❌ | ❌ | ❌ |

### Player Financial Service (Finance)

| Role | Read Transactions | Create Transaction (RPC) | View Aggregations |
|------|-------------------|--------------------------|-------------------|
| Admin | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ⚠️ (table buy-ins only) | ✅ |
| Cashier | ✅ | ✅ | ✅ |
| Compliance | ✅ | ❌ | ✅ |
| Reward Issuer | ❌ | ❌ | ❌ |
| Automation | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ |

**Pit Boss Write Constraints** (amended 2025-12-10):
- `direction` MUST be `'in'` (buy-ins only; cash-outs require cashier)
- `tender_type` MUST be `'cash'` or `'chips'` (markers require cashier approval)
- `visit_id` MUST be provided (transaction linked to active session)
- **Rationale**: Pit bosses record table-side buy-ins during player sessions (PRD-008 cash-in form)

### MTL Service (Compliance)

| Role | Read MTL Entries | Create MTL Entry | Append Audit Note |
|------|------------------|------------------|-------------------|
| Admin | ✅ | ✅ | ✅ |
| Pit Boss | ❌ | ❌ | ❌ |
| Cashier | ✅ | ✅ | ❌ |
| Compliance | ✅ | ❌ | ✅ |
| Reward Issuer | ❌ | ❌ | ❌ |
| Automation | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ |

### Floor Layout Service (Spatial)

| Role | Read Layouts | Create/Update Layout | Activate Layout |
|------|--------------|----------------------|-----------------|
| Admin | ✅ | ✅ | ✅ |
| Pit Boss | ✅ | ❌ | ❌ |
| Cashier | ❌ | ❌ | ❌ |
| Compliance | ❌ | ❌ | ❌ |
| Reward Issuer | ❌ | ❌ | ❌ |
| Automation | ❌ | ❌ | ❌ |
| Dealer | ❌ | ❌ | ❌ |

**Legend**:
- ✅ Allowed
- ❌ Not permitted
- ⚠️ Limited/conditional access (see role definition)

---

## Authentication and Authorization Flow

### 1. User Authentication

```typescript
// User logs in via Supabase Auth
const { data: { user }, error } = await supabase.auth.signInWithPassword({
  email: 'pitboss@casino.com',
  password: 'secure_password'
});

// Returns: user.id (auth.users.id)
```

### 2. Staff Lookup and Context Retrieval

```typescript
// lib/supabase/rls-context.ts
export async function getAuthContext(
  supabase: SupabaseClient<Database>,
): Promise<RLSContext> {
  // 1. Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('UNAUTHORIZED: No authenticated user');
  }

  // 2. Lookup staff record via user_id
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, casino_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['pit_boss', 'admin', 'cashier']) // Exclude dealers
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
```

### 3. RLS Context Injection (ADR-015)

> **ADR-015 Compliance**: Uses `set_rls_context()` RPC for transaction-safe context injection with connection pooling support.

```typescript
// Inject context via set_rls_context() RPC (ADR-015)
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

**See**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` for implementation details.

### 4. RLS Policy Enforcement (Pattern C - Hybrid)

> **ADR-015 Compliance**: Hybrid pattern with transaction context + JWT fallback for connection pooling safety.

```sql
-- Example: Visit read policy (Pattern C - ADR-015)
create policy "visit_read_hybrid"
  on visit
  for select using (
    -- Verify authenticated user
    auth.uid() IS NOT NULL
    -- Verify casino scope (hybrid: SET LOCAL with JWT fallback)
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**See**: `docs/30-security/SEC-001-rls-policy-matrix.md` for complete policy templates.

### 5. Server Action Wrapper

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
  // Get RLS context
  const rlsContext = await getAuthContext(options.supabase);

  // Inject context
  await injectRLSContext(options.supabase, rlsContext);

  // Execute action (RLS policies now enforced)
  return await action();
}
```

---

## Realtime Channel Join Rules

Realtime subscriptions must enforce role-based access control at the channel join level. Channel predicates MUST include both `casino_id` and role checks.

### Channel Join Pattern

```typescript
// Example: Pit boss joining visit channel
const channel = supabase
  .channel(`visit:casino:${casinoId}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'visit',
      filter: `casino_id=eq.${casinoId}`, // Casino scope
    },
    (payload) => {
      // Handle visit changes
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Connected to visit channel');
    }
  });
```

### Role-Specific Channel Matrix

| Channel Type | Admin | Pit Boss | Cashier | Compliance | Reward Issuer | Automation | Dealer |
|--------------|-------|----------|---------|------------|---------------|------------|--------|
| Visit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rating Slip | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Table Context | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Loyalty | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Finance | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| MTL | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Floor Layout | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Note**: For high-cardinality dashboards, prefer **poll + ETag** refresh (React Query refetch with `If-None-Match`) rather than realtime streams.

---

## Anti-Patterns

### ❌ DON'T: Use JWT Claims for Role Checks

```sql
-- BAD: JWT claims can be stale
create policy "visit_read_bad"
  on visit for select using (
    auth.jwt() ->> 'role' = 'pit_boss'
  );
```

**Problems**:
- Claims not refreshed until next login
- No casino scope enforcement
- Bypasses `staff` table validation

### ✅ DO: Use Database Session Context

```sql
-- GOOD: Fresh from database, strongly typed
create policy "visit_read_good"
  on visit for select using (
    auth.uid() = (
      select user_id from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

---

### ❌ DON'T: Allow Dealer Authentication

```typescript
// BAD: Attempting to authenticate a dealer
const { data: staff } = await supabase
  .from('staff')
  .select('id, casino_id, role')
  .eq('user_id', user.id)
  .eq('role', 'dealer'); // WRONG: dealers have user_id = null
```

### ✅ DO: Exclude Dealers from Auth Lookups

```typescript
// GOOD: Explicitly exclude dealers
const { data: staff } = await supabase
  .from('staff')
  .select('id, casino_id, role')
  .eq('user_id', user.id)
  .in('role', ['pit_boss', 'admin', 'cashier']) // Dealers excluded
  .single();
```

---

### ❌ DON'T: Complex OR Trees for Roles

```sql
-- BAD: Hard to audit, prone to logic errors
create policy "complex_bad"
  on visit for select using (
    (auth.jwt() ->> 'role' = 'admin')
    OR (auth.jwt() ->> 'role' = 'pit_boss' AND casino_id = auth.jwt() ->> 'casino_id')
    OR (auth.jwt() ->> 'role' = 'cashier' AND is_financial = true)
  );
```

### ✅ DO: Single Deterministic Path

```sql
-- GOOD: One path, easy to verify
create policy "simple_good"
  on visit for select using (
    auth.uid() = (
      select user_id from staff
      where id = current_setting('app.actor_id')::uuid
      and role in ('pit_boss', 'admin')
    )
    AND casino_id = current_setting('app.casino_id')::uuid
  );
```

---

## Migration and Extension

### Adding New Roles

To add a new role to the system:

1. **Determine role type**:
   - Core staff role: Extend `staff_role` enum via migration
   - Service claim: Document in this taxonomy, implement in auth gateway

2. **For core staff roles**:
```sql
-- Add to enum (requires careful migration)
alter type staff_role add value 'cage';
```

3. **Update capabilities matrices**: Document all read/write capabilities by bounded context

4. **Create RLS policies**: Follow templates in SEC-001

5. **Update authentication flow**: Modify `getAuthContext` if needed

6. **Update realtime rules**: Define channel join permissions

7. **Document in this taxonomy**: Update all relevant sections

### Deprecating Roles

To deprecate a role:

1. Mark as deprecated in this taxonomy
2. Add EOL date
3. Create migration plan
4. Update all RLS policies to exclude deprecated role
5. Remove from `staff_role` enum after EOL period

---

## Security Checklist

- [ ] All roles documented with complete capabilities
- [ ] RLS policies reference session context, not JWT claims
- [ ] Dealers explicitly excluded from authentication flow
- [ ] Service claims have explicit issuance and expiration policies
- [ ] Channel join rules enforce role + casino_id predicates
- [ ] No service key usage in runtime code
- [ ] All mutations use `x-idempotency-key` header
- [ ] Audit logging captures role + actor_id for all mutations

---

## References

- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v3.0.2-PATCHED)
- **RLS Policies**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **RBAC Matrix**: `docs/30-security/SEC-003-rbac-matrix.md`
- **Tenancy Upgrade**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md`
- **Dealer Audit**: `docs/audits/DEALER_ROLE_BLAST_RADIUS_AUDIT_NOV_10.md`
- **RLS Context**: `lib/supabase/rls-context.ts`
- **Wrapper**: `lib/server-actions/with-server-action-wrapper.ts`

---

**Status**: ✅ Active
**Version**: 1.2.0
**Last Updated**: 2025-12-10

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2025-12-10 | **ADR-017 Compliance**: Promoted cashier from service claim to primary `staff_role` enum. Updated enum definition, authentication flow, and all RLS patterns to use `current_setting('app.staff_role')` as the **only** authority. Removed references to cashier as JWT claim. |
| 1.1.0 | 2025-12-10 | Added pit_boss write access to PlayerFinancialService for table buy-ins (direction='in', tender_type IN ('cash','chips'), requires visit_id). Aligned with PRD-008/PRD-009 business requirements. |
| 1.0.0 | 2025-11-17 | Initial release |
