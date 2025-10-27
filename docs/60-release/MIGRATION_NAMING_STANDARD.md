# Migration Naming Convention Standard

> **Status**: MANDATORY
> **Applies To**: All Supabase migration files in `supabase/migrations/`
> **Enforcement**: Pre-commit hook + code review

---

## Standard Pattern

**Format**: `YYYYMMDDHHMMSS_descriptive_name.sql`

- **YYYY**: 4-digit year
- **MM**: 2-digit month (01-12)
- **DD**: 2-digit day (01-31)
- **HH**: 2-digit hour (00-23)
- **MM**: 2-digit minute (00-59)
- **SS**: 2-digit second (00-59)
- **_**: Single underscore separator
- **descriptive_name**: Snake_case description
- **.sql**: File extension

---

## Generating Timestamps

### Command Line

```bash
# Generate current timestamp
date +"%Y%m%d%H%M%S"

# Create migration file with timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
touch supabase/migrations/${TIMESTAMP}_your_migration_description.sql
```

### Example

```bash
$ date +"%Y%m%d%H%M%S"
20251014134942

$ touch supabase/migrations/20251014134942_add_mtl_cross_domain_correlation.sql
```

---

## Examples

### ✅ CORRECT

```
20251014134942_mtl_schema_enhancements.sql
20251013233420_wave_2_schema_hardening.sql
20251013014128_fix_increment_player_loyalty_rpc.sql
20251007110110_rls_testing_policies.sql
20250920060318_visit_service_rpc_functions.sql
```

### ❌ INCORRECT

```
20251014_mtl_schema_enhancements.sql          ❌ Missing time component
20251014000001_wave_2_hardening.sql          ❌ Invalid time (00:00:01)
2025-10-14-134942_migration.sql              ❌ Wrong separator (hyphens)
20251014-mtl-schema.sql                      ❌ Missing time, wrong separator
migration_20251014.sql                       ❌ Wrong order
add_mtl_columns.sql                          ❌ No timestamp
```

---

## Rationale

### Why Full Timestamps?

1. **Temporal Ordering**: Migrations execute in filename order (lexicographic sort)
2. **Uniqueness**: Prevents timestamp collisions across developers/branches
3. **Traceability**: Exact creation time aids debugging and rollback
4. **Supabase Standard**: Aligns with official Supabase CLI conventions
5. **Git History**: Clear chronological progression in version control

### Why Not Simplified Patterns?

❌ **`YYYYMMDD000001`**:
- Ambiguous time of day
- Doesn't reflect actual creation time
- Can cause ordering issues with multiple migrations on same day

❌ **`YYYYMMDD_description`**:
- Multiple migrations on same day will conflict
- No chronological ordering within a day
- Breaks Supabase migration tracking

---

## Migration Workflow

### 1. Create Migration

```bash
# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# Create file
touch supabase/migrations/${TIMESTAMP}_descriptive_name.sql

# Open in editor
code supabase/migrations/${TIMESTAMP}_descriptive_name.sql
```

### 2. Write Migration

```sql
-- =====================================================
-- Migration: Descriptive Name
-- Created: YYYY-MM-DD HH:MM:SS
-- Purpose: Brief description of changes
-- =====================================================

BEGIN;

-- Your migration SQL here

COMMIT;
```

### 3. Verify Naming

```bash
# Check if filename follows pattern
ls -1 supabase/migrations/*.sql | tail -1 | grep -E '[0-9]{14}_.*\.sql$'
```

### 4. Apply Migration

```bash
# Apply to local database
npx supabase db reset

# Or apply only new migrations
npx supabase migration up

# Generate TypeScript types
npm run db:types
```

---

## Temporal Integrity Rules

### Rule 1: Chronological Order

Migrations MUST execute in chronological order. Filename sorting must match creation time order.

**Verification**:
```bash
ls -1 supabase/migrations/*.sql | sort
```

### Rule 2: No Backdating

Never create a migration with a timestamp earlier than existing migrations unless explicitly correcting historical data.

### Rule 3: No Future Dating

Use the current timestamp when creating migrations, not a planned future time.

### Rule 4: No Duplicate Timestamps

Each migration must have a unique timestamp. Wait 1 second if creating multiple migrations rapidly.

