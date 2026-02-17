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

## Migration Commands

```bash
# Create new migration
supabase migration new add_player_verification

# Apply locally
supabase db reset

# Generate types after migration
npm run db:types

# Push to remote (staging first!)
supabase db push --linked

# Check migration status
supabase migration list
```

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
5. **REGENERATE** types after every migration: `npm run db:types`

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
- [ ] JWT claims integration per ADR-015
- [ ] Test with both `anon` and `authenticated` roles

## Migration Naming Standard

Follow `docs/60-release/MIGRATION_NAMING_STANDARD.md`:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260211020000_add_player_verification.sql`
