# Supabase Migration Guide

Detailed reference for creating, testing, and deploying database migrations in PT-2.

## Migration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Migration Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Create Migration        2. Test Locally       3. Review     │
│  ┌─────────────────┐       ┌─────────────────┐   ┌───────────┐  │
│  │ supabase        │──────▶│ supabase db     │──▶│ PR Review │  │
│  │ migration new   │       │ reset           │   │ + CI      │  │
│  │ <name>          │       │                 │   │           │  │
│  └─────────────────┘       └─────────────────┘   └───────────┘  │
│                                                        │         │
│  4. Staging Deploy         5. Production Deploy        │         │
│  ┌─────────────────┐       ┌─────────────────┐        │         │
│  │ supabase db     │◀──────│ Manual approval │◀───────┘         │
│  │ push --linked   │       │ + tag release   │                  │
│  │ (staging)       │       │                 │                  │
│  └─────────────────┘       └─────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Migration Naming Standard

Follow `docs/60-release/MIGRATION_NAMING_STANDARD.md` strictly:

```
YYYYMMDDHHMMSS_descriptive_name.sql
```

### Rules

1. **Generate the timestamp** — always use `date +"%Y%m%d%H%M%S"`, never fabricate
2. **Temporal integrity** — must sort after all existing migrations. No backdating, no future-dating
3. **Descriptive name** — snake_case, under 50 chars, **verb prefix required**:
   - `add_` — new column, index, constraint
   - `create_` — new table, function, trigger
   - `drop_` — remove objects
   - `alter_` — modify existing objects
   - `fix_` — correct a previous migration

**Example:** `20260402143000_add_player_verification.sql`

## Migration Commands

```bash
# Generate timestamp
date +"%Y%m%d%H%M%S"

# Create new migration
supabase migration new add_player_verification

# Apply locally
supabase db reset

# Generate types after LOCAL migration
npm run db:types-local

# Generate types from REMOTE (validation only — do NOT use for local work)
npm run db:types

# Push to remote (staging first!)
supabase db push --linked

# Check migration status
supabase migration list
```

### Type Generation — Critical Distinction

| Command | When to use | Source |
|---------|-------------|--------|
| `npm run db:types-local` | After any local migration or `supabase db reset` | Local Supabase instance |
| `npm run db:types` | Remote validation only, or when local is unavailable | Remote Supabase project |

Using the wrong command will produce stale or incorrect types. After local migrations, **always** use `db:types-local`.

## Safety Rules

1. **NEVER** modify existing migration files after merge
2. **ALWAYS** test migrations locally with `supabase db reset`
3. **INCLUDE** rollback comments in migration files:
   ```sql
   -- Migration: add_player_verification
   -- Rollback: DROP INDEX IF EXISTS idx_player_verification;
   --           ALTER TABLE player DROP COLUMN IF EXISTS verified_at;

   ALTER TABLE player ADD COLUMN verified_at timestamptz;
   CREATE INDEX idx_player_verification ON player(verified_at);
   ```
4. **USE** transactions for multi-statement migrations
5. **REGENERATE** types after every migration (local: `db:types-local`, remote: `db:types`)
6. **NO function overloading** with overlapping DEFAULT signatures — PostgREST cannot disambiguate. Prefer a single function with DEFAULT params over multiple overloads.

## Safe Migration Script

Use the bundled migration wrapper for interactive safety checks:

```bash
scripts/safe-migrate.sh local       # Local reset with confirmation
scripts/safe-migrate.sh staging     # Remote push with dry-run
scripts/safe-migrate.sh production  # Full safety checklist + confirmation
```

The script handles: environment detection, dry-run validation, production safety prompts, and automatic type regeneration.

## RLS Checklist for New Tables

PT-2 uses Row-Level Security extensively. Verify for every migration:

- [ ] New tables have RLS enabled
- [ ] RLS policies include `casino_id` scoping
- [ ] Policies use `(SELECT current_setting('app.casino_id', true)::uuid)` — note the subselect wrapper for InitPlan caching
- [ ] JWT claims integration per ADR-015/ADR-024
- [ ] Functions include `SET search_path = ''` to prevent search-path hijacking
- [ ] Test with both `anon` and `authenticated` roles
- [ ] Run Supabase MCP `get_advisors` (security + performance) after applying migration

## CI Integration

Migrations trigger two additional CI workflows on PR:

1. **security-gates.yml** — runs SQL assertion gates against ephemeral Postgres
2. **migration-lint.yml** — validates RPC self-injection pattern compliance (ADR-015)

Both are path-filtered to `supabase/migrations/**` and run automatically.
