# ADR-017: Cashier Role Implementation Strategy

**Status**: Adopted
**Date**: 2025-12-10
**Author**: Lead Architect
**Affects**: SEC-005, SEC-001, SEC-003, SRM, PRD-009

---

## Context

PRD-009 Cashier Workflows Addendum expands MVP scope to include cashier-facing operations:
- Cash-out recording at cage (chips → cash)
- Marker issuance and settlement

> **Note (SRM v4.2.0):** "Cage buy-ins" were originally listed here but removed from scope. Players do not buy-in at the cage—buy-ins occur at gaming tables with pit bosses. All MVP financial transactions require `visit_id`.

SEC-005 v1.1.0 documents "cashier" as a **Service Claim** (not in `staff_role` enum), but provides RLS policy patterns that reference `role in ('cashier', 'admin')`. This is **inconsistent** because:

1. The `staff_role` enum is: `('dealer', 'pit_boss', 'admin')` - no 'cashier'
2. No "service claim" infrastructure exists in the codebase
3. `rls-context.ts` returns `staff.role` which can only be enum values
4. RLS policies checking `role in ('cashier', ...)` would never match

### Current State Analysis

```sql
-- staff_role enum (source of truth: types/database.types.ts)
create type staff_role as enum ('dealer', 'pit_boss', 'admin');
```

```typescript
// rls-context.ts - returns staff.role directly
return {
  actorId: staff.id,
  casinoId: staff.casino_id,
  staffRole: staff.role,  // Only enum values: dealer | pit_boss | admin
};
```

### Problem

SEC-005 documents cashier capabilities and RLS patterns, but the underlying implementation cannot support them. This blocks PRD-009 cashier workflows.

---

## Decision

**Add 'cashier' to the `staff_role` enum** via database migration.

This approach:
- Aligns with existing authentication patterns (pit_boss, admin)
- Requires minimal infrastructure changes
- Makes RLS policies work as documented in SEC-005
- Keeps role management simple (one source: `staff` table)

### Migration

```sql
-- Migration: YYYYMMDDHHMMSS_add_cashier_role.sql
ALTER TYPE staff_role ADD VALUE 'cashier';
```

### Resulting Enum Definition (Illustrative)

After migration, the `staff_role` enum will contain:

```sql
-- This is the resulting state, NOT the migration command
create type staff_role as enum ('dealer', 'pit_boss', 'admin', 'cashier');
```

### Authentication Flow (No Changes Required)

The existing `getAuthContext()` flow works unchanged:
1. User authenticates via Supabase Auth
2. Staff record looked up by `user_id`
3. `staff.role` returned (now can be 'cashier')
4. Injected via `set_rls_context()` RPC
5. RLS policies check `current_setting('app.staff_role')`

#### RLS Context Wiring (Explicit)

```typescript
// lib/supabase/rls-context.ts
const context = await getAuthContext();
// context.staffRole = staff.role from database (enum value)

// set_rls_context() RPC sets:
SET LOCAL app.staff_role = context.staffRole;  -- 'cashier' | 'pit_boss' | etc.

// RLS policies then check:
current_setting('app.staff_role', true) = 'cashier'
```

The `app.staff_role` session variable is the **single source of authority** for RLS policy evaluation. No JWT claims or service claims are consulted.

---

## Consequences

### Positive

1. **Simple implementation**: Single enum migration
2. **Consistent patterns**: Cashier uses same auth flow as pit_boss/admin
3. **RLS policies work**: `role in ('cashier', 'admin')` now valid
4. **SEC-005 becomes accurate**: Documented patterns match implementation
5. **No new infrastructure**: Uses existing `rls-context.ts`, `set_rls_context()` RPC

### Negative

