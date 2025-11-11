# Dealer Role Blast Radius Audit

**Date**: 2025-11-10
**Purpose**: Assess blast radius of potential dealer role changes
**Context**: Current SRM implies dealers require authentication and have operational permissions. User clarifies dealer role is innocuous, secondary (rotations only), not vital to gaming ops, and should NOT log in.

---

## Executive Summary

### Current State Misalignment

The SRM documents dealer as an **authenticated, operational staff role** with:
- Default staff role assignment
- RLS policy enforcement requiring `staff.user_id` linkage
- Read access to chip custody data
- Operational staff classification

### Actual Business Requirement (Clarified)

Dealer role is:
- **Innocuous** to application operations
- **Secondary** - tracked only for rotation scheduling
- **Non-authenticated** - should NOT log in to application
- **Non-vital** - not essential to gaming operations

### Impact Assessment

**BLAST RADIUS: LOW to MEDIUM**

- Schema changes: Minimal (enum value, dealer_rotation table)
- Service implementations: Not yet built (skeleton routes only)
- RLS policies: Not yet implemented (target state only)
- Application logic: No dealer-specific business logic exists
- Migration complexity: Low (service in early phase)

---

## Detailed Findings

### 1. Schema Layer (Database)

#### 1.1 `staff_role` Enum

**Location**: `supabase/migrations/00000000000000_baseline_srm.sql:6`

```sql
create type staff_role as enum ('dealer','pit_boss','admin');
```

**Impact**:
- Dealer is one of three enumerated roles
- Used as default role for new staff records (line 48)
- Referenced in RLS policy definitions (SRM, not yet implemented)

**Change Required**:
- **Option A**: Keep enum value, change semantic meaning (non-authenticated role)
- **Option B**: Remove from enum, create separate `rotation_role` or similar
- **Option C**: Deprecate dealer enum value, use `null` or separate tracking table

**Recommendation**: Option A (minimal disruption, semantic change only)

---

#### 1.2 `staff` Table Default Role

**Location**: `supabase/migrations/00000000000000_baseline_srm.sql:48`

```sql
role staff_role not null default 'dealer',
```

