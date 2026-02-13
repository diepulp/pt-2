# Environment Flow

> **ID:** ENV-SPEC-001
> **Status:** Accepted
> **Owner:** DevOps / Lead Architect
> **Created:** 2026-02-13
> **References:** INV-CICD-ENVIRONMENT-FLOW-FINDINGS, CICD-PIPELINE-SPEC, PT-2-INITIAL-CICD-SETUP

---

## 1. Current Architecture (Today)

PT-2 operates with two environments: Local and a single Remote Supabase project. There is no Vercel deployment or staging environment yet.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PT-2 Environment Architecture (Current)            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Developer Machine                        Remote Supabase             │
│  ┌─────────────────────┐                 ┌───────────────────────┐   │
│  │ Local Supabase      │  supabase link  │ vaicxfihdldgepzryhpd  │   │
│  │ ┌─────────────────┐ │ ─────────────▶  │ Region: US East 2     │   │
│  │ │ PostgreSQL 17   │ │                 │ (AWS)                 │   │
│  │ │ Port: 54322     │ │                 │                       │   │
│  │ ├─────────────────┤ │                 │ Pooler:               │   │
│  │ │ API (PostgREST) │ │                 │ aws-1-us-east-2       │   │
│  │ │ Port: 54321     │ │  db:types       │ .pooler.supabase.com  │   │
│  │ ├─────────────────┤ │ ◀─────────────  │ Port: 5432            │   │
│  │ │ Studio          │ │                 │                       │   │
│  │ │ Port: 54323     │ │                 │ Auth: Supabase Auth   │   │
│  │ ├─────────────────┤ │                 │ Storage: Enabled      │   │
│  │ │ Inbucket (mail) │ │                 │ Realtime: Enabled     │   │
│  │ │ Port: 54324     │ │                 └───────────────────────┘   │
│  │ ├─────────────────┤ │                          │                   │
│  │ │ Shadow DB       │ │                          │                   │
│  │ │ Port: 54320     │ │                          │                   │
│  │ └─────────────────┘ │                          │                   │
│  └─────────────────────┘                          │                   │
│           │                                        │                   │
│           ▼                                        ▼                   │
│   supabase db reset                       supabase db push            │
│   (migrations + seed)                     (migrations only, MANUAL)   │
│                                                                       │
│   Next.js Dev Server                      No Vercel deployment        │
│   localhost:3000                           (dev server connects to     │
│   (connects to local OR remote            remote via .env switching)  │
│    via .env configuration)                                            │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Environment Switching

Developers toggle between local and remote via `.env` file:

```bash
# LOCAL MODE (default for development)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-jwt>
SUPABASE_SERVICE_ROLE_KEY=<local-jwt>
ENABLE_DEV_AUTH=true

# REMOTE MODE (for integration testing)
NEXT_PUBLIC_SUPABASE_URL=https://vaicxfihdldgepzryhpd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
# ENABLE_DEV_AUTH must be unset or false for remote
```

---

## 2. Supabase Remote Workflow

### Project Identity

| Property | Value |
|----------|-------|
| **Project ID** | `vaicxfihdldgepzryhpd` |
| **Region** | US East 2 (AWS) |
| **PostgreSQL** | 17 |
| **Connection Pooler** | `aws-1-us-east-2.pooler.supabase.com:5432` (transaction mode) |
| **CLI Version** | v2.75.0 |
| **Supabase CLI (npm)** | `supabase@^2.54.11` |

### Linking

```bash
# One-time setup (already done)
supabase link --project-id vaicxfihdldgepzryhpd
```

State stored in `supabase/.temp/`:
- `project-ref` — linked project ID
- `pooler-url` — connection pooler endpoint
- `postgres-version` — remote PG version
- `cli-latest` — CLI version at last operation

### Migration Deployment

```bash
# Push local migrations to remote
supabase db push

# Pull remote schema (for auditing dashboard edits — avoid this)
supabase db pull
```

**Policy:** All schema changes flow through migrations in `supabase/migrations/`. Dashboard-only edits are prohibited (per PT-2-INITIAL-CICD-SETUP §9).

### Type Generation

