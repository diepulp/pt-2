# RUN-005 Type Sync Runbook

**Status**: Active
**Owner**: Platform/SRE
**Cross-Reference**: [RUN-003 Migration](RUN-003-schema-migration-runbook.md), [RUN-002 Schema Reload](RUN-002-schema-reload.md)

---

## Overview

TypeScript type definitions for database schemas must stay in sync with the actual database schema. The PT-2 system maintains a single source of truth (`types/database.types.ts`) generated from the Supabase schema. This runbook provides procedures for generating, verifying, and troubleshooting type synchronization.

**Critical Standards**:
- **NEVER** manually edit `types/database.types.ts`
- **ALWAYS** run `npm run db:types` after schema changes
- **MUST** pass schema verification test before merge
- Use `Pick`, `Omit`, and mapped types for DTOs (no manual redefinitions)

---

## Type Generation Workflow

### 1. After Schema Migration

**Trigger**: Any migration that modifies database schema.

```bash
# Step 1: Apply migration
npx supabase migration up

# Step 2: Regenerate types (MANDATORY)
npm run db:types

# Step 3: Verify type generation succeeded
ls -lh types/database.types.ts

# Step 4: Review changes
git diff types/database.types.ts
```

**Expected Output**:
```bash
types/database.types.ts | 150 +++++++++++++++++++++++++++++++++++++++++++++++
1 file changed, 150 insertions(+)
```

### 2. Manual Type Generation

**Use Case**: Types out of sync or `database.types.ts` corrupted.

```bash
# Option 1: Via npm script (recommended)
npm run db:types

# Option 2: Via Supabase CLI directly
npx supabase gen types typescript --local > types/database.types.ts

# Option 3: From remote Supabase project (if needed)
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.types.ts
```

**Verification**:
```bash
# Check file size (should be substantial)
wc -l types/database.types.ts
# Expected: 1000+ lines

# Check for key types
grep -c "interface.*Table" types/database.types.ts
# Expected: 10+ interfaces

# Verify no syntax errors
npx tsc --noEmit --skipLibCheck types/database.types.ts
# Expected: No errors
```

---

## Type Structure

### Generated File Structure

`types/database.types.ts` contains:

1. **Database Interface**: Top-level interface with all schemas
2. **Table Interfaces**: One interface per table (`{TableName}Table`)
3. **Row Types**: Full row shape with all columns (`{TableName}Row`)
4. **Insert Types**: Columns required/optional for inserts (`{TableName}Insert`)
5. **Update Types**: Columns allowed in updates (`{TableName}Update`)
6. **Enum Types**: All PostgreSQL enum definitions
7. **Function Signatures**: RPC function parameter and return types

**Example Structure**:
```typescript
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      visit: {
        Row: {
          id: string
          casino_id: string
          player_id: string
          started_at: string
          ended_at: string | null
          // ... other columns
        }
        Insert: {
          id?: string  // Optional if has default
          casino_id: string
          player_id: string
          started_at?: string  // Optional if has default
          ended_at?: string | null
        }
        Update: {
          id?: string
          casino_id?: string
          player_id?: string
          started_at?: string
          ended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_casino_id_fkey"
            columns: ["casino_id"]
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          // ... other relationships
        ]
      }
      // ... other tables
    }
    Views: {
      // ... views
    }
    Functions: {
      rpc_issue_mid_session_reward: {
        Args: {
          p_casino_id: string
          p_player_id: string
          p_points: number
          p_rating_slip_id: string
          // ...
        }
        Returns: string  // UUID of ledger entry
      }
      // ... other functions
    }
    Enums: {
      staff_role: "dealer" | "pit_boss" | "admin"
      status_enum: "pending" | "completed" | "failed"
      // ... other enums
    }
  }
}
```

### Using Generated Types

**DO** (Recommended Patterns):

```typescript
import { Database } from '@/types/database.types';

// Type the Supabase client
const supabase: SupabaseClient<Database> = createClient(...);

// Extract table types
type Visit = Database['public']['Tables']['visit']['Row'];
type VisitInsert = Database['public']['Tables']['visit']['Insert'];
type VisitUpdate = Database['public']['Tables']['visit']['Update'];

// Create DTOs using Pick/Omit
type VisitDTO = Pick<Visit, 'id' | 'casino_id' | 'player_id' | 'started_at'>;
type CreateVisitInput = Omit<VisitInsert, 'id' | 'created_at'>;

// Service function signature
export interface VisitService {
  create(
    supabase: SupabaseClient<Database>,
    input: CreateVisitInput
  ): Promise<Visit>;

  getById(
    supabase: SupabaseClient<Database>,
    id: string
  ): Promise<Visit | null>;
}
```

**DON'T** (Anti-Patterns):

