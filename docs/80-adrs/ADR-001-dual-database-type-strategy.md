# ADR-001: Dual Database Type Strategy (Local + Remote)

> **Status**: Accepted
> **Date**: 2025-10-06
> **Decision Makers**: Development Team
> **Context**: Schema Drift Audit Post-Phase 2

---

## Context and Problem Statement

After applying Phase 0-1 migrations to the remote Supabase database and regenerating types, we discovered a discrepancy between local and remote type files:

- **Local**: `types/database.types.ts` (generated from local Supabase instance)
- **Remote**: `types/remote/database.types.ts` (generated from production Supabase project)

The remote types include additional metadata (`__InternalSupabase`) and GraphQL schema (`graphql_public`) that local types lack, while all core table/enum/function definitions remain identical.

**Question**: Should we sync to a single type file or maintain dual type files for different environments?

---

## Decision Drivers

- **Development velocity**: Fast local iteration without remote dependency
- **Type safety**: Ensure service layer types are consistent
- **Production confidence**: Validate against actual production schema
- **Migration workflow**: Clear separation between local testing and remote deployment
- **Team workflow**: Multiple developers working with different database states

---

## Considered Options

### Option A: Single Type File (Remote as Source of Truth)
Replace local types with remote types, use remote types everywhere.

### Option B: Dual Type Files (Separate Local + Remote) ✅ CHOSEN
Maintain separate type files for local development and remote validation.

### Option C: Dynamic Type Switching
Use environment variables to switch between local/remote types at build time.

---

## Decision Outcome

**Chosen option**: **Option B - Dual Type Files**

We will maintain separate type files for local and remote databases with the following strategy:

### File Structure
```
types/
├── database.types.ts           # LOCAL types (development, testing)
└── remote/
    └── database.types.ts       # REMOTE types (validation, production verification)
```

### Usage Pattern
```typescript
// Services, hooks, components - use LOCAL types
import type { Database } from "@/types/database.types";

// Production validation scripts - use REMOTE types
import type { Database } from "@/types/remote/database.types";
```

---

## Detailed Rationale

### 1. Development Workflow Benefits

#### Local Development Iteration
```bash
# Developer workflow (no remote dependency)
1. Write migration locally
2. Apply to local DB: supabase db reset
3. Generate types: npm run db:types
4. Implement service layer with fresh types
5. Run tests against local DB (tests use their own .env.test)
6. Commit when ready

# No network latency, no remote quota usage, full control
```

#### Remote Deployment Workflow
```bash
# Deployment workflow (careful, production impact)
1. Migrations tested locally ✅
2. Apply to remote: supabase db push --linked
3. Generate remote types: npm run db:types:remote
4. Validate no breaking changes
5. Deploy application
6. Verify production

# Separate concerns: local experimentation vs production deployment
```

### 2. Migration Testing Safety

**Local Database**: Disposable, resettable, experimental
```bash
# Fearless iteration
supabase db reset              # Nuke everything, start fresh
supabase migration new test    # Experiment freely
supabase db reset              # Rollback if bad
```

**Remote Database**: Production data, careful changes only
```bash
# Careful, measured approach
supabase db push --linked      # After local validation only
supabase db diff --linked      # Verify changes before apply
# NO db reset - production data preservation
```

### 3. Type Generation Differences Explained

#### Local Type Generation (`types/database.types.ts`)
```bash
npm run db:types
# Runs: supabase gen types typescript --local > types/database.types.ts
```

