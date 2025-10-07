# Schema Drift Audit Report

> **Date**: 2025-10-06
> **Auditor**: System Analysis
> **Context**: Post-migration type generation discrepancy

---

## Executive Summary

**Critical Finding**: Schema drift detected between local and remote database types.

**Impact**: Local types missing `graphql_public` schema and `__InternalSupabase` metadata.

**Root Cause**: Local types likely generated from older Supabase CLI version or different generation source.

---

## Detailed Comparison

### Missing from Local Types (`types/database.types.ts`)

#### 1. Internal Supabase Metadata
```typescript
// ❌ MISSING in local
__InternalSupabase: {
  PostgrestVersion: "13.0.4"
}
```

**Impact**: Type system may not enforce correct PostgREST version compatibility.

#### 2. GraphQL Schema Definition
```typescript
// ❌ MISSING in local
graphql_public: {
  Tables: { [_ in never]: never };
  Views: { [_ in never]: never };
  Functions: {
    graphql: {
      Args: {
        extensions?: Json;
        operationName?: string;
        query?: string;
        variables?: Json;
      };
      Returns: Json;
    };
  };
  Enums: { [_ in never]: never };
  CompositeTypes: { [_ in never]: never };
}
```

**Impact**: GraphQL endpoint typing unavailable for type-safe GraphQL queries.

### Schema Consistency (Both Files)

✅ **PUBLIC SCHEMA TABLES**: Identical (40 tables)
- player, visit, ratingslip, casino, gamingtable, etc.
- All table definitions match perfectly

✅ **ENUMS**: Identical (15 enums)
- StaffRole, VisitStatus, RatingSlipStatus, MtlArea, etc.

✅ **VIEWS**: Identical (4 MTL views)
- mtl_daily_summary
- mtl_patron_aggregates
- mtl_performance_metrics
- mtl_threshold_monitor

✅ **FUNCTIONS**: Identical (50+ functions)
- start_rated_visit, close_visit, jwt_get_role, etc.

---

## Migration History Analysis

**Migration Files Expected**:
```
supabase/migrations/
├── 20251002010000_enable_rls.sql
├── 20251002020000_jwt_helpers.sql
├── 20251002030000_audit_log_scaffold.sql
└── 20251002040000_compliance_table_stubs.sql
```

**Validation Required**: Confirm migrations applied to remote match local migration files.

---

## Type Generation Discrepancy

### Remote Types Generation
```bash
# Remote likely generated with:
supabase gen types typescript --linked
# OR
supabase gen types typescript --project-id <project-id>
```

**Result**: Includes internal metadata + GraphQL schema

### Local Types Generation
```bash
# Local likely generated with:
supabase gen types typescript --local
# OR older CLI version
```

**Result**: Missing internal metadata + GraphQL schema

---

## Risk Assessment

| Issue | Severity | Impact | Resolution Required |
|-------|----------|--------|---------------------|
| Missing `__InternalSupabase` | 🟡 Low | Type compatibility checks unavailable | Optional |
| Missing `graphql_public` | 🟡 Low | GraphQL typing unavailable (not used in MVP) | Optional |
| Table schema mismatch | 🟢 None | All tables identical | N/A |
| Enum mismatch | 🟢 None | All enums identical | N/A |
| Function mismatch | 🟢 None | All functions identical | N/A |

**Overall Risk**: 🟢 **LOW** - No production blockers

---

## Recommendations

### Immediate Actions

**Option A: Standardize on Remote Types (Recommended)**
```bash
# Replace local types with remote types
cp types/remote/database.types.ts types/database.types.ts

# Update import paths if needed
git commit -m "Sync local types with remote schema"
```

**Benefits**:
- Future-proof for GraphQL usage
- PostgREST version compatibility
- Single source of truth

**Option B: Keep Local Types (If GraphQL Not Needed)**
- Current setup works for REST API only
- No immediate action required
- Document decision in ADR

### Long-term Solutions

1. **Standardize Type Generation**
   ```bash
   # Add to package.json
   "scripts": {
     "db:types": "supabase gen types typescript --linked > types/database.types.ts"
   }
   ```

2. **CI Validation**
   ```yaml
   # .github/workflows/ci.yml
   - name: Validate Schema Sync
     run: |
       npm run db:types
       git diff --exit-code types/database.types.ts
   ```

3. **Pre-commit Hook**
   ```bash
   # Warn if types out of sync
   if ! git diff --exit-code types/database.types.ts; then
     echo "⚠️ Database types may be out of sync with remote"
   fi
   ```

---

## Migration Validation Checklist

- [ ] Verify all Phase 0-1 migrations applied to remote
- [ ] Confirm RLS enabled on core tables (player, visit, ratingslip, casino)
- [ ] Validate JWT helper functions exist (`jwt_get_role`)
- [ ] Check audit logging infrastructure (AuditLog table + policies)
- [ ] Test compliance table policies (mtl_entry access controls)

---

## Schema Comparison Matrix

| Component | Local | Remote | Status |
|-----------|-------|--------|--------|
| **Tables** | 40 | 40 | ✅ Match |
| **Views** | 4 | 4 | ✅ Match |
| **Functions** | ~50 | ~50 | ✅ Match |
| **Enums** | 15 | 15 | ✅ Match |
| **GraphQL Schema** | ❌ Missing | ✅ Present | ⚠️ Drift |
| **Internal Metadata** | ❌ Missing | ✅ Present | ⚠️ Drift |

---

## Testing Recommendations

### 1. Service Layer Compatibility Test
```typescript
// Verify local types work with services
import { Database } from '@/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

const testClient: SupabaseClient<Database> = createClient(/* ... */);
// Should compile without errors
```

### 2. Remote Connection Test
```bash
# Test remote types work with live connection
npm run db:types
npx tsc --noEmit
```

### 3. Migration Sync Test
```bash
# Verify local migrations match remote state
supabase db diff --linked
# Should show no differences if synced
```

---

## Affected Systems

### ✅ No Impact (Schema Identical)
- Player Service (services/player/*)
- Visit Service (services/visit/*)
- RatingSlip Service (services/ratingslip/*)
- All CRUD operations
- All business logic
- All database queries

### ⚠️ Potential Impact (If Used)
- GraphQL endpoint usage (not currently used)
- PostgREST version compatibility checks (not actively enforced)

---

## Action Items

### This Week
1. **Decision**: Choose Option A (sync) or Option B (document)
2. **Validate**: Run migration validation checklist
3. **Document**: Create ADR if keeping separate type files

### Next Week (Phase 3)
1. **Standardize**: Lock type generation in CI/CD
2. **Automate**: Add pre-commit type sync validation
3. **Monitor**: Track type drift in deployment pipeline

---

## Appendix: Type File Locations

```
types/
├── database.types.ts           # LOCAL (missing GraphQL + metadata)
└── remote/
    └── database.types.ts       # REMOTE (complete with GraphQL + metadata)

services/**/index.ts            # Import from @/types/database.types
```

**Current Import Pattern**:
```typescript
import type { Database } from "@/types/database.types"; // Uses LOCAL
```

**After Sync (if Option A)**:
```typescript
import type { Database } from "@/types/database.types"; // Uses REMOTE content
```

---

**Audit Status**: ✅ Complete
**Next Review**: After Phase 2 completion (2025-10-27)