```typescript
// ❌ Manual type redefinitions
interface Visit {
  id: string;
  casinoId: string;  // Wrong: doesn't match DB column name
  // ... missing columns
}

// ❌ Using `any` on Supabase client
const supabase: any = createClient(...);

// ❌ ReturnType inference for services
type VisitService = ReturnType<typeof createVisitService>;

// ❌ Manually defining enum values
type StaffRole = 'dealer' | 'pit_boss' | 'admin';  // Use Database enum instead
```

---

## Schema Verification Test

### Purpose

Ensure generated types match actual database schema. Catches:
- Missing table types
- Column type mismatches
- Missing enum values
- Foreign key relationship errors

### Running the Test

```bash
# Run schema verification test
npm test -- schema.test.ts

# Or run with watch mode during development
npm test -- --watch schema.test.ts
```

**Expected Output**:
```
PASS  tests/schema.test.ts
  ✓ Database types file exists (5ms)
  ✓ All tables have corresponding types (12ms)
  ✓ Visit table has required columns (8ms)
  ✓ Staff role enum matches database (6ms)
  ✓ RPC functions are typed (10ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

### Creating Schema Verification Tests

Create `tests/schema.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { Database } from '@/types/database.types';
import { createClient } from '@supabase/supabase-js';

describe('Schema Type Verification', () => {
  test('Database types file exists and is valid', () => {
    expect(Database).toBeDefined();
    expect(Database.public).toBeDefined();
    expect(Database.public.Tables).toBeDefined();
  });

  test('All core tables have types', () => {
    const tables = Database.public.Tables;

    // Verify critical tables exist
    expect(tables.visit).toBeDefined();
    expect(tables.rating_slip).toBeDefined();
    expect(tables.player_loyalty).toBeDefined();
    expect(tables.loyalty_ledger).toBeDefined();
    expect(tables.player_financial_transaction).toBeDefined();
    expect(tables.gaming_table).toBeDefined();
    expect(tables.staff).toBeDefined();
  });

  test('Visit table has required columns', () => {
    type VisitRow = Database['public']['Tables']['visit']['Row'];

    const mockVisit: VisitRow = {
      id: 'test-uuid',
      casino_id: 'casino-uuid',
      player_id: 'player-uuid',
      started_at: '2025-01-01T00:00:00Z',
      ended_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    expect(mockVisit.id).toBeDefined();
    expect(mockVisit.casino_id).toBeDefined();
    expect(mockVisit.player_id).toBeDefined();
    expect(mockVisit.started_at).toBeDefined();
  });

  test('Staff role enum matches database', () => {
    type StaffRole = Database['public']['Enums']['staff_role'];

    const validRoles: StaffRole[] = ['dealer', 'pit_boss', 'admin'];
    validRoles.forEach(role => {
      expect(['dealer', 'pit_boss', 'admin']).toContain(role);
    });
  });

  test('RPC functions are typed', () => {
    const functions = Database.public.Functions;

    // Verify critical RPCs exist
    expect(functions.rpc_issue_mid_session_reward).toBeDefined();
    expect(functions.exec_sql).toBeDefined();

    // Verify RPC signatures
    type RewardArgs = Database['public']['Functions']['rpc_issue_mid_session_reward']['Args'];
    expect({} as RewardArgs).toMatchObject({
      p_casino_id: expect.any(String),
      p_player_id: expect.any(String),
      p_points: expect.any(Number),
    });
  });

  test('Foreign key relationships are defined', () => {
    type VisitRelationships = Database['public']['Tables']['visit']['Relationships'];

    const relationships: VisitRelationships = [];

    // Verify casino_id FK exists
    const casinoFK = relationships.find(
      (r) => r.foreignKeyName === 'visit_casino_id_fkey'
    );
    expect(casinoFK).toBeDefined();
  });
});
```

**Run after every migration**:
```bash
# Regenerate types
npm run db:types

# Run verification
npm test -- schema.test.ts

# Should pass before committing
```

---

## Type Sync Issues

### Issue 1: Types Out of Sync with Schema

**Symptoms**:
- TypeScript errors: `Property 'new_column' does not exist on type...`
- Type mismatches: `Type 'string' is not assignable to type 'number'`
- Missing table interfaces

**Diagnosis**:
```bash
# Check when types were last generated
ls -lh types/database.types.ts

# Check migration history
npx supabase db execute --file - <<'SQL'
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY inserted_at DESC
LIMIT 5;
SQL

# Compare timestamps - if types older than migrations, regenerate
```

**Solution**:
```bash
# Regenerate types from current schema
npm run db:types

# Verify generation succeeded
git diff types/database.types.ts

# Run type check
npx tsc --noEmit

# Run tests
npm test
```

### Issue 2: Type Generation Fails

**Symptoms**:
```
Error: Could not connect to Supabase
Error generating types
```

**Diagnosis**:
```bash
# Check if Supabase is running
npx supabase status

# Check database connectivity
npx supabase db execute --file - <<'SQL'
SELECT version();
SQL
```

**Solution**:
```bash
# If Supabase not running, start it
npx supabase start

# Retry type generation
npm run db:types

# If still failing, check supabase/config.toml
cat supabase/config.toml | grep -A 5 api
```

### Issue 3: Generated Types Have Syntax Errors

**Symptoms**:
```
types/database.types.ts:123:45 - error TS1005: '}' expected
```

**Diagnosis**:
```bash
# Check for PostgreSQL reserved words or special characters
npx supabase db execute --file - <<'SQL'
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('order', 'group', 'select', 'from', 'where');
SQL
```

**Solution**:
```bash
# Rename columns that conflict with reserved words
npx supabase db execute --file - <<'SQL'
ALTER TABLE your_table RENAME COLUMN "order" TO "order_number";
SQL

# Regenerate types
npm run db:types

# Alternative: Use quoted identifiers in schema
```

### Issue 4: Enum Values Out of Sync

**Symptoms**:
```typescript
// Error: Type '"new_value"' is not assignable to type 'StaffRole'
const role: StaffRole = 'new_value';
```

**Diagnosis**:
```bash
# Check enum values in database
npx supabase db execute --file - <<'SQL'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'staff_role'::regtype
ORDER BY enumsortorder;
SQL
```

**Solution**:
```bash
# Regenerate types after enum migration
npm run db:types

# Verify enum in generated types
grep -A 5 "Enums:" types/database.types.ts
```

---

## KPI Thresholds (from OBSERVABILITY_SPEC)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Type generation time | < 10s | > 30s |
| Type file size | 1000-5000 lines | > 10000 lines (schema bloat) |
| Schema test execution | < 5s | > 15s |
| Type sync drift | 0 migrations | > 1 migration behind |

---

## CI/CD Integration

### Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Check if types are up to date
TYPES_MODIFIED=$(git diff --cached --name-only | grep "types/database.types.ts")
MIGRATIONS_MODIFIED=$(git diff --cached --name-only | grep "supabase/migrations/")

if [ -n "$MIGRATIONS_MODIFIED" ] && [ -z "$TYPES_MODIFIED" ]; then
  echo "ERROR: Migration files changed but types not regenerated"
  echo "Run: npm run db:types"
  exit 1
fi

# Run schema verification test
npm test -- schema.test.ts --run
if [ $? -ne 0 ]; then
  echo "ERROR: Schema verification test failed"
  exit 1
fi
```

### GitHub Actions Workflow

```yaml
# .github/workflows/type-sync.yml
name: Type Sync Verification

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'types/database.types.ts'

jobs:
  verify-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        run: npm install -g supabase

      - name: Start Supabase
        run: npx supabase start

      - name: Generate types
        run: npm run db:types

      - name: Check for type drift
        run: |
          if ! git diff --exit-code types/database.types.ts; then
            echo "ERROR: Generated types differ from committed types"
            echo "Run 'npm run db:types' locally and commit changes"
            exit 1
          fi

      - name: Run schema tests
        run: npm test -- schema.test.ts

      - name: Type check entire codebase
        run: npx tsc --noEmit
```

---

## Best Practices

### DO

✅ Regenerate types immediately after every migration
✅ Commit `types/database.types.ts` alongside migration files
✅ Use `Pick`/`Omit` for DTOs instead of manual definitions
✅ Type Supabase client as `SupabaseClient<Database>`
✅ Run schema verification tests before merging
✅ Review type diffs in PRs to catch schema issues

### DON'T

❌ Manually edit `types/database.types.ts`
❌ Skip type generation after migrations
❌ Use `any` for Supabase client types
❌ Redefine table types manually in service files
❌ Ignore TypeScript errors in generated types
❌ Deploy without passing schema verification tests

---

## Troubleshooting Commands

### Quick Reference

```bash
# Generate types
npm run db:types

# Verify Supabase running
npx supabase status

# Check type file
ls -lh types/database.types.ts
wc -l types/database.types.ts

# Type check codebase
npx tsc --noEmit

# Run schema tests
npm test -- schema.test.ts

# Check for type usage
grep -r "SupabaseClient<Database>" app/

# Find manual type definitions (anti-pattern)
grep -r "interface.*{" app/ | grep -v "database.types"
```

---

## References

- **Migration Runbook**: [RUN-003](RUN-003-schema-migration-runbook.md)
- **Schema Reload**: [RUN-002](RUN-002-schema-reload.md)
- **Supabase Type Generation**: https://supabase.com/docs/guides/api/rest/generating-types
- **CLAUDE.md Type Standards**: [.claude/CLAUDE.md](../../../.claude/CLAUDE.md)
- **SRM Type Discipline**: [SERVICE_RESPONSIBILITY_MATRIX.md](../../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)

---

**Document Status**: Active
**Last Updated**: 2025-11-17
**Next Review**: After first production type sync issue
