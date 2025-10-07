# Database Type Management Workflow

> **Quick Reference**: How to work with local and remote database types in PT-2
> **See Also**: [ADR-001: Dual Database Type Strategy](../architecture/ADR-001-dual-database-type-strategy.md)

---

## TL;DR

- **Development**: Use local database + local types (`types/database.types.ts`)
- **Deployment**: Apply to remote + regenerate remote types (`types/remote/database.types.ts`)
- **Service Code**: Always import from `@/types/database.types` (local)

---

## Quick Commands

```bash
# Local Development
npm run db:types              # Regenerate local types
supabase db reset             # Reset local DB to migrations

# Remote Validation
npm run db:types:remote       # Regenerate remote types
supabase db diff --linked     # Check remote diff before pushing

# Deployment
supabase db push --linked     # Apply migrations to remote
npm run db:types:remote       # Update remote types post-deployment
```

---

## Daily Development Workflow

### 1. Start of Day - Sync with Team
```bash
# Pull latest code and migrations
git pull

# Reset local DB to latest migrations
supabase db reset

# Verify types are current
npm run db:types

# Ready to develop! 🚀
```

### 2. Writing a New Migration
```bash
# 1. Create migration file
supabase migration new add_player_preferences

# 2. Edit migration SQL
# vim supabase/migrations/20251006120000_add_player_preferences.sql

# 3. Apply to local database
supabase db reset

# 4. Regenerate local types
npm run db:types-local

# 5. Implement feature using new types
# services/player/preferences.ts now has PlayerPreferences types

# 6. Test locally
npm test

# 7. Commit migration + types
git add supabase/migrations/20251006120000_add_player_preferences.sql
git add types/database.types.ts
git commit -m "Add player preferences table"
```

### 3. Using Types in Service Layer
```typescript
// ✅ CORRECT: Import local types
import type { Database } from "@/types/database.types";
import { createClient } from "@supabase/supabase-js";

export function createPlayerService(
  supabase: SupabaseClient<Database> // Uses local types
) {
  return {
    async getById(id: string) {
      // TypeScript knows about all tables from local types
      const { data } = await supabase
        .from("player")
        .select("*")
        .eq("id", id)
        .single();

      return data; // Fully typed!
    }
  };
}

// ❌ WRONG: Never import remote types in service layer
import type { Database } from "@/types/remote/database.types"; // NO!
```

---

## Deployment Workflow

### Pre-Deployment: Validate Locally
```bash
# 1. Ensure all migrations tested locally
supabase db reset
npm test

# 2. Check what will change in remote
supabase db diff --linked

# Output shows exact SQL that will run on remote
# Review carefully for breaking changes!
```

### Deployment: Apply to Remote
```bash
# 1. Apply migrations to remote database
supabase db push --linked

# ⚠️ CAREFUL: This modifies production/staging database

# 2. Regenerate remote types
npm run db:types:remote

# 3. Verify remote types
git diff types/remote/database.types.ts
# Should show new tables/columns/functions

# 4. Commit remote types
git add types/remote/database.types.ts
git commit -m "Update remote types after migration deployment"

# 5. Deploy application
vercel deploy --prod
```

### Post-Deployment: Validation
```bash
# 1. Check Supabase logs for migration errors
supabase logs --linked

# 2. Verify application works with new schema
# - No type errors in deployed app
# - All queries execute successfully
# - RLS policies working correctly

# 3. Notify team
# Slack/Discord: "Migration X deployed, reset your local DB"
```

---

## Common Scenarios

### Scenario: Local DB Out of Sync
```bash
# Symptoms
- TypeScript errors about missing tables
- Service tests failing unexpectedly
- "Table X does not exist" errors locally

# Solution
git pull                      # Get latest migrations
supabase db reset             # Rebuild local DB
npm run db:types              # Regenerate local types
npm test                      # Verify everything works
```

### Scenario: Remote DB Out of Sync
```bash
# Symptoms
- Production errors about missing columns
- Remote type file doesn't match local
- Deployment failures

# Solution
supabase db diff --linked     # Check what's missing
supabase db push --linked     # Apply pending migrations
npm run db:types:remote       # Update remote types
```

### Scenario: Type Import Errors
```typescript
// Error: Cannot find module '@/types/database.types'
import type { Database } from "@/types/database.types";

// Solution 1: Check tsconfig.json paths
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]  // Ensure this exists
    }
  }
}

// Solution 2: Regenerate types
npm run db:types

// Solution 3: Use relative path temporarily
import type { Database } from "../../types/database.types";
```

### Scenario: Migration Rollback Needed
```bash
# ❌ WRONG: Cannot rollback migrations easily
supabase migration down  # This doesn't exist!

# ✅ CORRECT: Write a new migration to undo changes
supabase migration new rollback_player_preferences

# In rollback migration:
# DROP TABLE player_preferences;

# Apply rollback
supabase db reset              # Local
supabase db push --linked      # Remote
```

---

## Type File Differences Explained

