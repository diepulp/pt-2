---
title: Write Database Migration (Type-Safe Workflow)
description: Database migration with automated type regeneration and validation
chatmode_sequence:
  - service-engineer # Migration creation and type gen
  - service-engineer # Validation and testing
validation_gates: 2
estimated_time: 30-60 minutes
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/anti-patterns.memory.md
  - docs/patterns/MTL_MIGRATION_TIMESTAMP_FIX.md
  - docs/adr/ADR-001-dual-database-type-strategy.md
---

# Write Migration Workflow

## Overview

This workflow creates database migrations following PT-2 standards with automated type regeneration and validation.

**Estimated Time**: 30-60 minutes (migration → types → validation)

**Outcome**: Production-ready migration with regenerated types and passing schema verification

---

## Prerequisites

### Required Information

- [ ] Migration purpose clearly defined
- [ ] Tables/columns to create/modify/delete
- [ ] RLS policies if needed
- [ ] Indexes and constraints
- [ ] Seed data if needed

### Environment Check

```bash
# Ensure local Supabase is running
npx supabase status

# Expected output shows services running
```

---

## Phase 1: Migration Creation (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Bash
**Output**: Migration file

### Step 1.1: Generate Timestamp

**CRITICAL**: Use actual timestamp, not simplified patterns

```bash
# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
echo $TIMESTAMP

# Example output: 20251017143042
```

**Naming Convention**:

- ✅ CORRECT: `20251017143042_add_loyalty_tables.sql`
- ❌ WRONG: `20251017_add_loyalty_tables.sql`
- ❌ WRONG: `20251017000001_add_loyalty_tables.sql`

See: `docs/patterns/MTL_MIGRATION_TIMESTAMP_FIX.md`

### Step 1.2: Create Migration File

```bash
# Create migration file
touch supabase/migrations/${TIMESTAMP}_description.sql
```

### Step 1.3: Write Migration SQL

**Migration Structure**:

```sql
-- Migration: {Description}
-- Created: {YYYY-MM-DD HH:MM:SS}
-- Purpose: {Brief purpose statement}

-- ============================================
-- SECTION 1: Schema Changes
-- ============================================

-- Create tables
CREATE TABLE IF NOT EXISTS {table_name} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  {column_name} {type} {constraints},
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns (if altering existing tables)
ALTER TABLE {existing_table}
  ADD COLUMN IF NOT EXISTS {column_name} {type} {constraints};

-- ============================================
-- SECTION 2: Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_{table}_{column}
  ON {table}({column});

-- ============================================
-- SECTION 3: RLS Policies
-- ============================================

ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY {policy_name}
  ON {table}
  FOR {operation}
  TO {role}
  USING ({condition});

-- ============================================
-- SECTION 4: Seed Data (Optional)
-- ============================================

INSERT INTO {table} ({columns})
VALUES ({values})
ON CONFLICT ({unique_column}) DO NOTHING;

-- ============================================
-- SECTION 5: Update Triggers
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_{table}_updated_at
  BEFORE UPDATE ON {table}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Best Practices**:

- ✅ Use `IF NOT EXISTS` for CREATE statements
- ✅ Use `IF EXISTS` for DROP statements
- ✅ Add comments explaining purpose
- ✅ Group related changes in sections
- ✅ Use transactions for data migrations
- ✅ Test rollback strategy

**Anti-Patterns**:

- ❌ No hardcoded IDs (use gen_random_uuid())
- ❌ No DROP without IF EXISTS
- ❌ No unguarded data modifications
- ❌ No missing RLS policies on sensitive tables

### Step 1.4: VALIDATION GATE 1 - Migration Review

🛑 **STOP: Review migration before applying**

**Checklist**:

```
🛑 VALIDATION GATE 1: Migration Review

Migration: {timestamp}_{description}.sql

Purpose: [Brief description]

Changes:
  Tables Created: [list]
  Tables Modified: [list]
  Columns Added: [list]
  Indexes Added: [list]
  RLS Policies: [list]
  Seed Data: [yes/no]