```bash
# Create multiple migrations with unique timestamps
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
touch supabase/migrations/${TIMESTAMP}_first_migration.sql

sleep 1  # Ensure unique timestamp

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
touch supabase/migrations/${TIMESTAMP}_second_migration.sql
```

---

## Descriptive Name Guidelines

### Format

- Use **snake_case** (lowercase with underscores)
- Keep under 50 characters
- Be specific and descriptive
- Use verb prefixes: `add_`, `create_`, `drop_`, `alter_`, `fix_`

### Good Examples

```
add_mtl_cross_domain_correlation
create_loyalty_ledger_audit_columns
fix_increment_player_loyalty_rpc
drop_deprecated_player_session_rpc
alter_ratingslip_add_correlation_id
migrate_ratingslip_id_to_uuid
wave_2_schema_hardening
phase_6_wave_0_bounded_context_corrections
```

### Bad Examples

```
migration                        ❌ Too generic
update                          ❌ No context
add-columns                     ❌ Wrong separator (hyphen)
AddMTLColumns                   ❌ PascalCase instead of snake_case
add_mtl_cross_domain_correlation_columns_for_session_tracking  ❌ Too long
mtl                             ❌ Not descriptive
```

---

## Validation Script

### Automated Validation

A validation script is available at `scripts/validate-migration-names.sh`:

```bash
# Run validation manually
./scripts/validate-migration-names.sh

# Output on success
✅ All migration filenames are valid
Standard: YYYYMMDDHHMMSS_description.sql
Total migrations: 19

# Output on failure
❌ Invalid: 20251014_bad_name.sql
   Expected: YYYYMMDDHHMMSS_description.sql
   Example:  20251014134942_add_mtl_columns.sql
```

### Pre-Commit Hook (Optional)

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
./scripts/validate-migration-names.sh || exit 1
```

---

## Historical Corrections

On 2025-10-14, 10 migration files were renamed to align with this standard. See `docs/patterns/MTL_MIGRATION_TIMESTAMP_FIX.md` for details.

**Corrected Files**:
- Phase 0 Security (Oct 6): 4 migrations
- UUID Migration (Oct 7): 3 migrations
- Phase 6 (Oct 13-14): 3 migrations

**Total**: 19 migrations now compliant ✅

---

## Troubleshooting

### Problem: Migration runs out of order

**Cause**: Filename timestamp doesn't match creation order

**Solution**:
1. Check `stat -c '%y %n' supabase/migrations/*.sql`
2. Rename migration to match actual creation time
3. Verify order: `ls -1 supabase/migrations/*.sql | sort`

### Problem: Duplicate timestamp

**Cause**: Multiple migrations created in same second

**Solution**:
1. Wait 1 second between migration creations
2. Or manually increment second component of later migration

### Problem: Migration applied but not in git

**Cause**: Migration created but not committed

**Solution**:
1. `git add supabase/migrations/`
2. `git commit -m "migration: descriptive message"`
3. Reference migration filename in commit message

---

## References

- **Supabase CLI Docs**: https://supabase.com/docs/guides/cli/managing-migrations
- **Historical Fix**: `docs/patterns/MTL_MIGRATION_TIMESTAMP_FIX.md`
- **Project Standards**: `.claude/CLAUDE.md` (DB Workflow section)
- **Migration Directory**: `supabase/migrations/`

---

## Checklist

Before creating a new migration:

- [ ] Generate timestamp with `date +"%Y%m%d%H%M%S"`
- [ ] Use format: `{timestamp}_descriptive_name.sql`
- [ ] Descriptive name is snake_case and under 50 chars
- [ ] Verify no duplicate timestamps exist
- [ ] Filename matches pattern: `[0-9]{14}_[a-z0-9_]+\.sql`
- [ ] Migration sorts after all existing migrations

Before committing a migration:

- [ ] Applied locally with `npx supabase db reset`
- [ ] Generated types with `npm run db:types`
- [ ] Schema verification test passes
- [ ] Migration filename added to commit message

---

**Document Status**: CANONICAL - Enforce on all new migrations
**Last Updated**: 2025-10-14
**Next Review**: When Supabase updates migration conventions