### Local Types (`types/database.types.ts`)
```typescript
export type Json = /* ... */;

export interface Database {
  public: {
    Tables: {
      player: { /* ... */ },
      visit: { /* ... */ },
      // All your tables
    },
    Views: { /* MTL views */ },
    Functions: { /* RPC functions */ },
    Enums: { /* All enums */ }
  }
}

// ❌ Missing (doesn't affect development):
// - __InternalSupabase metadata
// - graphql_public schema
```

### Remote Types (`types/remote/database.types.ts`)
```typescript
export type Json = /* ... */;

export interface Database {
  public: {
    Tables: { /* IDENTICAL to local */ },
    Views: { /* IDENTICAL to local */ },
    Functions: { /* IDENTICAL to local */ },
    Enums: { /* IDENTICAL to local */ }
  },

  // ✅ Additional (not used in MVP):
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  },

  graphql_public: {
    Functions: {
      graphql: { /* GraphQL endpoint types */ }
    }
  }
}
```

**Key Insight**: Both files have **identical** `public` schema definitions, so all service code works with both!

---

## CI/CD Integration

### GitHub Actions Validation
```yaml
# .github/workflows/schema-validation.yml
name: Schema Validation

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'types/**'

jobs:
  validate-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Start local Supabase
        run: supabase start

      - name: Validate local types match migrations
        run: |
          npm run db:types
          if git diff --exit-code types/database.types.ts; then
            echo "✅ Local types in sync with migrations"
          else
            echo "❌ Local types out of sync! Run npm run db:types"
            exit 1
          fi
```

### Pre-commit Hook
```bash
# .husky/pre-commit
#!/usr/bin/env sh

MIGRATIONS_CHANGED=$(git diff --cached --name-only | grep "supabase/migrations")

if [ -n "$MIGRATIONS_CHANGED" ]; then
  echo "🔍 Migration detected, regenerating local types..."
  npm run db:types
  git add types/database.types.ts

  echo ""
  echo "✅ Local types updated"
  echo "⚠️  Remember after deploying migration:"
  echo "   npm run db:types:remote"
  echo "   git add types/remote/database.types.ts"
  echo ""
fi
```

---

## NPM Scripts Reference

Add to `package.json`:
```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --local > types/database.types.ts",
    "db:types:remote": "supabase gen types typescript --linked > types/remote/database.types.ts",
    "db:diff": "supabase db diff --linked",
    "db:push": "supabase db push --linked",
    "db:pull": "supabase db pull",
    "db:reset": "supabase db reset",
    "db:validate": "npm run db:types && npm run db:types:remote && echo '✅ All types regenerated'"
  }
}
```

---

## Troubleshooting

### Problem: Types not updating after migration
```bash
# Check if migration applied
supabase migration list

# Force regenerate
rm types/database.types.ts
npm run db:types

# Verify change
git diff types/database.types.ts
```

### Problem: Local DB won't start
```bash
# Stop all Supabase services
supabase stop

# Clean up Docker volumes
docker volume prune

# Restart
supabase start
```

### Problem: Remote types show unexpected differences
```bash
# Check what's actually in remote DB
supabase db diff --linked

# If remote has changes not in migrations:
# Someone applied manual changes! 😱

# Solution: Extract as migration
supabase db diff --linked > supabase/migrations/$(date +%Y%m%d%H%M%S)_manual_changes.sql
```

---

## Best Practices

### ✅ DO

- Regenerate local types after every migration
- Test migrations locally before remote deployment
- Commit local types with migration in same PR
- Reset local DB daily to stay in sync with team
- Use `db:diff` before `db:push` to preview changes
- Document breaking migrations in PR description

### ❌ DON'T

- Import remote types in service layer
- Skip local testing before remote deployment
- Apply migrations directly to remote DB via SQL editor
- Keep local DB running for days without reset
- Ignore type generation warnings
- Commit remote types without actually deploying migration

---

## Quick Reference Card

| Task | Command | When |
|------|---------|------|
| **Regenerate local types** | `npm run db:types` | After migration, start of day |
| **Regenerate remote types** | `npm run db:types:remote` | After remote deployment |
| **Reset local DB** | `supabase db reset` | Daily sync, after pulling migrations |
| **Check remote diff** | `supabase db diff --linked` | Before deployment |
| **Deploy migration** | `supabase db push --linked` | After local validation |
| **New migration** | `supabase migration new <name>` | Feature development |
| **List migrations** | `supabase migration list` | Check migration status |

---

## Related Documentation

- [ADR-001: Dual Database Type Strategy](../architecture/ADR-001-dual-database-type-strategy.md) - Full rationale
- [Schema Drift Audit](../audits/SCHEMA_DRIFT_AUDIT.md) - Technical analysis
- [DATABASE_WORKFLOW.md](../phase-0/DATABASE_WORKFLOW.md) - Phase 0 setup
- [Supabase CLI Docs](https://supabase.com/docs/guides/cli) - Official reference

---

**Last Updated**: 2025-10-06
**Maintained By**: Development Team
