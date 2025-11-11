---
name: pt2-migration-manager
description: Create and apply database migrations following PT-2 standards including timestamp naming, RLS policy shipping, and automatic type regeneration
license: MIT
version: "1.0.0"
---

# PT-2 Migration Manager

This skill enforces the PT-2 migration workflow to maintain schema-code synchronization and bounded context integrity.

## When to Use This Skill

- Creating new database migrations
- Modifying existing schema (tables, columns, constraints)
- Adding or updating Row-Level Security (RLS) policies
- Any change to `supabase/migrations/*.sql`

## Critical Requirements

**MUST FOLLOW** (from CLAUDE.md and SRM):

1. **Naming Convention**: `YYYYMMDDHHMMSS_description.sql`
   - Use actual timestamp: `date +"%Y%m%d%H%M%S"`
   - ❌ NOT `YYYYMMDD000001` or `YYYYMMDD_description`
   - ✅ Example: `20251110223045_add_loyalty_mid_session_reward.sql`

2. **Type Regeneration**: Run `npm run db:types` after EVERY migration
   - CRITICAL: Schema verification test MUST pass before merge
   - Types are single source of truth (no manual redefinitions)

3. **RLS Policies**: MUST ship with schema changes (SRM line 14)
   - Every table with `casino_id` needs RLS policy
   - Reference: `docs/30-security/SEC-001-rls-policy-matrix.md`

4. **Application Method**: Use Supabase CLI, NOT psql
   - `npx supabase migration up` (applies migration + triggers cache reload)
   - OR `npx supabase db reset` (full reset)
   - psql does NOT trigger `NOTIFY pgrst, 'reload schema'`

## Workflow: Creating a New Migration

### Step 1: Generate Timestamp-Named File

```bash
# Use the create-migration script
bash skills/pt2-migration-manager/scripts/create-migration.sh "description_here"

# This generates: supabase/migrations/YYYYMMDDHHMMSS_description_here.sql
```

### Step 2: Write Migration SQL

Follow these patterns:

**Table Creation with RLS**:
```sql
-- Create table
CREATE TABLE IF NOT EXISTS public.my_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casino(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Casino isolation
CREATE POLICY "casino_isolation_policy" ON public.my_table
  USING (casino_id::text = current_setting('app.casino_id', true));

-- Indexes
CREATE INDEX idx_my_table_casino_id ON public.my_table(casino_id);
CREATE INDEX idx_my_table_created_at ON public.my_table(created_at DESC);
```

**Column Addition**:
```sql
-- Add column with default
ALTER TABLE public.existing_table
  ADD COLUMN IF NOT EXISTS new_column text DEFAULT 'default_value';

-- Add comment
COMMENT ON COLUMN public.existing_table.new_column IS 'Description of purpose';
```

**Enum Modification** (requires safe pattern):
```sql
-- Add new enum value
ALTER TYPE public.my_enum ADD VALUE IF NOT EXISTS 'new_value';

-- For removal: create new type, migrate data, drop old type (multi-step)
```

### Step 3: Apply Migration and Regenerate Types

```bash
# Use the apply-and-regen script (enforces workflow)
bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh

# This runs:
# 1. npx supabase migration up
# 2. npm run db:types
# 3. Validates schema_verification.test.ts passes
```

### Step 4: Verify RLS Coverage

```bash
# Check that all tables with casino_id have RLS policies
npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts
```

### Step 5: Commit with Migration Standards

```bash
git add supabase/migrations/ types/database.types.ts
git commit -m "migration: add my_table with casino-scoped RLS

- Adds my_table following SRM bounded context rules
- RLS policy: casino_isolation_policy
- Regenerated types (database.types.ts)
- Verified schema test passes

Refs: SRM v3.0.2 §[section], SEC-001"
```

## Anti-Patterns to AVOID

❌ **Manual timestamp creation**: `20251110000001_migration.sql`
- Use script to generate accurate timestamp

❌ **Applying via psql**: `psql < migration.sql`
- PostgREST cache won't reload

❌ **Forgetting type regeneration**: Migration without `npm run db:types`
- Causes type/schema drift

❌ **Missing RLS on casino-scoped tables**: Table with `casino_id` but no RLS
- Security vulnerability

❌ **Using `ReturnType` inference**: `ReturnType<typeof getMyData>`
- Must use explicit interfaces from `database.types.ts`

❌ **Manual type redefinition**: Copying table types into service files
- Use `Database['public']['Tables']['my_table']['Row']` via DTO

