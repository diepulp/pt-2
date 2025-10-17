Database Type Management Workflow local remote PT-2-001 Dual Database Type Strategy

TL;DR Use local database types/database.ts Apply remote regenerate types/database.types.ts import/types/database.types

Quick Commands Local Development Regenerate types Reset DB migrations Remote Validation Regenerate remote types Check diff Deployment Apply migrations remote Update types post-deployment

Daily Development Workflow Start Sync Team Pull latest code migrations Reset local DB migrations Verify types current db:types Ready develop New Migration Create migration file add_player_preferences Edit migration SQL/20251006120000_add_player_preferences Apply local database Regenerate local types db:types Implement feature new types/player/preferences types Test locally Commit migration types add_add_player_preferences.sql types/database.types player preferences table Types Service Layer Import local types Database/types/database createClient export createPlayerService local types getById TypeScript tables local types supabase return data import remote types service layer Database/types/remote/database

Deployment Workflow Validate Locally migrations locally Check remote Output shows SQL remote Review breaking changes Deployment Apply Remote Apply migrations remote database modifies production database Regenerate remote types Verify remote types new tables/columns Commit remote types types Deploy application Post-Deployment Validation Check Supabase logs migration errors Verify application new schema No type errors queries execute RLS policies Notify team "Migration X deployed reset local DB

Scenarios Local DB Out Sync TypeScript errors missing tables Service tests "Table X errors Solution git pull migrations supabase db reset Rebuild DB Regenerate types Verify Remote DB Out Sync Production errors missing columns Remote type file match Deployment failures supabase db diff Check missing Apply migrations Update remote types Type Import Errors find import Check tsconfig.json paths Regenerate types relative path import Migration Rollback Cannot rollback migrations new migration changes rollback_player_preferences DROP TABLE player_preferences Apply rollback supabase db reset Local supabase db push

Type File Differences Explained Local Types/database.types.ts export type Json /_ ... interface Database public Tables player tables Views MTL Functions RPC Enums enums Missing affect \_\_InternalSupabase metadata_public schema Remote Types/remote/database.types.ts export type Json_ ... interface Database public Tables IDENTICAL local Views Functions IDENTICAL Enums IDENTICAL local Additional \_\_InternalSupabase PostgrestVersion "13.0.4"\_public Functions endpoint types Both files schema definitions service code works both

CI/CD Integration GitHub Actions Validation/workflows/schema-validation Schema Validation pull_request 'supabase/migrations validate-types-latest steps actions/checkout@v3 Setup Supabase CLI/setup-cli@v1 Start Supabase Validate local types migrations npm run db:types Local types sync migrations types out of sync Pre-commit MIGRATIONS_CHANGED Migration detected regenerating local db:types types/database.types.ts Local types updated deploying migration db:types:remote add types/remote/database.types.ts

NPM Scripts Reference `package.json "scripts:types types typescript --local types/database.types:types:remote types --linked types/remote/database:diff diff:push:pull:reset:validate "npm run db:types db:types:remote echo types regenerated

Types updating after migration Check migration applied regenerate types run db:types change git diff types Local DB start Stop Supabase services Clean Docker volumes Restart Remote types differences Check remote DB changes not applied manual changes Extract migration db diff_changes.sql

Best Practices Regenerate types Test before Commit types Reset DB Use:diff before:push Document migrations Import remote types Skip testing Apply migrations remote DB Keep local DB Ignore type generation warnings Commit remote types without deploying

Reference Card Task Command local run db:types migration start day remote remote deployment local `supabase db reset Daily sync migrations remote db diff --linked Before deployment db push --linked local validation migration <name Feature development migration list Check migration status

Related Documentation-001 Dual Database Type Strategy rationale Drift Audit Technical analysis_WORKFLOW.md setup CLI Docs Official reference 2025-10-06 Development Team