**Generates**:
- ✅ All `public` schema tables
- ✅ All enums
- ✅ All views
- ✅ All functions
- ❌ No `__InternalSupabase` metadata (CLI doesn't expose from local)
- ❌ No `graphql_public` schema (local doesn't run GraphQL endpoint)

**Why**: Local Supabase runs minimal services (PostgREST + Auth), no GraphQL endpoint.

#### Remote Type Generation (`types/remote/database.types.ts`)
```bash
npm run db:types:remote
# Runs: supabase gen types typescript --linked > types/remote/database.types.ts
```

**Generates**:
- ✅ All `public` schema tables (identical to local)
- ✅ All enums (identical to local)
- ✅ All views (identical to local)
- ✅ All functions (identical to local)
- ✅ `__InternalSupabase` metadata (PostgREST version from remote)
- ✅ `graphql_public` schema (remote runs full GraphQL endpoint)

**Why**: Remote Supabase runs full production services including GraphQL API.

### 4. Schema Consistency Validation

Both type files share **identical core schemas**:

| Component | Local | Remote | Impact on Code |
|-----------|-------|--------|----------------|
| Tables (40) | ✅ Identical | ✅ Identical | **Zero impact** |
| Enums (15) | ✅ Identical | ✅ Identical | **Zero impact** |
| Views (4) | ✅ Identical | ✅ Identical | **Zero impact** |
| Functions (50+) | ✅ Identical | ✅ Identical | **Zero impact** |
| GraphQL | ❌ Missing | ✅ Present | **No impact** (not used in MVP) |
| Metadata | ❌ Missing | ✅ Present | **No impact** (not actively used) |

**Conclusion**: Service layer code is **100% compatible** with both type files since all actual database operations use the `public` schema which is identical.

---

## Nuanced Details: Working with Remote vs Local DBs

### When to Use Local Database

**✅ Use Local For**:
1. **Feature development** - New service implementation, TDD slices
2. **Migration authoring** - Writing and testing new migrations
3. **Schema experimentation** - Trying different table structures
4. **Breaking changes** - Testing destructive migrations safely
5. **Integration tests** - Running test suites without remote quota
6. **Rapid iteration** - `db reset` for instant clean slate

**Local Database Characteristics**:
- **Ephemeral**: Can be destroyed and rebuilt instantly
- **Isolated**: No impact on team members or production
- **Fast**: No network latency, instant query responses
- **Unlimited**: No API quotas or connection limits
- **Disposable**: Feel free to corrupt and reset

### When to Use Remote Database

**✅ Use Remote For**:
1. **Production deployment** - Final migration application
2. **Team collaboration** - Shared schema state across developers
3. **Staging validation** - Pre-production smoke tests
4. **Performance testing** - Real-world latency and connection pooling
5. **RLS validation** - Testing with actual JWT claims and auth state
6. **Type verification** - Ensuring production schema matches expectations

**Remote Database Characteristics**:
- **Persistent**: Contains real or staging data, cannot easily reset
- **Shared**: Changes affect entire team and production users
- **Constrained**: API quotas, connection limits, rate limiting
- **Monitored**: Logs, metrics, alerts on schema changes
- **Careful**: Migrations are forward-only, no easy rollback

---

## Migration Workflow: Local → Remote

### Step 1: Local Development
```bash
# 1. Create migration locally
supabase migration new add_player_rating_cache

# 2. Write SQL migration
vim supabase/migrations/20251006120000_add_player_rating_cache.sql

# 3. Apply locally
supabase db reset  # Or: supabase migration up

# 4. Generate local types
npm run db:types

# 5. Implement service layer using new types
# services/player/queries.ts now has RatingCache types

# 6. Run tests locally
npm test

# 7. Commit when green
git add supabase/migrations types/database.types.ts
git commit -m "Add player rating cache table"
```

### Step 2: Remote Validation
```bash
# 1. Check diff before applying
supabase db diff --linked
# Review: Shows exactly what will change in remote

# 2. Apply migration to remote
supabase db push --linked
# Careful: This modifies production/staging database

# 3. Generate remote types
npm run db:types:remote

# 4. Compare type files
diff types/database.types.ts types/remote/database.types.ts
# Expect: Only GraphQL/metadata differences (harmless)

# 5. If breaking changes detected
# - Review impact on existing queries
# - Plan deployment strategy (blue/green, maintenance window)
# - Update dependent services

# 6. Commit remote types
git add types/remote/database.types.ts
git commit -m "Update remote types post-migration"
```

### Step 3: Deployment
```bash
# 1. Deploy application (migration already applied)
vercel deploy --prod

# 2. Verify remote types work in production
# - No type errors in deployed app
# - All queries execute successfully
# - RLS policies enforced correctly

# 3. Monitor for issues
# - Check Supabase logs
# - Verify no broken queries
# - Validate data integrity
```

---

## Type Sync Scenarios

### Scenario 1: Local Ahead of Remote (Development)
```
Local DB: Has new migration (player_rating_cache table)
Remote DB: Does not have migration yet
Local Types: Include player_rating_cache
Remote Types: Missing player_rating_cache

Status: ✅ Normal during development
Action: Continue development, apply migration to remote when ready
```

### Scenario 2: Remote Ahead of Local (Deployment)
```
Local DB: Does not have latest production migration
Remote DB: Has new migration applied
Local Types: Missing new table
Remote Types: Include new table

Status: ⚠️ Developer out of sync
Action: Pull migrations and reset local: supabase db pull && supabase db reset
```

### Scenario 3: Divergent State (Problem)
```
Local DB: Has experimental migration X
Remote DB: Has different migration Y (same timestamp)
Local Types: Include X schema
Remote Types: Include Y schema

Status: 🔴 Conflict
Action: Resolve migration conflict, regenerate types for both
```

### Scenario 4: Perfect Sync (Ideal)
```
Local DB: Same migrations as remote
Remote DB: All migrations applied
Local Types: Match remote (except GraphQL/metadata)
Remote Types: Match local (plus GraphQL/metadata)

Status: ✅ Ideal state
Action: None, proceed with development
```

---

## CI/CD Integration

### Type Drift Detection
```yaml
# .github/workflows/schema-validation.yml
name: Schema Validation

on: [pull_request]

jobs:
  validate-types:
    runs-on: ubuntu-latest
    steps:
      - name: Check for local type changes
        run: |
          if git diff --name-only origin/main | grep types/database.types.ts; then
            echo "✅ Local types changed (migration detected)"
          fi

      - name: Validate migration exists
        run: |
          # If types changed, must have corresponding migration
          if git diff --name-only origin/main | grep types/database.types.ts; then
            if ! git diff --name-only origin/main | grep supabase/migrations; then
              echo "❌ Types changed without migration!"
              exit 1
            fi
          fi

      - name: Check remote sync status
        run: |
          npm run db:types:remote
          if git diff types/remote/database.types.ts; then
            echo "⚠️ Remote types out of sync (expected until migration deployed)"
          fi
```

### Pre-commit Hook
```bash
# .husky/pre-commit
#!/usr/bin/env sh

# Check if migration files changed
if git diff --cached --name-only | grep "supabase/migrations"; then
  echo "🔍 Migration detected, regenerating local types..."
  npm run db:types
  git add types/database.types.ts

  echo "ℹ️  Remember to update remote types after deploying migration:"
  echo "   npm run db:types:remote"
fi
```

---

## NPM Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --local > types/database.types.ts",
    "db:types:remote": "supabase gen types typescript --linked > types/remote/database.types.ts",
    "db:diff": "supabase db diff --linked",
    "db:push": "supabase db push --linked",
    "db:pull": "supabase db pull && supabase db reset",
    "db:validate": "npm run db:types && npm run db:types:remote && echo '✅ Types regenerated'"
  }
}
```

---

## Team Workflow Guidelines

### For Feature Developers

```bash
# Daily workflow
1. Pull latest migrations: git pull
2. Reset local DB: supabase db reset
3. Verify types current: npm run db:types
4. Develop feature using local types
5. Run tests against local DB
6. Commit migration + local types