## RLS Policy Patterns (from SEC-001)

### Pattern 1: Casino Isolation (Most Common)
```sql
CREATE POLICY "casino_isolation" ON public.table_name
  USING (casino_id::text = current_setting('app.casino_id', true));
```

### Pattern 2: Casino Isolation + Staff Authorization
```sql
CREATE POLICY "casino_staff_access" ON public.table_name
  USING (
    casino_id::text = current_setting('app.casino_id', true)
    AND current_setting('app.staff_id', true) IS NOT NULL
  );
```

### Pattern 3: Player Self-Access
```sql
CREATE POLICY "player_self_access" ON public.player
  USING (id::text = current_setting('app.player_id', true));
```

### Pattern 4: Visit-Scoped Access
```sql
CREATE POLICY "visit_scoped_access" ON public.rating_slip
  USING (
    EXISTS (
      SELECT 1 FROM public.visit v
      WHERE v.id = rating_slip.visit_id
        AND v.casino_id::text = current_setting('app.casino_id', true)
    )
  );
```

## Naming Conventions (from SRM)

- **Tables**: `lower_snake_case` (e.g., `player_loyalty`, `mtl_entry`)
- **Columns**: `lower_snake_case` (e.g., `created_at`, `casino_id`)
- **Enums**: `lower_snake_case` (e.g., `transaction_status`)
- **Primary Keys**: Always `id uuid DEFAULT gen_random_uuid()`
- **Foreign Keys**: `{referenced_table}_id` (e.g., `casino_id`, `visit_id`)
- **Timestamps**: `created_at`, `updated_at` (both `timestamptz`)

## Bounded Context Ownership (Reference SRM §34-48)

When creating tables, verify ownership:

| Service | Owns Tables | Example Migration |
|---------|-------------|-------------------|
| Casino | `casino`, `casino_settings`, `staff`, `game_settings` | `20251110_add_casino_settings_column.sql` |
| Player | `player`, `player_casino` | `20251110_add_player_email.sql` |
| Visit | `visit` | `20251110_add_visit_notes.sql` |
| Loyalty | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | `20251110_add_loyalty_mid_session_reward.sql` |
| RatingSlip | `rating_slip` | `20251110_remove_rating_slip_cached_points.sql` |
| Finance | `player_financial_transaction`, `finance_outbox` | `20251110_add_finance_transaction_metadata.sql` |
| MTL | `mtl_entry`, `mtl_audit_note` | `20251110_add_mtl_note_attachments.sql` |
| TableContext | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, chip custody tables | `20251110_add_table_inventory_snapshot.sql` |
| FloorLayout | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | `20251110_add_floor_layout_version.sql` |

## Troubleshooting

**Error: "relation does not exist" after migration**
- Run `npx supabase db reset` to fully reload schema
- Verify PostgREST cache reloaded: `docker logs supabase_rest_pt-2`

**Error: "schema verification test fails"**
- Ensure `npm run db:types` completed successfully
- Check `types/database.types.ts` was regenerated
- Verify no TypeScript errors in `database.types.ts`

**Error: "RLS policy prevents access"**
- Verify `app.casino_id` is set via `withServerAction()` middleware
- Check policy logic matches current_setting scope
- Test with `SET LOCAL app.casino_id = 'test-uuid'` in psql

**Error: "migration already applied"**
- Check `supabase/migrations/.gitignore` status
- Use `npx supabase db reset` for clean state
- Never edit applied migrations (create new migration instead)

## References

This skill bundles:
- `references/MIGRATION_NAMING_STANDARD.md` (excerpt from docs/60-release/)
- `references/SEC-001-rls-policy-matrix.md` (excerpt from docs/30-security/)
- `references/SRM_MIGRATION_SECTION.md` (SRM contract policy excerpt)

For full documentation:
- Migration Standards: `docs/60-release/MIGRATION_NAMING_STANDARD.md`
- RLS Policies: `docs/30-security/SEC-001-rls-policy-matrix.md`
- Type Workflow: `CLAUDE.md` (DB Workflow section)
- SRM Contract: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

## Success Criteria

✅ Migration file follows `YYYYMMDDHHMMSS_description.sql` pattern
✅ `npx supabase migration up` applied successfully
✅ `npm run db:types` regenerated `database.types.ts`
✅ Schema verification test passes
✅ RLS policies added for casino-scoped tables
✅ Git commit includes migration + types + verification
