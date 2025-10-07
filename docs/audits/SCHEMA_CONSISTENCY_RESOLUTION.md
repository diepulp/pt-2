# Schema Consistency Resolution: UUID Migration

**Date**: 2025-10-07
**Status**: ✅ Resolved
**Impact**: Low (test data only)
**Priority**: P1 (Critical for long-term maintainability)

---

## Executive Summary

Discovered and resolved schema inconsistency where `ratingslip.id` used TEXT primary key while all other domain tables used UUID. This created implicit technical debt through casting overhead, type-unsafe joins, and ORM friction.

**Resolution**: Migrated `ratingslip.id` from TEXT → UUID with zero production impact during nascent development phase.

---

## Problem Statement

### Inconsistency Discovered
```sql
-- ❌ Anti-Pattern: Mixed ID types
ratingslip.id              TYPE: TEXT
player.id                  TYPE: UUID
visit.id                   TYPE: UUID
casino.id                  TYPE: UUID
player_financial_transaction.rating_slip_id  TYPE: ??? -- Type mismatch!
```

### Technical Debt Manifestations

1. **Type-Unsafe Foreign Keys**:
   ```sql
   -- Would require explicit casting
   rating_slip_id TEXT REFERENCES ratingslip(id)
   -- vs clean UUID reference
   rating_slip_id UUID REFERENCES ratingslip(id)
   ```

2. **ORM Friction**: TypeScript types generated from Supabase show inconsistent ID semantics
   ```typescript
   // Inconsistent
   player.id: string (UUID format)
   ratingslip.id: string (arbitrary TEXT)
   ```

3. **Join Casting Overhead**:
   ```sql
   -- Anti-pattern joins requiring casts
   SELECT * FROM accrual_history ah
   JOIN ratingslip r ON ah.session_id::uuid = r.id::text
   ```

4. **Audit Log Inconsistency**: Mixed types in event streams and audit tables

---

## Impact Analysis

### Dependencies Found
```sql
-- Single foreign key dependency
accrual_history.session_id TEXT → ratingslip.id TEXT
```

### Data Volume
- **ratingslip**: 17 records (test fixtures)
- **accrual_history**: 5 records (test data)
- **Production data**: None (nascent domain)

### Migration Window
- **Opportunity Cost**: Near zero
- **Breaking Changes**: None (no production API coupling)
- **UI Layer**: Not yet built
- **Server Actions**: Not yet implemented

---

## Resolution

### Migration: 20251006234000_migrate_ratingslip_id_to_uuid.sql

**Strategy**: Atomic transaction with comprehensive verification

```sql
BEGIN;

-- 1. Drop FK constraint
ALTER TABLE accrual_history DROP CONSTRAINT accrual_history_session_id_fkey;

-- 2. Clear test data (non-deterministic TEXT → UUID conversion)
TRUNCATE TABLE accrual_history CASCADE;
TRUNCATE TABLE ratingslip CASCADE;

-- 3. Convert column types
ALTER TABLE ratingslip
  DROP CONSTRAINT ratingslip_pkey CASCADE,
  ALTER COLUMN id TYPE UUID USING gen_random_uuid(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD PRIMARY KEY (id);

ALTER TABLE accrual_history
  ALTER COLUMN session_id TYPE UUID USING session_id::uuid;

-- 4. Re-establish FK with UUID types
ALTER TABLE accrual_history
  ADD CONSTRAINT accrual_history_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES ratingslip(id) ON DELETE CASCADE;

-- 5. Re-enable RLS
ALTER TABLE ratingslip ENABLE ROW LEVEL SECURITY;
ALTER TABLE accrual_history ENABLE ROW LEVEL SECURITY;

-- 6. Verification
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'ratingslip' AND column_name = 'id') != 'uuid' THEN
    RAISE EXCEPTION 'Migration failed: ratingslip.id is not UUID';
  END IF;
  RAISE NOTICE 'Schema consistency achieved: all IDs are UUID';
END $$;

COMMIT;
```

### Function Updates

