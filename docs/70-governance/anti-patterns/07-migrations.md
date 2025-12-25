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

## RPC Self-Injection Violations (ADR-015)

### ❌ NEVER create SECURITY DEFINER RPCs without context self-injection

RPCs using `SECURITY DEFINER` bypass RLS. They MUST self-inject context before any data operations.

```sql
-- ❌ WRONG - No context injection
CREATE OR REPLACE FUNCTION rpc_get_player_data(p_player_id uuid)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Directly queries without setting context - RLS bypassed!
  RETURN QUERY SELECT * FROM player WHERE id = p_player_id;
END;
$$;

-- ✅ CORRECT - Pattern 1: Self-inject before data access (RLS-only functions)
CREATE OR REPLACE FUNCTION rpc_get_player_data(p_player_id uuid)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- Self-inject context from JWT/session
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    -- Fallback to JWT claim if available
    v_context_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
  END IF;

  -- Inject context for RLS policies
  PERFORM set_config('app.casino_id', v_context_casino_id::text, true);

  -- Now RLS policies will work
  RETURN QUERY SELECT * FROM player WHERE id = p_player_id;
END;
$$;

-- ✅ CORRECT - Pattern 2: Full injection + validation (RPCs with p_casino_id param)
CREATE OR REPLACE FUNCTION rpc_create_record(p_casino_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- Extract context
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
  END IF;

  -- Validate parameter matches context
  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller % context %', p_casino_id, v_context_casino_id;
  END IF;

  -- Self-inject for RLS
  PERFORM set_config('app.casino_id', v_context_casino_id::text, true);

  -- Proceed with operation
  INSERT INTO records (casino_id, name) VALUES (p_casino_id, p_name);
  RETURN gen_random_uuid();
END;
$$;
```

**Why this matters:**
- `SECURITY DEFINER` runs as the function owner (superuser), bypassing all RLS
- Without self-injection, queries return data from ALL casinos
- Pre-commit hook `check_rpc_context_injection.py` catches violations

**Reference:** See ADR-015 and `.claude/skills/rls-expert/references/rpc-self-injection.md`

---

## Quick Checklist

- [ ] Migrations use Supabase CLI only
- [ ] Timestamp follows `YYYYMMDDHHMMSS` format
- [ ] Types regenerated after migration (`npm run db:types`)
- [ ] Migration includes `NOTIFY pgrst, 'reload schema'`
- [ ] No direct psql usage in runtime
- [ ] **SECURITY DEFINER RPCs self-inject context (ADR-015)**