```bash
# Generate from LOCAL Supabase (primary — used by all application code)
npm run db:types-local
# Output: types/database.types.ts

# Generate from REMOTE Supabase (validation — for CI/CD drift check)
npm run db:types
# Output: types/remote/database.types.ts
```

**Canonical import:** `@/types/database.types` — all 276+ application files use this path.

### Migration Count

- **177 migration files** as of 2026-02-13
- Naming: `YYYYMMDDHHMMSS_description.sql` (per MIGRATION_NAMING_STANDARD)
- Baseline: `00000000000000_baseline_srm.sql`
- Latest: `20260212210815_fix_seed_rating_edge_for_comp.sql`

### Seed Data

- **File:** `supabase/seed.sql` (1,157 lines)
- **Content:** 2 casinos, 6 players, 6 gaming tables, staff, rating slips, financial transactions, loyalty entries
- **Execution:** Runs after `supabase db reset` (local only; never applied to remote)
- **Additional:** `supabase/seed-timeline-demo.sql` for demo scenarios

---

## 3. Target Architecture (Planned)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PT-2 Target Environment Architecture                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Feature Branch         PR to main              Push to main             │
│  ┌──────────┐         ┌──────────────┐        ┌───────────────────┐     │
│  │ Local    │──Push──▶│ PR Preview   │──Merge─▶│ Staging           │     │
│  │ Supabase │         │ (Vercel)     │         │ (Vercel + Supa)   │     │
│  │ + Dev    │         │              │         │                   │     │
│  │ Server   │         │ CI gates     │         │ Migrations first  │     │
│  └──────────┘         │ only; no     │         │ Then app deploy   │     │
│                       │ deployment   │         │ Then smoke tests  │     │
│                       └──────────────┘         └───────────────────┘     │
│                                                         │                │
│                                                    Tag v*                │
│                                                         │                │
│                                                         ▼                │
│                                                ┌───────────────────┐    │
│                                                │ Production        │    │
│                                                │ (Vercel + Supa)   │    │
│                                                │                   │    │
│                                                │ Promote known-    │    │
│                                                │ good SHA from     │    │
│                                                │ staging           │    │
│                                                └───────────────────┘    │
│                                                                          │
│  Supabase Projects:                                                      │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐        │
│  │ Local        │   │ pt-2-staging     │   │ pt-2-prod        │        │
│  │ (Docker)     │   │ (hosted)         │   │ (hosted)         │        │
│  │ PG 17        │   │ PG 17            │   │ PG 17            │        │
│  │ + seed data  │   │ + RLS enforced   │   │ + RLS enforced   │        │
│  │ + dev auth   │   │ + real auth      │   │ + real auth      │        │
│  └──────────────┘   └──────────────────┘   └──────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Environment Comparison (Target)

| Property | Local | Staging | Production |
|----------|-------|---------|------------|
| **Supabase Project** | Docker (local) | `pt-2-staging` (hosted) | `pt-2-prod` (hosted) |
| **Vercel Project** | N/A (dev server) | `pt-2-staging` | `pt-2` |
| **Domain** | `localhost:3000` | `staging.pt2.app` | `pt2.app` |
| **Deploy Trigger** | Manual | Push to `main` | Tag `v*` |
| **Auth** | Dev bypass available | Real Supabase Auth | Real Supabase Auth |
| **RLS** | Enforced | Enforced | Enforced |
| **Seed Data** | Yes (seed.sql) | No (migrated schema only) | No |
| **Connection Pooling** | Disabled | Transaction mode | Transaction mode |
| **ENABLE_DEV_AUTH** | `true` (optional) | Not set | Not set |

---

## 4. Environment Variables

### Required Per Environment

| Variable | Local | Staging | Production | Scope |
|----------|-------|---------|------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | staging URL | prod URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local JWT | staging key | prod key | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | local JWT | staging service key | prod service key | Server-only |
| `ENABLE_DEV_AUTH` | `true` (optional) | **Must not be set** | **Must not be set** | Server-only |
| `NODE_ENV` | `development` | `production` | `production` | Build-time |

