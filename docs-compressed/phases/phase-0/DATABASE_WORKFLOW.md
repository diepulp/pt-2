Development

TL Use Local DB Development safe automated Apply remote

Daily Development Workflow Start Working Git Reset local DB migrations supabase Generate types local Start dev server Create New Feature Write test migration change Create supabase/migrations/YYYYMMDDHHMMSS_name.sql Apply migration locally Regenerate types Test passes Commit git new feature migration Daily Reset Slate fresh DB supabase reset

Deployment Workflow Feature Ready Production A Manual No CLI Remote Apply migration Supabase Dashboard Copy migration Regenerate types remote db Commit updated types remote Deploy app push B Automated CLI Remote Push migration remote Regenerate types Deploy git push

Type Generation Strategy Development Fast iteration matches local schema types Deployment types match production regenerate remote before deploying

Local DB Development Benefits Migrations seconds minutes Local reset 2-5 seconds Remote Dashboard copy 2-5 minutes Break without fear Instant rollback Work without internet Automated migration testing reset dev own sandbox Remote-Only Drawbacks Manual dashboard Shared DB no quick rollback automate migration tests Team conflicts shared DB

Migration File Workflow Creating Migrations Create migration file supabase/migrations_feature.sql Write SQL TABLE player ADD COLUMN tier TEXT Apply locally Test Commit git add player column PR merges main Apply migration Dashboard run db:types commit types Deploy

Current State Alignment Local DB RLS core tables JWT Compliance policies Audit infrastructure Remote DB Migrations Phase 1 migrations keep remote without RLS Types Decision local types development remote types local dev remote before deploy

Recommended Steps Phase 2 Development Commit state types Generate local DB types.types.ts commit 0 CI/CD testing security DB Develop Daily workflow db reset test Apply remote apply remote Dashboard SQL Editor Run migrations db:types Regenerate remote types/database.types.ts

Team Workflow New Member Setup git clone repo install supabase start db reset Apply migrations types types run dev Updates pull db reset Re-apply migrations

Skip Remote Use Local Phase 2 Faster TDD iteration No remote coordination apply feature-complete local Development 2) local DB Generate types Commit migrations Deployment Apply migrations Regenerate types Deploy Decision Remote Migration Timing Apply Phase 1 Remote DB secured Types match production work Apply 1 Start 2 Use local fast iteration DB unsecured

Recommendation Phase 2 Use local DB Generate types Fast TDD iteration Apply remote Production real users Apply Phase 1 migrations Apply later

Quick Commands Local DB supabase reset migrations Generate types Remote DB:types Manual migration Dashboard SQL Editor Development local Supabase test local DB CI/CD reset CI migrations tests local
