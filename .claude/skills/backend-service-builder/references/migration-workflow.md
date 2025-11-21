# Database Migration Workflow

**Source**: `.claude/CLAUDE.md` + PT-2 Architecture Standards

## Critical Standards

### Migration Naming Convention

**REQUIRED**: All migration files MUST follow `YYYYMMDDHHMMSS_description.sql` pattern

```bash
# ✅ CORRECT: Use actual file creation timestamp
date +"%Y%m%d%H%M%S"
# Example: 20251014134942_mtl_schema_enhancements.sql

# ❌ WRONG: Do not use simplified patterns
20251014000001_description.sql        # ❌ Wrong
20251014_description.sql               # ❌ Wrong
2025-10-14-description.sql             # ❌ Wrong
```

---

## Migration Creation Workflow

### Step 1: Create Migration File

```bash
# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# Create migration file
npx supabase migration new ${TIMESTAMP}_your_description

# Example output:
# Created new migration at supabase/migrations/20251121140523_your_description.sql
```

### Step 2: Write Migration SQL

```sql
-- supabase/migrations/20251121140523_add_player_achievements.sql

-- Create table
CREATE TABLE IF NOT EXISTS player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS policies (REQUIRED for all tables)
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

-- Policy: Casino staff can view achievements for their casino
CREATE POLICY "casino_staff_view_achievements"
  ON player_achievements
  FOR SELECT
  TO authenticated
  USING (
    casino_id IN (
      SELECT casino_id FROM staff WHERE id = auth.uid()
    )
  );

-- Policy: Casino staff can insert achievements
CREATE POLICY "casino_staff_insert_achievements"
  ON player_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    casino_id IN (
      SELECT casino_id FROM staff WHERE id = auth.uid()
    )
  );

-- Add indexes
CREATE INDEX idx_player_achievements_player_id
  ON player_achievements(player_id);

CREATE INDEX idx_player_achievements_casino_id
  ON player_achievements(casino_id);
```

### Step 3: Apply Migration

```bash
# ✅ CORRECT: Use supabase migration commands
npx supabase migration up

# OR: Reset database (applies all migrations)
npx supabase db reset

# ❌ WRONG: Do not use psql directly
# psql doesn't trigger cache reload
```

**Why not psql?**
- Doesn't trigger `NOTIFY pgrst, 'reload schema'`
- PostgREST cache won't reload
- Must use Supabase CLI for proper cache invalidation

### Step 4: Regenerate Types (CRITICAL)

```bash
# MUST run after every migration
npm run db:types

# This regenerates types/database.types.ts from schema
```

**Why critical?**
- Services rely on `Database` types for type safety
- Pattern B DTOs derive from `Database['public']['Tables']['x']['Row']`
- Missing this step = type drift = runtime errors

### Step 5: Verify Schema Alignment

```bash
# Run schema verification test
npm test -- schema-verification

# This test MUST pass before merge
```

---

## RLS Policy Patterns

### Pattern 1: Casino-Scoped Read

```sql
CREATE POLICY "casino_staff_view_{table}"
  ON {table}
  FOR SELECT
  TO authenticated
  USING (
    casino_id IN (
      SELECT casino_id FROM staff WHERE id = auth.uid()
    )
  );
```

### Pattern 2: Casino-Scoped Write

```sql
CREATE POLICY "casino_staff_insert_{table}"
  ON {table}
  FOR INSERT
  TO authenticated
  WITH CHECK (
    casino_id IN (
      SELECT casino_id FROM staff WHERE id = auth.uid()
    )
  );
```

### Pattern 3: Player Self-Access

```sql
CREATE POLICY "player_view_own_{table}"
  ON {table}
  FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());
```

### Pattern 4: Admin Access

```sql
CREATE POLICY "admin_full_access_{table}"
  ON {table}
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
```

---

## Migration Checklist

**Before applying migration**:
- [ ] Migration file follows `YYYYMMDDHHMMSS_description.sql` naming
- [ ] All new tables have `ENABLE ROW LEVEL SECURITY`
- [ ] At least one RLS policy defined for each table
- [ ] Indexes added for foreign keys
- [ ] `created_at` timestamp with `DEFAULT now()` where applicable
- [ ] `ON DELETE CASCADE` for foreign keys where appropriate

**After applying migration**:
- [ ] Run `npm run db:types` to regenerate types
- [ ] Schema verification test passes
- [ ] TypeScript compilation succeeds
- [ ] Related service tests pass

---

## Common Mistakes

### ❌ Missing RLS Policies

```sql
-- ❌ WRONG: No RLS policies
CREATE TABLE player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player(id)
);
-- Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- Missing: CREATE POLICY statements
```

**Result**: Open security vulnerability

### ❌ Forgetting Type Regeneration

```bash
npx supabase migration up
# ❌ Forgot: npm run db:types
```

**Result**: Service layer uses stale types, runtime errors

### ❌ Using psql Directly

```bash
# ❌ WRONG
psql -U postgres -d pt2 -f migration.sql
```

**Result**: PostgREST cache not reloaded, API returns stale schema

---

## Rollback Strategy

### Rollback Single Migration

```bash
# Create down migration
npx supabase migration new ${TIMESTAMP}_rollback_description

# Write rollback SQL
-- DROP TABLE player_achievements CASCADE;
```

### Reset to Clean State

```bash
# Reset database (applies all migrations from scratch)
npx supabase db reset
```

---

## Integration with Service Creation

When creating a service that requires new tables:

1. **Write migration first** (define schema)
2. **Apply migration** (`npx supabase migration up`)
3. **Regenerate types** (`npm run db:types`)
4. **Create service** (now has correct types available)
5. **Write tests** (using regenerated types)

---

## Reference

- **Migration Naming**: CLAUDE.md § Migration Naming Convention
- **RLS Patterns**: `docs/30-security/SEC-003-rbac-matrix.md`
- **Type Regeneration**: CLAUDE.md § Type System