1. **Enum extension**: Cannot remove enum values without data migration
2. **Coarse-grained role**: As with dealer, cashier is a coarse-grained role; using it as a proxy for fine-grained permissions would be an anti-pattern. SEC-005 discourages "role explosion" and recommends a capabilities system if the role list grows beyond current scope.
3. **Single-role limitation**: Each staff record has exactly one `role` value. A person cannot simultaneously be pit_boss AND cashier without separate staff records. A future ADR can introduce fine-grained capabilities or role composition if/when multi-role requirements emerge.

### Neutral

1. **SEC-005 update required**: Change "Service Claim" to "Staff Role" for cashier
2. **SEC-003 update required**: RBAC matrix already includes cashier, just needs issuer correction

---

## Alternatives Considered

### Alternative A: Dual-Role System (Service Claims)

Add a separate `app.service_claim` session variable alongside `app.staff_role`:

```sql
SET LOCAL app.service_claim = 'cashier';
```

**Rejected because**:
- Requires new RPC parameter
- Requires updates to all RLS policies to check both settings
- Adds complexity without clear benefit
- SEC-005 anti-pattern guidance says "avoid complex OR trees"

### Alternative B: Embed in JWT Claims

Store cashier role in JWT `app_metadata`:

```sql
(auth.jwt() -> 'app_metadata' ->> 'service_role')::text = 'cashier'
```

**Rejected because**:
- SEC-005 explicitly marks this as anti-pattern
- Claims not refreshed until next login
- Bypasses `staff` table validation

### Alternative C: Cashier as Pit Boss + Flag

Add `is_cashier` boolean to staff table:

```sql
ALTER TABLE staff ADD COLUMN is_cashier boolean DEFAULT false;
```

**Rejected because**:
- Muddles role semantics
- Complex RLS policies
- Doesn't scale to other service claims

---

## Implementation Plan

### Phase 1: Database Migration

```sql
-- 1. Add cashier to enum
ALTER TYPE staff_role ADD VALUE 'cashier';

-- 2. No existing cashier records to migrate (new role)
```

### Phase 2: Governance Updates (This ADR Triggers)

| Document | Update Required |
|----------|-----------------|
| SEC-005 | Replace references to "cashier service claim" with "cashier staff_role"; update all example policies to use `current_setting('app.staff_role')` as the **only** authority |
| SEC-001 | Add cashier RLS policy templates |
| SEC-003 | Update issuer column for cashier role |
| SRM | Document cashier in PlayerFinancialService section |

### Phase 3: PRD-009 Execution

With cashier role properly implemented, PRD-009 workstreams can proceed:
- WS1: Migration (includes this enum change)
- WS2: RPC with cashier validation
- WS3: Service layer
- WS4+: Transport and UI

---

## Security Considerations

1. **Authentication required**: Cashier staff must have `user_id` linking to `auth.users`
2. **Casino scoping**: All cashier operations scoped by `casino_id` via RLS
3. **Audit trail**: `created_by_staff_id` records cashier actor
4. **Idempotency**: All mutations require `x-idempotency-key`
5. **Role assignment restriction**: Assignment of `staff.role = 'cashier'` is restricted to admin-only workflows (see SEC-003 / Staff Admin UI). Direct SQL grants are prohibited in production environments.

---

## Definition of Done

- [x] ADR-017 adopted
- [x] Migration `20251210230846_adr017_add_cashier_role.sql` deployed
- [x] SEC-005 updated (cashier as Staff Role) — v1.2.0
- [x] SEC-001 updated (cashier RLS templates) — v1.1.0
- [x] SEC-003 updated (issuer correction) — v1.1.0
- [x] SRM updated (PlayerFinancialService cashier capabilities) — v4.1.0
- [x] `npm run db:types` regenerates types
- [x] `types/database.types.ts` shows `staff_role: "dealer" | "pit_boss" | "admin" | "cashier"`

---

## References

- PRD-009: Player Financial Service
- PRD-009 Addendum: Cashier Workflows
- SEC-005: Role Taxonomy (v1.1.0)
- SEC-001: RLS Policy Matrix
- SEC-003: RBAC Matrix
- ADR-015: RLS Connection Pooling Strategy