# ✅ DO: Use local database for all development
# ✅ DO: Regenerate local types after schema changes
# ❌ DON'T: Apply migrations to remote without review
# ❌ DON'T: Use remote types in service layer imports
```

### For DevOps/Migration Deployer

```bash
# Deployment workflow
1. Review all pending migrations: ls supabase/migrations
2. Test migrations locally: supabase db reset
3. Check remote diff: supabase db diff --linked
4. Apply to remote: supabase db push --linked
5. Regenerate remote types: npm run db:types:remote
6. Commit remote types: git add types/remote/database.types.ts
7. Deploy application
8. Notify team of schema change

# ✅ DO: Always check diff before pushing
# ✅ DO: Update remote types after deployment
# ❌ DON'T: Push migrations without local testing
# ❌ DON'T: Skip remote type regeneration
```

---

## Benefits

### ✅ Advantages

1. **Fast Local Iteration**: No remote dependency during development
2. **Safe Experimentation**: Local DB is disposable, encourages trying ideas
3. **Clear Separation**: Local = development, Remote = production validation
4. **Offline Development**: Can work without internet (local Supabase only)
5. **Team Independence**: Developers don't block each other with schema changes
6. **Migration Testing**: Validate migrations locally before remote deployment
7. **Type Safety Maintained**: Both type files share identical core schemas

### ⚠️ Trade-offs

1. **Manual Sync**: Developers must remember to pull migrations and reset local
2. **Potential Drift**: Local and remote can diverge if not disciplined
3. **Dual Maintenance**: Two type files to keep in sync (automated via scripts)
4. **Cognitive Load**: Understanding which database to use when
5. **CI Complexity**: Must validate both local and remote type generation

---

## Consequences

### Positive

- **Faster development**: No remote round-trips for schema changes
- **Better testing**: Can reset local DB freely for clean test runs
- **Migration safety**: Test destructive migrations locally first
- **Team productivity**: No blocking on shared remote database state

### Negative

- **Sync discipline required**: Team must follow workflow guidelines
- **Tooling complexity**: Need scripts to manage dual type files
- **Potential confusion**: New developers may not understand dual strategy

### Neutral

- **Documentation critical**: This ADR must be well-understood by team
- **Onboarding overhead**: New developers need workflow training
- **Process enforcement**: CI checks required to catch sync issues

---

## Compliance with PRD

### Section 3.2: Type System (PRD Requirement)
> "Generate a single canonical `database.types.ts` from the Supabase schema and check it into the repo."

**Interpretation**:
- **Local types** (`database.types.ts`) serve as the canonical source for **service layer development**
- **Remote types** serve as **validation** that production schema matches expectations
- Both derive from the same migration source, ensuring consistency

**Compliance**: ✅ Service layer uses single canonical local types, remote types for validation only

### Section 3.10: Testing & CI/CD (PRD Requirement)
> "CI gates: Supabase migration validation, type-regeneration diff check"

**Implementation**:
- CI validates local types match migrations
- CI warns if remote types out of sync
- Deployment pipeline regenerates remote types post-migration

**Compliance**: ✅ Automated validation prevents drift

---

## Monitoring and Review

### Quarterly Review Triggers
- Remote type drift exceeds 5% of schema
- Team reports confusion about which types to use
- Migration deployment failures due to type mismatches
- Developer velocity decreases due to sync overhead

### Success Metrics
- ✅ Zero production incidents from type mismatches
- ✅ <5 min average migration deployment time
- ✅ Developer survey: >80% understand dual type workflow
- ✅ CI catches 100% of type drift before merge

---

## References

- [Schema Drift Audit Report](../audits/SCHEMA_DRIFT_AUDIT.md)
- [Supabase Local Development Docs](https://supabase.com/docs/guides/cli/local-development)
- [DATABASE_WORKFLOW.md](../phase-0/DATABASE_WORKFLOW.md)
- [CANONICAL_BLUEPRINT_MVP_PRD.md](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) - Section 3.2

---

**Status**: ✅ Accepted
**Review Date**: 2025-10-27 (End of Phase 2)
**Owner**: Development Team