**Impact**:
- All new staff records default to 'dealer' role
- Implies dealer is the "base" staff role
- Conflicts with clarified business requirement (dealers shouldn't be staff)

**Change Required**:
- Change default to `'pit_boss'` or remove default (require explicit role)
- If dealers are non-authenticated, they likely shouldn't have staff records at all

**Recommendation**:
```sql
role staff_role not null, -- No default, explicit assignment required
```

---

#### 1.3 `dealer_rotation` Table

**Location**: `supabase/migrations/00000000000000_baseline_srm.sql:136-143`

```sql
create table dealer_rotation (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  table_id uuid not null references gaming_table(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
```

**Impact**:
- Core table for tracking dealer assignments
- FK to `staff` table (implies dealers are staff members)
- Owned by TableContext service
- No RLS policies implemented yet

**Issues**:
1. **FK Mismatch**: If dealers aren't staff, `staff_id` FK is incorrect
2. **Naming**: "dealer_rotation" implies operational importance
3. **Authentication Assumption**: SRM RLS patterns require `staff.user_id` for dealers

**Change Options**:

**Option A: Decouple Dealers from Staff**
```sql
-- New table: dealer (non-authenticated)
create table dealer (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  employee_id text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Update dealer_rotation
alter table dealer_rotation
  drop column staff_id,
  add column dealer_id uuid references dealer(id) on delete set null;
```

**Option B: Keep Structure, Change Semantics**
- Keep `staff_id` FK
- Allow dealers to exist in `staff` table WITHOUT `user_id` (non-authenticated)
- Update constraint: `staff.user_id` can be null for dealer role
- Update RLS: Exclude dealers from authentication checks

**Option C: Rename and Simplify**
```sql
-- Rename for clarity
alter table dealer_rotation rename to table_dealer_assignment;

-- Keep structure, document as "scheduling only"
comment on table table_dealer_assignment is
  'Tracks dealer assignments for scheduling purposes only.
   Dealers are non-authenticated and have no application permissions.';
```

**Recommendation**: Option B (minimal disruption, clearest path forward)

---

#### 1.4 Indexes and Constraints

**Location**: `supabase/migrations/00000000000000_baseline_srm.sql:145-146, 337-338`

```sql
create index ix_dealer_rotation_table_time
  on dealer_rotation (table_id, started_at desc);

create trigger trg_dealer_rotation_casino
before insert or update on dealer_rotation
for each row execute function assert_table_context_casino();
```

**Impact**:
- Performance index for rotation queries (no change needed)
- Casino integrity trigger (no change needed)

**Change Required**: None

---

### 2. Service Layer (Application)

#### 2.1 TableContext Service - Dealer Rotations API

**Location**: `app/api/v1/table-context/dealer-rotations/route.ts`

**Status**: Skeleton implementation (TODO comments, no business logic)

```typescript
export async function POST(request: NextRequest) {
  // TODO: Invoke TableContextService.startRotation and return the result
  return successResponse(ctx, null);
}
```

**Impact**:
- No dealer-specific business logic implemented yet
- Service layer not yet built
- Easy to change semantic meaning before implementation

**Change Required**:
- Update API design to reflect non-authenticated dealer model
- Remove authentication requirements from future implementation
- Document as "scheduling/tracking only" endpoint

---

#### 2.2 Casino Service - Staff API

**Location**: `app/api/v1/casinos/[casinoId]/staff/route.ts:19`

**Status**: Skeleton implementation

```typescript
const staffListQuerySchema = z.object({
  role: z.enum(['dealer', 'pit_boss', 'admin']).optional(),
});
```

**Impact**:
- Staff list API allows filtering by dealer role
- Implies dealers are queryable as staff members
- Skeleton only, easy to change

**Change Required**:
- If dealers are decoupled from staff, remove 'dealer' from enum
- If dealers remain in staff table, document non-authenticated status
- Update API to clarify dealer records have no auth/permissions

---

#### 2.3 Service Keys

**Location**: `services/table-context/keys.ts:43-46`

```typescript
dealerRotations: (tableId: string) =>
  [...ROOT, 'dealer-rotations', tableId] as const,
startRotation: (tableId: string) =>
  [...ROOT, 'start-rotation', tableId] as const,
```

**Impact**:
- Query key structure for dealer rotations
- No business logic, just cache key definitions

**Change Required**:
- Rename for clarity if desired (`tableStaffAssignments`, `scheduledRotations`)
- Or keep as-is with updated documentation

---

**Location**: `services/casino/keys.ts:5`

```typescript
export type CasinoStaffFilters = {
  role?: 'dealer' | 'pit_boss' | 'admin';
};
```

**Impact**: Type definition for staff filtering

**Change Required**: Remove 'dealer' if decoupled from staff table

---

### 3. SRM Documentation Layer

#### 3.1 Service Ownership Claims

**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

**Issue**: SRM claims dealer role has operational significance

**Key Misrepresentations**:

1. **Line 899** - Service ownership table:
   ```
   | **Operational** | `TableContextService` |
     • Dealer rotations |
     • Staff (FK, dealers) |
     **Table lifecycle & operational telemetry** |
   ```
   - **Problem**: Classifies dealers as "operational telemetry"
   - **Reality**: Dealers are scheduling metadata, not operational

2. **Line 741** - RLS Policy Table:
   ```
   | **Table Context** | `dealer_rotation` | Operations staff | Pit boss, admin |
   ```
   - **Problem**: Implies "operations staff" (including dealers) have read access
   - **Reality**: If dealers don't log in, they can't have access policies

3. **Line 1592** - Chip Custody RLS:
   ```
   - **Read:** same-casino for `pit_boss`, `dealer`, `accounting_read`, ...
   ```
   - **Problem**: Grants dealers READ access to chip custody data
   - **Reality**: Non-authenticated dealers can't query database

4. **Line 625-725** - Target RLS Patterns:
   - **Problem**: All RLS policies require `staff.user_id` validation
   - **Reality**: If dealers have no `user_id`, RLS patterns break for dealer role

---

#### 3.2 Security Assumptions

**Location**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md:149-151`

```typescript
const { data: staff, error: staffError } = await supabase
  .from('staff')
  .select('id, casino_id, role')
  .eq('user_id', user.id) // ❌ ASSUMES all staff have user_id
  .eq('status', 'active')
  .single();
```

**Issue**: Security upgrade assumes ALL staff (including dealers) link to auth users

**Impact**:
- Migration `20251110224223_staff_authentication_upgrade.sql` just added `user_id` column
- Comments state: "After backfill is complete, run: `alter table staff alter column user_id set not null;`"
- If dealers are in staff table without authentication, NOT NULL constraint will fail

**Change Required**:
- Update security upgrade docs to exclude dealers from auth requirement
- Allow `user_id = null` for dealer role
- Update RLS context logic to handle null user_id (skip auth for dealers)

---

### 4. Type Definitions

**Location**: `types/database.types.ts:1831, 1980`

```typescript
staff_role: "dealer" | "pit_boss" | "admin"
```

**Impact**: Generated from database schema via `npm run db:types`

**Change Required**: Automatically updates when schema changes (no manual action)

---

## Blast Radius Analysis

### Impact by Layer

| Layer | Component | Current State | Change Required | Complexity |
|-------|-----------|---------------|-----------------|------------|
| **Schema** | `staff_role` enum | 'dealer' value | Keep, change semantics | LOW |
| **Schema** | `staff` default role | `default 'dealer'` | Remove default | LOW |
| **Schema** | `dealer_rotation` table | FK to staff | Keep, allow null user_id | LOW |
| **Schema** | `staff.user_id` constraint | Pending NOT NULL | Keep nullable for dealers | LOW |
| **Service** | Dealer rotations API | Skeleton | Update design | LOW |
| **Service** | Staff list API | Skeleton | Remove dealer filter | LOW |
| **Service** | Query keys | Defined | Rename or document | LOW |
| **RLS** | Security patterns | Not implemented | Exclude dealers | MEDIUM |
| **Docs** | SRM | Misrepresents dealers | Rewrite sections | MEDIUM |
| **Docs** | Security upgrade | Assumes auth | Update assumptions | MEDIUM |

### Risk Assessment

**LOW RISK**: Schema and service changes (services not yet implemented)
**MEDIUM RISK**: Documentation updates (requires semantic clarification across multiple docs)
**HIGH RISK**: None identified (early phase, no prod usage)

---

## Recommended Changes

### Phase 1: Schema Clarification (Immediate)

**Migration**: `YYYYMMDDHHMMSS_dealer_role_clarification.sql`

```sql
-- 1. Remove default role (require explicit assignment)
alter table staff alter column role drop default;

comment on column staff.role is
  'Staff role. Dealer role is for scheduling only (non-authenticated).
   Pit boss and admin roles require authentication and have operational permissions.';

-- 2. Update user_id constraint documentation
comment on column staff.user_id is
  'Links staff record to Supabase auth user. Required for pit_boss and admin roles.
   Optional for dealer role (dealers do not authenticate).';

-- 3. Update dealer_rotation table documentation
comment on table dealer_rotation is
  'Tracks dealer-to-table assignments for scheduling purposes only.
   Dealers are non-authenticated and have no application permissions.
   This is operational metadata, not access control.';
```

---

### Phase 2: SRM Updates (Immediate)

**File**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

**Changes Required**:

1. **Line 741** - RLS Policy Table
   ```diff
   - | **Table Context** | `dealer_rotation` | Operations staff | Pit boss, admin |
   + | **Table Context** | `dealer_rotation` | Pit boss, admin | Pit boss, admin |
   ```
   - Remove "operations staff" read access (dealers don't log in)

2. **Line 899** - Service ownership
   ```diff
   - • Dealer rotations
   - • Staff (FK, dealers)
   + • Dealer assignment tracking (scheduling metadata)
   + • Staff (FK to non-authenticated dealer records)
   ```

3. **Line 1592** - Chip custody RLS
   ```diff
   - - **Read:** same-casino for `pit_boss`, `dealer`, `accounting_read`, ...
   + - **Read:** same-casino for `pit_boss`, `accounting_read`, `cage_read`, `compliance_read`
   ```
   - Remove dealer from chip custody access

4. **Add Dealer Role Clarification Section** (after line 1000):
   ```markdown
   ### Dealer Role Semantics

   **IMPORTANT**: The `staff_role` enum includes 'dealer', but dealer records are **non-authenticated**.

   - **Dealer role**: Scheduling metadata only. No login, no permissions, no RLS enforcement.
   - **Pit boss/admin roles**: Authenticated staff with operational permissions.

   **Implications**:
   - `staff.user_id` is **required** for pit_boss and admin roles
   - `staff.user_id` is **null** for dealer role (dealers do not authenticate)
   - `dealer_rotation` table tracks scheduling only, not access control
   - Dealers have **zero application permissions**
   ```

---

### Phase 3: Security Upgrade Updates (Immediate)

**File**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md`

**Changes Required**:

1. **Line 149-151** - Update auth context logic:
   ```typescript
   const { data: staff, error: staffError } = await supabase
     .from('staff')
     .select('id, casino_id, role')
     .eq('user_id', user.id)
     .eq('status', 'active')
     .in('role', ['pit_boss', 'admin']) // ✅ Exclude dealers
     .single();
   ```

2. **Add Dealer Exception Section**:
   ```markdown
   ### Dealer Role Exception

   Dealers are **not authenticated** and do not require `user_id` linkage.

   - Dealer records in `staff` table have `user_id = null`
   - Dealers cannot log in to the application
   - Dealers have no RLS context (no `app.actor_id` injection)
   - Dealer rotations are managed by pit boss/admin roles via administrative APIs
   ```

---

### Phase 4: Migration Rollback Check (Immediate)

**File**: `supabase/migrations/20251110224223_staff_authentication_upgrade.sql`

**Issue**: Migration comments state:
```sql
-- After backfill is complete, run:
--   alter table staff alter column user_id set not null;
```

**Problem**: If dealers are in staff table, NOT NULL constraint will fail

**Action Required**: Update migration comments:

```sql
-- IMPORTANT: user_id column is nullable to support dealer role.
--
-- Dealers are non-authenticated and have user_id = null.
-- Only pit_boss and admin roles require user_id.
--
-- DO NOT add NOT NULL constraint to user_id column.
--
-- Validation (before deployment):
--   -- All pit_boss and admin staff must have user_id
--   select count(*) from staff
--   where role in ('pit_boss', 'admin') and user_id is null;
--   -- Should return 0
--
--   -- All dealer staff should have user_id = null
--   select count(*) from staff
--   where role = 'dealer' and user_id is not null;
--   -- Should return 0 (or very few legacy records)
```

---

### Phase 5: API Design Updates (Before Implementation)

**File**: `app/api/v1/table-context/dealer-rotations/route.ts`

**Update Header Comments**:
```typescript
/**
 * Dealer Rotation API
 *
 * IMPORTANT: Dealers are non-authenticated. This API is for administrative
 * management of dealer assignments (scheduling metadata).
 *
 * - POST /dealer-rotations: Start a new dealer rotation (pit boss/admin only)
 * - Dealers do not call this API (they don't log in)
 * - Dealer assignments are managed by supervisory roles
 */
```

**File**: `app/api/v1/casinos/[casinoId]/staff/route.ts`

**Update Query Schema**:
```typescript
const staffListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(['dealer', 'pit_boss', 'admin']).optional(), // Keep dealer for scheduling queries
  authenticated: z.boolean().optional(), // New filter: exclude non-authenticated (dealers)
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
```

---

## Alternative Architectures

### Option A: Separate Dealer Table (Cleanest Separation)

**Pros**:
- Clear semantic separation (dealers ≠ staff)
- No authentication confusion
- Simpler RLS logic (staff table always requires user_id)

**Cons**:
- Schema migration required
- Breaks existing FK relationships
- More tables to manage

**Implementation**:
```sql
create table dealer (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  employee_id text unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table dealer_rotation rename column staff_id to dealer_id;
alter table dealer_rotation
  add constraint fk_dealer foreign key (dealer_id) references dealer(id) on delete set null;
```

---

### Option B: Keep Unified Staff Table (Minimal Disruption)

**Pros**:
- No schema changes required
- Simpler migration path
- Dealers can "graduate" to authenticated roles if needed

**Cons**:
- Semantic confusion (dealers in staff table)
- RLS logic must handle null user_id
- Documentation burden (explain exception)

**Implementation**:
- Allow `staff.user_id = null` for dealer role
- Update RLS patterns to check role + user_id
- Document dealer role as "scheduling metadata only"

---

### Option C: Remove Dealer from Enum, Use Separate Tracking

**Pros**:
- Staff table only for authenticated roles
- Dealers tracked separately (e.g., `rotation_participant` table)

**Cons**:
- Major refactor required
- Breaks type definitions
- Complex migration

**Not Recommended**: Too disruptive for benefit gained

---

## Recommended Architecture: Option B (Keep Unified Staff Table)

**Rationale**:
1. **Early Phase**: Services not yet implemented, minimal production impact
2. **Minimal Disruption**: No schema overhaul, just semantic clarification
3. **Flexibility**: Allows dealers to be promoted to authenticated roles if requirements change
4. **Clear Documentation**: Can be made unambiguous with proper comments and docs

**Key Principle**:
> "Dealer role exists in staff table for scheduling purposes only. Dealers are non-authenticated participants tracked for operational visibility, not access control."

---

## Immediate Action Items

### Critical (Block Development)

- [ ] Update `staff` table: Remove default role
- [ ] Update `staff.user_id` comments: Clarify null for dealers
- [ ] Update migration `20251110224223`: Remove NOT NULL instruction
- [ ] Update SRM Line 1592: Remove dealer from chip custody RLS
- [ ] Update SRM Line 741: Remove dealer from dealer_rotation read access

### High Priority (Before Service Implementation)

- [ ] Update SECURITY_TENANCY_UPGRADE.md: Add dealer exception section
- [ ] Update SRM: Add "Dealer Role Semantics" clarification section
- [ ] Update dealer-rotations API: Add header comments clarifying non-auth
- [ ] Update staff API: Add authenticated filter option

### Medium Priority (Documentation Cleanup)

- [ ] Update VIS-001: Clarify dealer role scope and permissions
- [ ] Create ADR: "Dealer Role as Non-Authenticated Scheduling Metadata"
- [ ] Update DTO_CANONICAL_STANDARD: Document DealerRotationDTO semantics
- [ ] Update ERROR_TAXONOMY: Clarify TABLE_DEALER_CONFLICT error context

### Low Priority (Nice to Have)

- [ ] Rename `dealer_rotation` to `table_dealer_assignment` (clarity)
- [ ] Add validation: Ensure dealers never get user_id assigned
- [ ] Add CI check: Validate no RLS policies grant dealer access

---

## Conclusion

**Blast Radius**: LOW to MEDIUM
**Recommended Approach**: Semantic clarification via documentation + minimal schema updates
**Risk Level**: LOW (early phase, skeleton implementations)

The current SRM misrepresents the dealer role as an authenticated, operational staff member with application permissions. In reality, dealers are **non-authenticated scheduling metadata** tracked for visibility only.

The recommended path forward is:
1. Keep dealer in `staff` table (minimal disruption)
2. Allow `staff.user_id = null` for dealer role (no authentication)
3. Update all documentation to clarify dealer semantics
4. Exclude dealers from RLS policies and access patterns
5. Document dealer_rotation as "scheduling metadata, not access control"

This approach requires **zero application code changes** (services not yet implemented) and **minimal schema changes** (just documentation updates and constraint clarifications).

**Estimated Effort**: 2-4 hours for comprehensive documentation updates + schema comment additions.

---

**End of Report**
