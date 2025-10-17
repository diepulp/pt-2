ADR Dual Database Remote Accepted 2025-10-06 Development Team Drift Audit

Context Problem Phase 0-1 migrations remote Supabase database discrepancy local remote type files local production Supabase remote types include metadata GraphQL schema local core table definitions identical sync single dual files?

Decision Drivers Fast local iteration remote dependency layer types Validate schema separation local remote deployment Multiple developers database states

Options Single Type File Replace remote B Dual Type Files Local Remote separate local remote validation C Dynamic Type Switching variables switch local

Decision Outcome B Dual Type separate type files local remote databases strategy File Structure LOCAL testing remote REMOTE (validation production verification Usage Pattern Services hooks components LOCAL types Production validation scripts REMOTE types

Rationale Development Workflow Local Development Iteration remote dependency Write migration locally Apply DB supabase Generate types Implement service layer types Run tests local DB Commit ready No network latency remote quota usage full control Remote Deployment Workflow production Migrations tested locally Apply remote supabase Generate types Validate changes Deploy Verify production local experimentation production deployment Migration Testing Safety Disposable resettable experimental reset Experiment Rollback bad Production data careful changes validation Verify changes NO db reset production data preservation Type Generation Differences Local Type Generation db supabase schema tables enums views functions No metadata No `graphql_public schema Local Supabase minimal services no GraphQL endpointRemote Type Generation/remote/database.types.ts npm run db:types:remote supabase gen types/database.types.ts schema tables enums views functions `\_\_InternalSupabase metadata `graphql_public schema GraphQL Remote Supabase runs production services GraphQL API

Schema Consistency Validation files share core schemas** Component Local Remote Impact on Code Tables (40) Identical **Zero impact** Enums (15) Views (4) Functions (50+) Identical **Zero GraphQL Missing **No impact** used in MVP Metadata used Service layer code with files database operations use `public schema identical

Remote Local DBs Use Local Database New service implementation TDD **Migration new migrations table structures **Breaking destructive migrations \*\*Integration without remote quota reset clean slate Database destroyed rebuilt No impact team production No network latency instant query responses No API quotas connection limits reset Remote Database Final migration application Shared schema state Pre-production latency connection pooling JWT claims auth state production schema Database Contains real data reset Changes affect team production users API quotas connection limits rate Logs metrics alerts schema changes Migrations forward-only no rollback

Migration Workflow Local → Remote Step Local Development Create migration add_player_rating_cache Write SQL migration_player_rating_cache Apply supabase db Generate local types Implement service layer new types RatingCache types Run tests Commit add supabase/migrations types/database.types player rating cache table Step Remote Validation Check diff Apply migration modifies production database Generate remote types Compare type files differences changes Review impact queries Plan deployment strategy Update services Commit remote types.types remote types post-migration Step 3: Deployment Deploy application Verify remote types type errors queries execute RLS policies Monitor issues Check Supabase logs no broken queries Validate data integrity

Sync Scenarios Local Remote new migration_rating_cache Remote Include player_rating_cache Missing_rating_cache Normal development Continue development apply migration remote Remote Local Local production migration Remote new migration new table Include new table Developer out of sync Pull migrations reset local 3: Divergent State Local experimental migration Remote different migration Include X Y Resolve migration conflict regenerate types 4: Perfect Sync Local Same migrations Match remote GraphQL local Ideal proceed development

CI/CD Integration Type Drift Detection.github/workflows/schema-validation Validation validate-types ubuntu-latest steps Check local type changes git diff-only grep types/database.types Local types changed (migration detected Validate migration types changed corresponding migration/migrations Types changed without migration Check remote sync status db:types:remote Remote types out of sync migration deployed Pre-commit Check migration files changed Migration detected regenerating local db/database.types.ts update remote types after deploying migration db:types:remote

NPM Scripts `package.json "scripts:types types typescript --local types/database:types:remote types --linked types/remote/database:diff diff --linked",:push:pull pull:validate run db:types db:types:remote echo Types regenerated

Team Workflow Guidelines Feature Developers Pull migrations Reset DB Verify types Develop feature local types tests Commit migration types Use local database development Regenerate types changes Apply migrations remote review Use remote types service layer imports DevOps/Migration Deployer Review migrations Test migrations Check diff Apply Regenerate types Commit types Deploy Notify schema change check diff pushing Update types after deployment Push migrations testing Skip remote type regeneration

Benefits Advantages Local No remote dependency Local DB disposable encourages ideas Local = development Remote production validation without internet Supabase block schema changes Validate migrations before remote deployment Safety type files share core schemas Trade-offs pull migrations reset local Local remote diverge Two type files sync database validate local remote type generation

Consequences Positive No remote round-trips schema reset local DB Test destructive migrations No blocking remote database Negative discipline workflow guidelines scripts dual files New developers understand dual strategy Neutral ADR New developers workflow training CI checks sync issues

Compliance PRD Section 3.2 Type System.types Supabase schema check layer production schema migration source consistency Service layer local remote validation Section 3.10 Testing CI/CD Requirement Supabase migration validation type-regeneration check validates local warns remote Deployment pipeline regenerates types post-migration Automated validation prevents drift

Monitoring Quarterly Review Remote drift 5% Migration failures mismatches velocity sync overhead Success Zero production incidents mismatches <5 min >80% dual type workflow drift merge

References Drift Audit Report Local Development Docs [DATABASE_WORKFLOW.md_BLUEPRINT_MVP_PRD.md Section 3.2 Accepted 2025-10-27 Phase 2) Development Team
