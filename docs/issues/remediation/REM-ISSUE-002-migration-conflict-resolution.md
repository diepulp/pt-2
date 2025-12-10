# REM-ISSUE-002: Migration Conflict Resolution

**Issue:** ISSUE-002 - RLS Context RPC Failure
**Status:** Root Cause Identified - Awaiting Manual Reset
**Created:** 2025-12-10
**Priority:** P0 - Blocking
**Strategy:** Database reset with conflicting migration removal

## Executive Summary

The ADR-015 hybrid RLS policies were **correctly applied** but then **overwritten** by a later migration that synced old schema from Supabase remote. The CLI showed migrations as "applied" because they were - but in a conflicting order that left the database with vulnerable non-hybrid policies.

## Root Cause: Migration Conflict

### Timeline of Events

| Time | Event | Impact |
|------|-------|--------|
| 18:34:01 | `20251209183401_adr015_hybrid_rls_policies.sql` applied | Hybrid policies created with JWT fallback |
| 21:58:34 | `20251209215834_sync_remote_changes.sql` applied | **OVERWROTE** hybrid policies with old patterns |
| Current | Database has OLD policies, no JWT fallback | RLS fails with connection pooling |

### The Smoking Gun

**File:** `/home/diepulp/projects/pt-2/supabase/migrations/20251209215834_sync_remote_changes.sql`

**Conflicting Content (Lines 24-29):**
```sql
create policy "staff_read"
on "public"."staff"
as permissive
for select
to public
using ((casino_id = (current_setting('app.casino_id'::text, true))::uuid));
```

This is the **OLD pattern** - no `auth.uid()` guard, no JWT fallback, vulnerable to connection pooling issues.

**Expected Pattern (from ADR-015):**
```sql
CREATE POLICY staff_read_hybrid ON staff
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Why This Happened

This is a classic **remote schema drift** scenario:

1. Local development created ADR-015 migrations
2. Supabase remote database had older schema
3. Someone ran `supabase db pull` or similar sync command
4. Generated migration pulled in remote state, overwriting local changes
5. Migration was committed without reviewing the conflict

### Evidence from Migration History

```bash
# Conflicting migrations in sequence:
20251209183033_adr015_rls_context_rpc.sql       # WS1: RPC function (OK)
20251209183401_adr015_hybrid_rls_policies.sql   # WS4: Hybrid policies (OK, then overwritten)
20251209215834_sync_remote_changes.sql          # CONFLICT: Old schema restored
```

## Remediation Plan

### Phase 1: Remove Conflicting Migration

**Action:** Delete the sync_remote_changes migration
```bash
rm /home/diepulp/projects/pt-2/supabase/migrations/20251209215834_sync_remote_changes.sql
```

**Rationale:**
- This migration conflicts with ADR-015 strategy
- Contains old, vulnerable RLS policies
- Was auto-generated, not hand-crafted
- Restores schema state that ADR-015 was designed to fix

### Phase 2: Database Reset

**Action:** Reset database to reapply clean migration history
```bash
npx supabase db reset
```

**Effect:**
- Drops and recreates database
- Applies all migrations in chronological order
- Excludes deleted `sync_remote_changes.sql`
- Results in ADR-015 hybrid policies being final state

### Phase 3: Verification

**Step 1: Verify Migration State**
```bash
docker exec supabase_db_pt-2 psql -U postgres -c "
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  ORDER BY version;
"
```

Expected: NO entry for `20251209215834`

**Step 2: Verify Hybrid Policies Applied**
```bash
docker exec supabase_db_pt-2 psql -U postgres -c "
  SELECT
    tablename,
    policyname,
    pg_get_expr(qual, polrelid) as policy_definition
  FROM pg_policies
  WHERE tablename IN ('player', 'visit', 'staff', 'gaming_table', 'rating_slip')
  ORDER BY tablename, policyname;
"
```

Expected: All policies should contain:
- `auth.uid() IS NOT NULL` guard
- `COALESCE(NULLIF(current_setting(...), '')::uuid, (auth.jwt() -> 'app_metadata' ->> ...)::uuid)` pattern

**Step 3: Test Endpoint**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/visits
```

Expected: `200`

**Step 4: Test with Connection Pooling**
```bash
# Make multiple concurrent requests to test pooling resilience
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/visits &
done
wait
```

Expected: All `200` responses, no cross-tenant leakage

## Post-Reset Actions

### 1. Update Remote Database

After local reset succeeds, sync changes to remote:

```bash
# Push local migrations to remote (excluding deleted sync file)
npx supabase db push

# Or if using staging/production:
npx supabase db push --db-url $STAGING_DATABASE_URL
```