Safety Checks:
  - [x] Timestamp format correct (YYYYMMDDHHMMSS)
  - [x] IF NOT EXISTS used for CREATE
  - [x] IF EXISTS used for DROP
  - [x] RLS policies on sensitive tables
  - [x] Indexes on foreign keys
  - [x] updated_at trigger if needed
  - [x] No hardcoded UUIDs
  - [x] Comments explain purpose

Rollback Strategy: [Describe how to rollback]

Preview SQL: [Show first 20 lines]

Ready to apply migration? (Reply "apply" to continue)
```

**User must approve before applying migration.**

---

## Phase 2: Apply Migration & Regenerate Types

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Bash
**Output**: Updated database + regenerated types

### Step 2.1: Apply Migration

**Option A: Apply Single Migration** (Recommended)

```bash
# Apply the new migration
npx supabase migration up

# Expected output:
# Applying migration {timestamp}_{description}.sql...
# OK
```

**Option B: Reset Database** (If issues arise)

```bash
# WARNING: Destroys local data
npx supabase db reset

# This reruns all migrations from scratch
```

**Do NOT use psql directly** - it doesn't trigger cache reload

- See: `.claude/CLAUDE.md` DB Workflow section

### Step 2.2: Verify Migration Applied

```bash
# Check migration status
npx supabase migration list

# Expected output shows migration as applied
```

### Step 2.3: Regenerate Database Types

**CRITICAL**: Must run after EVERY migration

```bash
# Regenerate types from database schema
npm run db:types

# Expected output:
# Generating types...
# Types written to types/database.types.ts
```

**What This Does**:

- Connects to local Supabase instance
- Introspects database schema
- Generates TypeScript types
- Writes to `types/database.types.ts`

**Verification**:

```bash
# Check that types file was updated
ls -lh types/database.types.ts

# View recent changes
git diff types/database.types.ts
```

### Step 2.4: Run Schema Verification Test

**CRITICAL**: Must pass before merge

```bash
# Run schema verification test
npm test -- schema-verification

# Expected output:
# PASS __tests__/database/schema-verification.test.ts
```

**What This Validates**:

- Database types match actual schema
- All tables have expected columns
- Type definitions are correct
- No type drift between local and types file

### Step 2.5: VALIDATION GATE 2 - Type Regeneration Review

🛑 **STOP: Verify type regeneration successful**

**Verification Format**:

```
🛑 VALIDATION GATE 2: Type Regeneration Verification

Migration: {timestamp}_{description}.sql

Migration Status:
  - [x] Applied successfully via npx supabase migration up
  - [x] Visible in npx supabase migration list

Type Regeneration:
  - [x] npm run db:types executed
  - [x] types/database.types.ts updated
  - [x] New types match schema changes
  - [x] Git diff shows expected type changes

Schema Verification:
  - [x] npm test -- schema-verification PASSED
  - [x] All tables validated
  - [x] All columns present
  - [x] Type safety confirmed

Type Changes Detected:
[Show git diff of types/database.types.ts]

Example: New Types Added
  - Table: {table_name}
  - Columns: [list new columns]
  - Types: [show TypeScript interface]

All Validations Passed: [✅ YES / ❌ NO]

Ready to commit migration? (Reply "commit" to finalize)
```

**User must approve before committing.**

---

## Phase 3: Commit & Documentation

### Step 3.1: Stage Changes

```bash
# Stage migration and types
git add supabase/migrations/${TIMESTAMP}_description.sql
git add types/database.types.ts
```

### Step 3.2: Commit with Descriptive Message

```bash
git commit -m "$(cat <<'EOF'
feat(db): {brief description}

Migration: {timestamp}_{description}.sql

Changes:
- Tables: {list created/modified tables}
- Columns: {list added columns}
- Indexes: {list added indexes}
- RLS: {list policies added}

Type Regeneration:
- Updated types/database.types.ts
- Schema verification test passing

Validation:
- [x] Migration applied successfully
- [x] Types regenerated
- [x] Schema verification passing
- [x] No type drift

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 3.3: Update Memory (Optional)