**No changes required** - existing `start_rated_visit()` function automatically adapts:
```sql
-- Before: v_rating_slip_id TEXT
-- After:  v_rating_slip_id UUID (RETURNING id now returns UUID)
INSERT INTO ratingslip (...) RETURNING id INTO v_rating_slip_id;
```

---

## Benefits Achieved

### 1. Unified ID Semantics
✅ All domain tables speak UUID natively
✅ Zero casting overhead in queries
✅ Type-safe foreign key relationships

### 2. ORM Consistency
✅ Supabase generated types are uniform
✅ TypeScript DTOs have consistent ID fields
✅ No `as string` casts in application code

### 3. Future Resilience
✅ Event logs can reference any domain uniformly
✅ Audit tables support polymorphic references
✅ MTL entries can link to sessions via UUID

### 4. Developer Experience
✅ Cleaner join syntax without casts
✅ Predictable ID generation patterns
✅ Consistent validation logic

---

## Anti-Pattern Classification

**Category**: Schema Design - Identity Management
**Severity**: P1 (High - Long-term technical debt)
**Detection**: Manual discovery during PlayerFinancialService implementation

### Added to PRD §4 Anti-Pattern Guardrails

```markdown
- **Schema Consistency: Enforce UUID Primary Keys Universally**:
  - Anti-Pattern: Mixed ID types (TEXT vs UUID) create casting overhead
  - Violation: ratingslip.id was TEXT (now resolved)
  - Enforcement: All new tables MUST use UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - Pre-migration audits required for inherited TEXT-based IDs
```

**Location**: [CANONICAL_BLUEPRINT_MVP_PRD.md](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails)

---

## Verification

### Post-Migration Checks

```sql
-- ✅ Verify UUID types
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('ratingslip', 'accrual_history')
  AND column_name IN ('id', 'session_id');

-- Expected output:
-- ratingslip       | id          | uuid
-- accrual_history  | session_id  | uuid
```

### Type Generation
```bash
npx supabase gen types typescript --local > types/database.types.ts
```

**Result**: TypeScript types now show consistent UUID semantics:
```typescript
ratingslip: {
  Row: {
    id: string // UUID format
    // ...
  }
}
```

---

## Lessons Learned

### Detection Strategy
- **Proactive**: Implement pre-migration schema audits checking for:
  - Mixed ID types across tables
  - Inconsistent enum naming conventions
  - Non-standard constraint patterns

### Prevention
1. **Template Enforcement**: Service template includes UUID PK by default
2. **Linting**: Add custom ESLint rule to detect TEXT primary keys in new migrations
3. **Code Review**: Schema changes require explicit ID type justification

### Timing
- **Optimal Window**: Nascent domain (no production data or API coupling)
- **Risk**: Near zero - test fixtures only
- **Cost**: 2 hours (analysis + migration + verification)

---

## Recommendations

### Immediate (Phase 2)
- ✅ Document anti-pattern in PRD
- ✅ Update INDEX.md with resolution summary
- ⏳ Audit remaining tables for similar issues

### Short-term (Phase 3)
- Create schema linting rules for new migrations
- Add UUID consistency checks to CI pipeline
- Document ID generation patterns in service template

### Long-term (Phase 4+)
- Implement automated schema drift detection
- Create pre-production schema audit playbook
- Add type consistency checks to deployment gates

---

## References

- **Migration**: [20251006234000_migrate_ratingslip_id_to_uuid.sql](../../supabase/migrations/20251006234000_migrate_ratingslip_id_to_uuid.sql)
- **PRD Update**: [CANONICAL_BLUEPRINT_MVP_PRD.md §4](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails)
- **Service Responsibility Matrix**: [SERVICE_RESPONSIBILITY_MATRIX.md](../phase-2/SERVICE_RESPONSIBILITY_MATRIX.md)
- **Schema Drift Audit**: [SCHEMA_DRIFT_AUDIT.md](SCHEMA_DRIFT_AUDIT.md)

---

**Status**: ✅ Closed - Schema consistency achieved
**Next Review**: Phase 3 (UI layer implementation)
**Owner**: Backend Architecture Team