### Feature Flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_USE_MODAL_BFF_RPC` | `false` | PRD-018 modal BFF (69% latency reduction) |
| `NEXT_PUBLIC_ENABLE_SKIP_SETUP` | `false` | Skip onboarding wizard (dev only) |
| `ANALYZE` | `false` | Bundle analysis (`ANALYZE=true npm run build`) |

### Dev Auth Bypass Security (ADR-030/D3)

The dev auth bypass is **dual-gated**:
1. `NODE_ENV` must be `development`
2. `ENABLE_DEV_AUTH` must be exactly `true`

If either condition fails, bypass throws an error. In staging/production, `NODE_ENV=production` prevents bypass regardless of `ENABLE_DEV_AUTH` value.

**CI Enforcement:** Lint fails if `skipAuth` appears in production code paths. Deployment workflows must verify `ENABLE_DEV_AUTH` is absent from the environment.

---

## 5. Migration Flow (Current → Target)

### Current: Manual Push

```
Developer → supabase db push → Remote project
                                (no verification)
```

### Target: Automated via CD

```
PR merged to main
  → deploy-staging.yml triggers
    → Step 1: supabase db push --project-ref <staging-ref>
      (applies only NEW migrations; Supabase tracks applied set)
    → Step 2: Verify migration success
    → Step 3: Deploy Vercel staging
    → Step 4: Run smoke tests against staging
```

### Migration Safety Rules

1. **Forward-only:** Migrations are append-only. Never edit a deployed migration.
2. **Naming:** `YYYYMMDDHHMMSS_description.sql` (validated by pre-commit + CI)
3. **Idempotent RPCs:** Use `CREATE OR REPLACE FUNCTION` for RPC updates
4. **RLS Self-Injection:** All new RPCs must call `set_rls_context_from_staff()` (ADR-015)
5. **No Dashboard Edits:** All schema changes via migration files in `supabase/migrations/`
6. **Rollback Strategy:** Forward-fix (new migration to revert). Supabase does not support migration rollback natively.

---

## 6. Connection Pooling

### Local Development

- **Mode:** Direct connection (no pooler)
- **Port:** 54322 (PostgreSQL direct)
- **Config:** `supabase/config.toml` → `[db.pooler] enabled = false`

### Remote / Staging / Production

- **Mode:** Transaction pooling via Supavisor
- **Endpoint:** `aws-1-us-east-2.pooler.supabase.com:5432`
- **Implication:** `SET LOCAL` context is transaction-scoped only
- **Pattern:** All RPCs use self-injection (`PERFORM set_rls_context(...)`) within the same transaction as business logic (ADR-015)

---

## 7. Supabase Branching (Available, Not Active)

Supabase branching infrastructure is configured but not actively used:

- `.branches/_current_branch` exists (value: `main`)
- `supabase branches create <name>` is available
- Each branch gets a separate project_ref with migrations applied

**When to use:** Consider for feature branches that require schema changes, to avoid polluting the shared remote. Not required for Phase 1.

---

## 8. Deployment Checklist

### Phase 1B: Create Staging (Manual Steps)

- [ ] Create Supabase project `pt-2-staging` via dashboard
- [ ] Note staging project URL and keys
- [ ] Create Vercel project, link to repo
- [ ] Configure Vercel env vars (staging Supabase URL/keys)
- [ ] Add `vercel.json` to project root
- [ ] Add security headers to `next.config.ts`
- [ ] Verify staging build succeeds
- [ ] Verify staging connects to staging Supabase

### Phase 1C: CD Pipeline (Workflow Setup)

- [ ] Create `deploy-staging.yml` (push to `main` → migrate → deploy → smoke)
- [ ] Add `SUPABASE_ACCESS_TOKEN` to GitHub Actions secrets
- [ ] Add staging project ref to workflow
- [ ] Create `scripts/verify-deploy.sh` for post-deploy checks
- [ ] Verify end-to-end: merge PR → staging auto-deploys → smoke passes

### Phase 2: Production (Promotion Model)

- [ ] Create Supabase project `pt-2-prod`
- [ ] Create Vercel production project
- [ ] Create `deploy-production.yml` (tag `v*` → migrate → deploy → health → release)
- [ ] Document rollback runbook
- [ ] First production deployment with manual verification
