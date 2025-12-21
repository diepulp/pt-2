# Migration Anti-Patterns

**Target Agents**: `devops-pt2`, `backend-developer`
**Severity**: MEDIUM - Affects deployment reliability

---

## Direct Database Access

### ❌ NEVER use psql directly

```bash
# ❌ WRONG
psql postgres://localhost:54322/postgres -c "ALTER TABLE..."

# ✅ CORRECT
npx supabase migration new add_column
# Edit migration file
npx supabase migration up
```

### ❌ NEVER run ad-hoc SQL in production

```bash
# ❌ WRONG
psql $DATABASE_URL -c "UPDATE player SET status = 'active';"

# ✅ CORRECT
# Create a migration, even for data fixes
npx supabase migration new fix_player_status
# Add SQL to migration file with proper transaction handling
```

---

## Timestamp Patterns

### ❌ NEVER use simplified timestamp patterns

```bash
# ❌ WRONG
20251014_add_loyalty_service.sql
20251014000001_add_loyalty_service.sql

# ✅ CORRECT
20251014134942_add_loyalty_service.sql  # Full timestamp
# Use: date +"%Y%m%d%H%M%S"
```

### Migration Naming Standard

Format: `YYYYMMDDHHMMSS_descriptive_name.sql`

```bash
# Generate correct timestamp
date +"%Y%m%d%H%M%S"
# Output: 20251220153042

# Create migration
npx supabase migration new add_player_loyalty_tier
# Creates: 20251220153042_add_player_loyalty_tier.sql
```

---

## Missing Type Regeneration

### ❌ NEVER commit migrations without regenerating types

```bash
# ❌ WRONG
npx supabase migration up
git add supabase/migrations/
git commit -m "Add new column"

# ✅ CORRECT
npx supabase migration up
npm run db:types  # ← Regenerate types
git add supabase/migrations/ types/database.types.ts
git commit -m "Add new column + regenerate types"
```

---

## Missing Schema Reload

### ❌ NEVER skip PostgREST schema reload after migrations

```sql
-- ❌ WRONG - Migration without notify
CREATE TABLE new_table (...);

-- ✅ CORRECT - Always notify PostgREST
CREATE TABLE new_table (...);

-- At end of migration
NOTIFY pgrst, 'reload schema';
```

---

## Quick Checklist

- [ ] Migrations use Supabase CLI only
- [ ] Timestamp follows `YYYYMMDDHHMMSS` format
- [ ] Types regenerated after migration (`npm run db:types`)
- [ ] Migration includes `NOTIFY pgrst, 'reload schema'`
- [ ] No direct psql usage in runtime