If migration represents significant schema change, update:

`.claude/memory/phase-status.memory.md`:

```markdown
## Recently Completed

- ✅ Database Migration: {description} ({date})
  - Tables: {list}
  - Type regeneration: ✅
  - Schema verification: ✅
```

---

## Final Checklist

Before marking migration complete:

- [ ] Migration file created with correct timestamp format
- [ ] SQL follows PT-2 best practices (IF NOT EXISTS, RLS, indexes)
- [ ] Migration applied via `npx supabase migration up`
- [ ] Types regenerated via `npm run db:types`
- [ ] types/database.types.ts shows expected changes
- [ ] Schema verification test passing
- [ ] Migration committed with types
- [ ] Descriptive commit message
- [ ] Memory updated if significant change

---

## Common Scenarios

### Scenario 1: Add New Table

```sql
CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_player_id ON loyalty_points(player_id);

ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
```

### Scenario 2: Add Column to Existing Table

```sql
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'BRONZE';

CREATE INDEX idx_player_loyalty_tier ON player(loyalty_tier);
```

### Scenario 3: Add RLS Policy

```sql
CREATE POLICY player_read_own
  ON player
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
```

### Scenario 4: Seed Reference Data

```sql
INSERT INTO loyalty_tier_config (tier, min_points, multiplier)
VALUES
  ('BRONZE', 0, 1.0),
  ('SILVER', 1000, 1.2),
  ('GOLD', 5000, 1.5),
  ('PLATINUM', 20000, 2.0)
ON CONFLICT (tier) DO NOTHING;
```

---

## Troubleshooting

### Migration Fails to Apply

**Symptoms**: `npx supabase migration up` returns error
**Causes**:

- SQL syntax error
- Constraint violation
- Missing dependency (table/column)

**Actions**:

1. Check error message for specific issue
2. Fix SQL in migration file
3. Run `npx supabase db reset` to start fresh
4. Reapply migration

### Types Not Regenerating

**Symptoms**: `npm run db:types` fails or types unchanged
**Causes**:

- Supabase not running (`npx supabase status`)
- Database connection issue
- Migration not actually applied

**Actions**:

1. Verify Supabase running: `npx supabase status`
2. Check migration applied: `npx supabase migration list`
3. Manually verify schema: Connect to database and check tables
4. Re-run `npm run db:types`

### Schema Verification Test Fails

**Symptoms**: `npm test -- schema-verification` fails
**Causes**:

- Types out of sync with schema
- Migration applied but types not regenerated
- Test expectations outdated

**Actions**:

1. Re-run `npm run db:types`
2. Check git diff of types file
3. Update test expectations if schema intentionally changed
4. Re-run test

### Type Drift Detected

**Symptoms**: TypeScript compilation errors in services
**Causes**:

- Types not regenerated after migration
- Manual type edits (anti-pattern)
- Multiple migrations applied without type regen

**Actions**:

1. Run `npm run db:types`
2. Review type changes
3. Update service code to match new types
4. NEVER manually edit types/database.types.ts

---

## Success Metrics

**Quality**:

- Migration follows PT-2 best practices
- RLS policies on all sensitive tables
- Indexes on foreign keys
- Schema verification test passing

**Safety**:

- Rollback strategy documented
- IF NOT EXISTS used appropriately
- No data loss on apply
- Type safety maintained

**Efficiency**:

- 30-60 minutes total
- Automated type regeneration
- Single commit for migration + types
- No manual type edits

---

## Anti-Patterns (DO NOT)

- ❌ Manual psql commands (breaks cache)
- ❌ Simplified timestamp formats (YYYYMMDD)
- ❌ Manual edits to types/database.types.ts
- ❌ Skipping type regeneration after migration
- ❌ Committing migration without types update
- ❌ Missing RLS policies on user data
- ❌ Hardcoded UUIDs in migrations
- ❌ DROP without IF EXISTS
- ❌ CREATE without IF NOT EXISTS

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial workflow creation (Phase 3) |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