### 2. Document Migration Conflict Prevention

**Add to `.github/PULL_REQUEST_TEMPLATE.md`:**
```markdown
## Migration Checklist

- [ ] No conflicting `sync_remote_changes` or `db pull` migrations
- [ ] All RLS policies match ADR-015 patterns (A/B/C)
- [ ] Migration tested with `supabase db reset` locally
- [ ] No schema drift between local/remote
```

### 3. Add Pre-commit Hook

**Create `.git/hooks/pre-commit`:**
```bash
#!/bin/bash
# Check for conflicting migration patterns

MIGRATIONS_DIR="supabase/migrations"

if git diff --cached --name-only | grep -q "$MIGRATIONS_DIR"; then
  echo "Checking migrations for ADR-015 compliance..."

  # Check for raw current_setting without JWT fallback
  if git diff --cached | grep -E "current_setting\('app\.(casino_id|staff_role|actor_id)'" | grep -v "COALESCE"; then
    echo "ERROR: Migration contains raw current_setting() without JWT fallback"
    echo "See ADR-015 for required patterns"
    exit 1
  fi
fi
```

### 4. Update Issue Documentation

Mark ISSUE-002 as resolved with conflict details:

```bash
# Add resolution notes to ISSUE-002
# Reference this remediation document
# Document findings for future reference
```

## Risk Assessment

### Risks of Reset

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data loss | LOW | Local dev environment, seed data can be regenerated |
| Migration sequence breaks | LOW | Removing single conflicting file, others are compatible |
| Remote sync issues | MEDIUM | Document remote push steps, verify before pushing |

### Risks of NOT Resetting

| Risk | Likelihood | Impact |
|------|------------|--------|
| Connection pooling failures | **HIGH** | P0 - All RLS-protected endpoints fail intermittently |
| Cross-tenant data leakage | **HIGH** | P0 - Security vulnerability |
| Inconsistent local/remote schema | **HIGH** | Future migrations will conflict |

**Recommendation:** Proceed with reset - risks are acceptable for local dev environment.

## Lessons Learned

### What Went Wrong

1. **No migration review process** - Auto-generated migration committed without inspection
2. **No ADR-015 compliance check** - Would have caught old pattern in sync file
3. **No integration tests** - WS6 would have detected policy failure post-migration
4. **Remote schema drift untracked** - Local and remote diverged without detection

### What Went Right

1. **Migration files version-controlled** - Can analyze conflict timeline
2. **ADR-015 documentation complete** - Clear patterns to verify against
3. **Diagnostic tools available** - `psql` queries identified exact issue
4. **Destructive command hook** - Prevented accidental data loss

### Improvements

1. Implement pre-commit migration validation hook
2. Complete WS6 integration tests (would have caught this)
3. Add migration conflict detection to CI/CD
4. Document remote sync procedures in runbook

## Compliance Verification

### ADR-015 Pattern C Checklist

After reset, verify all policies comply:

- [ ] All policies have `auth.uid() IS NOT NULL` guard
- [ ] All casino_id comparisons use `COALESCE(NULLIF(current_setting(...), '')::uuid, jwt_fallback)`
- [ ] All staff_role comparisons use `COALESCE(NULLIF(current_setting(...), ''), jwt_fallback)`
- [ ] All actor_id comparisons use `COALESCE(NULLIF(current_setting(...), '')::uuid, jwt_fallback)`
- [ ] No raw `current_setting()` calls in RLS policies
- [ ] NOTIFY pgrst, 'reload schema' present in migration

## References

- **Root Issue:** `/home/diepulp/projects/pt-2/docs/issues/ISSUE-002-rls-context-rpc-failure.md`
- **Governing ADR:** `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **Conflicting Migration:** `/home/diepulp/projects/pt-2/supabase/migrations/20251209215834_sync_remote_changes.sql` (TO BE DELETED)
- **Correct Migration:** `/home/diepulp/projects/pt-2/supabase/migrations/20251209183401_adr015_hybrid_rls_policies.sql`

## Execution Status

- [x] Root cause identified
- [x] Remediation plan documented
- [ ] Conflicting migration deleted (MANUAL)
- [ ] Database reset executed (MANUAL - blocked by destructive command hook)
- [ ] Policies verified post-reset (PENDING)
- [ ] Endpoint tests passed (PENDING)
- [ ] Remote database synced (PENDING)
- [ ] Documentation updated (PENDING)

## Sign-off

**RLS Security Specialist:** Analysis complete, awaiting manual execution
**Date:** 2025-12-10
**Next Action:** User must manually execute Phase 1 & 2 steps
