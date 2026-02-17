# INV-CICD: Environment Flow Investigation — Lead Architect Findings

> **Type:** Pre-Initial CI/CD Planning Investigation
> **Date:** 2026-02-13
> **Status:** FINDINGS COMPLETE — Awaiting Pipeline Design Phase
> **Scope:** Compare documented environment flow (deployment-guide.md) against reality; assess CI/CD readiness per PT-2-INITIAL-CICD-SETUP.md
> **Branch:** dev-onboarding-wizard (investigation context)

---

## Executive Summary

The deployment guide (`deployment-guide.md`) describes an **aspirational 4-environment flow** (Local → Preview → Staging → Production) that does not exist today. PT-2 currently operates in a **2-environment reality** (Local Supabase + single Remote project) with no Vercel deployment, no staging environment, and no CD pipeline. However, the **CI foundation is surprisingly mature** — 3 GitHub Actions workflows, 7 blocking pre-commit hooks, and 40+ governance scripts already enforce security invariants that most projects add retroactively. The Supabase remote flow is the critical missing piece that the deployment guide completely omits.

### Key Finding

**The gap is not CI — it's CD.** PT-2 has strong validation gates but zero deployment automation. The path forward is to wire the existing CI spine into a real deployment pipeline, not rebuild from scratch.

---

## 1. Documented vs Reality: Environment Flow

### What the Deployment Guide Claims

```
Feature Branch → PR Preview (Vercel) → Staging (Vercel+Supabase) → Production (Vercel+Supabase)
```

### What Actually Exists

```
Feature Branch → PR CI Gates (GitHub Actions) → main (no deployment) → Remote Supabase (manual)
```

| Component | Documented | Reality | Gap Severity |
|-----------|-----------|---------|-------------|
| **Local Supabase** | Docker-based local stack | Fully configured (PG17, port 54321, Studio 54323, seed.sql) | None — works as documented |
| **PR Preview (Vercel)** | Automatic for all PRs | Does not exist. No Vercel project linked. | HIGH |
| **Staging Vercel** | `staging.pt2.app` deployed from `main` | Does not exist. No Vercel project. | HIGH |
| **Staging Supabase** | Separate `pt-2-staging` project | Does not exist. Single remote project only. | HIGH |
| **Production Vercel** | `pt2.app` triggered by `v*` tags | Does not exist. No Vercel project. | DEFERRED (per plan) |
| **Production Supabase** | Separate prod project | Single project serves as de facto "production" | MEDIUM |
| **`vercel.json`** | Root-level config | Template only in `.claude/skills/devops-pt2/assets/` | MEDIUM |
| **Deploy workflows** | `deploy-staging.yml`, `deploy-production.yml` | Do not exist. Only CI validation workflows. | HIGH |
| **`verify-deploy.sh`** | Post-deployment health checks | Does not exist in `scripts/` | MEDIUM |
| **Security headers** | Configured in `next.config.ts` | Not present. `next.config.ts` only has React compiler + image optimization. | MEDIUM |

### What the Deployment Guide Completely Omits

1. **Supabase Remote Project Flow** — The guide never mentions:
   - Project ID `vaicxfihdldgepzryhpd` (US East 2, AWS)
   - `supabase link` workflow
   - `db:types` remote generation (`--project-id vaicxfihdldgepzryhpd`)
   - `supabase db push` for migration deployment
   - Connection pooler at `aws-1-us-east-2.pooler.supabase.com:5432`
   - `.supabase/.temp/` state files (project-ref, pooler-url, cli-latest)

2. **Migration Deployment Lifecycle** — No documentation on:
   - How migrations flow from local → remote
   - `supabase db push` vs `supabase db reset` semantics
   - Shadow database (port 54320) for diff operations
   - 177 existing migrations that must apply cleanly in CI

3. **Type Generation as Pipeline Gate** — The guide omits:
   - `npm run db:types` generates from remote (canonical)
   - `npm run db:types-local` generates from local (dev)
   - 4,723-line generated `types/remote/database.types.ts`
   - Type drift detection is a CI requirement (per INITIAL-CICD-SETUP.md §3.3)

4. **RLS Context Injection Testing** — No mention of:
   - `set_rls_context_from_staff()` as authoritative context (ADR-024)
   - Category A vs Category B table write-path enforcement (ADR-030/D4)
   - Cross-casino denial tests as smoke test targets

---

## 2. Current CI Infrastructure (What Works)

### GitHub Actions Workflows (3 active)

| Workflow | Trigger | Gates | Status |
|----------|---------|-------|--------|
| `ci.yml` | PR to `main` | Lint → Type-check → RLS write-path lint → Test | FUNCTIONING |
| `migration-lint.yml` | PR with `supabase/migrations/**/*.sql` changes | RPC self-injection pattern (ADR-015) | FUNCTIONING |
| `check-srm-links.yml` | Push/PR with `docs/**/*.md` changes | SRM documentation link verification | FUNCTIONING |

### Pre-Commit Hooks (7 blocking checks via Husky)

| # | Hook | What It Enforces | Reference |
|---|------|------------------|-----------|
| 1 | Migration Safety | Prevents `sync_remote_changes.sql`; validates RLS hybrid pattern | ADR-015 |
| 2 | RPC Self-Injection | `PERFORM set_rls_context(...)` required in all RPCs | ADR-015 Phase 1A |
| 3 | API Route Sanity | Route handler structure validation | Service patterns |
| 4 | Service Layer Anti-Pattern | No `ReturnType<typeof>`, Pattern B/C DTO compliance | SLAD §1224-1226 |
| 5 | Zustand State Mgmt | PRD-013 state management patterns | PRD-013 |
| 6 | RLS Write-Path | Category A direct DML detection (ADR-034) | ADR-030/D4 |
| 7 | Lint-Staged | ESLint + Prettier on production code only | Code quality |

### Package Scripts (50 total, key CI-relevant)

```
npm run lint           # ESLint (includes RLS write-path in CI mode)
npm run type-check     # TypeScript strict
npm run test           # Jest unit tests
npm run test:ci        # Jest --ci --coverage --maxWorkers=2
npm run db:types       # Remote type generation (project-id: vaicxfihdldgepzryhpd)
npm run db:types-local # Local type generation
npm run e2e:playwright # Playwright E2E tests
npm run build          # Next.js production build
```

### Governance Scripts (40+ in `scripts/`)

Key scripts that a CI pipeline should invoke:
- `scripts/lint-rls-write-path.sh` — Category A table detection (already in `ci.yml`)
- `scripts/lint-rls-category-b-policies.sh` — Category B policy validation
- `scripts/adr015-rls-scanner.sh` — Comprehensive RLS compliance (30KB)
- `scripts/validate-migration-names.sh` — Migration naming compliance
- `scripts/pre-commit-migration-safety.sh` — Migration regression prevention
- `scripts/pre-commit-rpc-lint.sh` — RPC self-injection validation

---

## 3. Supabase Remote Flow (Undocumented)

### Current Single-Project Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                PT-2 Supabase — Today (Single Remote)          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Developer Machine                  Remote Supabase           │
│  ┌──────────────┐                  ┌──────────────────────┐  │
│  │ Local PG17   │  supabase link   │ vaicxfihdldgepzryhpd │  │
│  │ Port 54321   │ ───────────────▶ │ US East 2 (AWS)      │  │
│  │ + Studio     │                  │                      │  │
│  │ + Inbucket   │  db:types        │ Connection Pooler:   │  │
│  │ + Shadow DB  │ ◀─────────────── │ aws-1-us-east-2      │  │
│  └──────────────┘                  │ .pooler.supabase.com │  │
│                                    └──────────────────────┘  │
│        │                                    │                 │
│        ▼                                    ▼                 │
│  supabase db reset         supabase db push (MANUAL)          │
│  (local: migrations+seed)  (remote: migrations only)          │
│                                                               │
│  npm run db:types-local    npm run db:types                   │
│  (types/database.types.ts) (types/remote/database.types.ts)  │
│                            ← CANONICAL SOURCE OF TRUTH        │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Critical State Files (`.supabase/.temp/`)

| File | Content | Purpose |
|------|---------|---------|
| `project-ref` | `vaicxfihdldgepzryhpd` | Linked remote project |
| `pooler-url` | `postgresql://postgres.vaicxfihdldgepzryhpd@aws-1-us-east-2.pooler.supabase.com:5432/postgres` | Connection pooling endpoint |
| `postgres-version` | `17.4.1.074` | Remote PG version |
| `cli-latest` | `v2.75.0` | Supabase CLI version |
| `.branches/_current_branch` | `main` | Active Supabase branch |

### Migration Deployment (Today: Manual)

```bash
# Current manual workflow (not in any script or CI)
supabase db push                    # Push migrations to remote
npm run db:types                    # Regenerate types from remote schema
# Developer manually verifies remote state
```

**Risk:** No automation, no verification, no rollback path. A failed migration on the remote project requires manual SQL intervention.

### Environment Variables (Runtime)

| Variable | Local | Remote | Purpose |
|----------|-------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://vaicxfihdldgepzryhpd.supabase.co` | API endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local JWT | `sb_publishable_...` | Public auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Local JWT | `sb_secret_...` | Server-only RLS bypass |
| `DATABASE_URL` | `postgresql://localhost:54322/postgres` | Pooler URL (PgBouncer) | Direct DB (pooled) |
| `DIRECT_URL` | Same | Direct pooler URL | Prisma-style direct |
| `ENABLE_DEV_AUTH` | `true` | Must be `false`/unset | Dev bypass gate |

---

## 4. Security Invariants That Constrain CI/CD Design

Five hard security invariants from ADR-015/020/024/030 that the pipeline **must** enforce:

### INV-1: Authoritative Context (ADR-024, D1)

`set_rls_context_from_staff()` is the **only** valid context source. App layer must use RPC return value — no independent staff lookup.

**CI gate:** Test that `ctx.rlsContext` is populated exclusively from RPC return.

### INV-2: Write-Path Fail-Closed (ADR-030, D4)

Category A tables (`staff`, `staff_pin_attempts`, `staff_invite`, `player_casino`) reject mutations without session vars. Pattern:
```sql
-- Category A (D4): Session-var ONLY, no JWT fallback
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```

**CI gate:** `scripts/lint-rls-write-path.sh` (already in `ci.yml`)

### INV-3: Bypass Jailing (ADR-030, D3)

Dev auth bypass requires **both** `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true`. `skipAuth` restricted to test paths only.

**CI gate:** Lint fails if `skipAuth` appears in production files.

### INV-4: No Spoofable RPC Inputs (ADR-024, INV-8)

Client RPCs must not accept `casino_id`, `actor_id`, or `staff_role` as parameters.

**CI gate:** Migration lint (partially covered by `migration-lint.yml`)

### INV-5: RPC Self-Injection (ADR-015)

All SECURITY DEFINER RPCs must call `set_rls_context_from_staff()` as first operation.

**CI gate:** `migration-lint.yml` (FUNCTIONING)

---

## 5. Gap Analysis: INITIAL-CICD-SETUP.md Recommendations vs Reality

Mapping the 10 recommendations from `PT-2-INITIAL-CICD-SETUP.md` to current state:

| # | Recommendation | Status | Notes |
|---|---------------|--------|-------|
| §1 | Create `pt-2-staging` Supabase project | NOT DONE | Single remote project only |
| §2 | Protect `main` branch | PARTIAL | CI gates exist; branch protection rules likely in GitHub UI (not in repo) |
| §3.1 | Build integrity gate (lint/format/typecheck/test/build) | 80% DONE | All present in `ci.yml` EXCEPT `next build` — build step not in CI |
| §3.2 | Migration sanity (ephemeral DB) | NOT DONE | `migration-lint.yml` checks patterns but doesn't apply migrations to ephemeral DB |
| §3.3 | Typegen drift check | NOT DONE | `db:types` exists but no CI drift detection (regenerate + diff) |
| §3.4 | SRM ↔ schema drift gate | PARTIAL (Phase 2) | `check-srm-links.yml` verifies doc links but not schema-SRM alignment |
| §3.5 | RLS smoke assertions | NOT DONE in CI | Tests exist locally but not in CI pipeline |
| §4 | Vercel staging project wiring | NOT DONE | No Vercel project exists |
| §5A | PR Validation workflow (`pr.yml`) | 80% DONE | `ci.yml` covers most gates; missing build + migration sanity + typegen drift |
| §5B | Main → Staging Deploy (`deploy-staging.yml`) | NOT DONE | No deployment workflow exists |
| §6 | Phase 1 deliverables | ~40% DONE | CI validation partial; CD zero |
| §7 | Phase 2 upgrades | DEFERRED | SRM drift, expanded RLS tests |
| §8 | Production promotion model | DEFERRED | Expected |
| §9 | Guardrails (no dashboard edits, no service-role in frontend) | ENFORCED | Pre-commit hooks + ADR-030 enforcement |
| §10 | Minimal checklist | ~20% DONE | Only CI workflows exist; no staging env, no Vercel, no deploy workflows |

---

## 6. What Needs to Be Built (Prioritized)

### Phase 1A: Complete CI Gates (Close existing gaps)

These are low-effort, high-value additions to the existing `ci.yml`:

| Gate | Effort | Value | Implementation |
|------|--------|-------|----------------|
| **Next.js build** | 5 min | HIGH | Add `npm run build` step to `ci.yml` |
| **Typegen drift check** | 30 min | HIGH | In CI: `npm run db:types-local` → `git diff --exit-code types/` |
| **Migration naming validation** | 15 min | MEDIUM | Add `scripts/validate-migration-names.sh` to `ci.yml` |
| **Migration apply (ephemeral)** | 2 hr | HIGH | Spin up Supabase local in CI, apply all 177 migrations, verify clean |

### Phase 1B: Staging Environment (Foundation for CD)

| Component | Effort | Dependency | Implementation |
|-----------|--------|------------|----------------|
| **Create Supabase staging project** | 30 min | None | `pt-2-staging` via Supabase dashboard |
| **Create Vercel project** | 30 min | None | Link to repo, configure env vars |
| **Activate `vercel.json`** | 15 min | Vercel project | Move template from `.claude/skills/` to root |
| **Add security headers** | 30 min | Vercel project | Add to `next.config.ts` (from deployment-guide template) |
| **Wire env vars** | 30 min | Both projects | Staging Supabase URL/keys in Vercel |

### Phase 1C: Deploy Pipeline (The Missing CD)

| Workflow | Trigger | Jobs | Effort |
|----------|---------|------|--------|
| **`deploy-staging.yml`** | Push to `main` | Apply migrations → Deploy to Vercel → Smoke test | 4 hr |
| **Post-deploy smoke tests** | After deploy | RLS context works, cross-casino denied, critical RPCs exist | 2 hr |

### Phase 2: Production Readiness

| Component | Trigger | Effort |
|-----------|---------|--------|
| **`deploy-production.yml`** | Tag `v*` | 3 hr |
| **`verify-deploy.sh`** | Post-deploy | 2 hr |
| **Rollback runbook** | Failed deploy | 2 hr (documentation) |
| **SRM ↔ schema drift** | PR validation | 4 hr |
| **Expanded RLS integration tests** | PR validation | 4 hr |

---

## 7. Recommended CI/CD Architecture (PT-2 Customized)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PT-2 Target CI/CD Architecture                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Feature Branch         PR to main              Push to main             │
│  ┌──────────┐         ┌──────────────┐        ┌───────────────────┐     │
│  │ develop/ │──Push──▶│ ci.yml       │──Merge─▶│ deploy-staging   │     │
│  │ feature/ │         │              │         │                   │     │
│  └──────────┘         │ 1. Lint      │         │ 1. Apply migrations│    │
│       │               │ 2. Type-check│         │    (supabase db   │    │
│       │               │ 3. RLS lint  │         │     push --staging)│    │
│       ▼               │ 4. Tests     │         │ 2. Deploy Vercel  │    │
│  Pre-commit           │ 5. Build     │         │    (staging)      │    │
│  (7 hooks)            │ 6. Migration │         │ 3. Smoke tests    │    │
│                       │    sanity    │         │    - RLS context  │    │
│                       │ 7. Typegen   │         │    - Cross-casino │    │
│                       │    drift     │         │    - Critical RPCs│    │
│                       │ 8. Migration │         └───────────────────┘    │
│                       │    lint      │                  │                │
│                       └──────────────┘                  │                │
│                                                         ▼                │
│                                                  Tag v*                  │
│                                              ┌───────────────────┐      │
│                                              │ deploy-production  │      │
│                                              │                   │      │
│                                              │ 1. Validate semver│      │
│                                              │ 2. CI checks pass │      │
│                                              │ 3. Apply migrations│     │
│                                              │ 4. Deploy Vercel  │      │
│                                              │ 5. Health checks  │      │
│                                              │ 6. GitHub Release │      │
│                                              └───────────────────┘      │
│                                                                          │
│  Supabase Projects:                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ Local    │    │ pt-2-staging │    │ pt-2-prod    │                   │
│  │ (docker) │    │ (hosted)     │    │ (hosted)     │                   │
│  │ PG17     │    │ PG17         │    │ PG17         │                   │
│  └──────────┘    └──────────────┘    └──────────────┘                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### PT-2–Specific Pipeline Customizations

Unlike a generic Next.js CI/CD pipeline, PT-2 requires:

1. **RLS Security Gates** — No other Next.js project has 3 separate RLS linting steps in CI. These are non-negotiable per ADR-015/024/030.

2. **Migration-First Deployment** — Supabase migrations must apply BEFORE Vercel deployment. The app expects the schema to exist. Failed migration = blocked deploy.

3. **Type Generation as Contract Gate** — `types/remote/database.types.ts` is the source of truth for the entire service layer. Drift between schema and types breaks builds.

4. **Ephemeral DB for Migration Sanity** — With 177 migrations, "works locally" is insufficient. CI must spin up Supabase local and apply all migrations from scratch.

5. **Cross-Casino Smoke Tests** — Post-deploy must verify multi-tenancy isolation. This is a casino compliance requirement, not a nice-to-have.

6. **Dev Auth Bypass Must Be Absent** — Production/staging deployments must verify `ENABLE_DEV_AUTH` is NOT set. The dual-gate protects against accidental bypass in production.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails on staging (schema drift from manual remote edits) | MEDIUM | HIGH | Force all schema changes through migrations; `supabase db pull` audit |
| Type drift undetected (schema changes without `db:types`) | HIGH today | MEDIUM | Typegen drift CI gate (Phase 1A) |
| Dev auth bypass leaks to production | LOW (dual-gated) | CRITICAL | CI lint for `ENABLE_DEV_AUTH`; startup assertion in production |
| 177 migrations slow down CI | MEDIUM | LOW | Cache Supabase local Docker image; consider migration squashing |
| Single Supabase project serves as both dev and "prod" | HIGH today | HIGH | Create staging project immediately (Phase 1B) |
| No rollback path for failed deploys | HIGH (no CD exists) | HIGH | Vercel instant rollback + forward-fix migration strategy |

---

## 9. Immediate Next Steps

1. **Create Investigation Issue** for tracking: `ISSUE-CICD-001: Implement Phase 1A CI gates`
2. **Phase 1A PR**: Add build step, typegen drift check, migration naming validation to `ci.yml`
3. **Create Supabase staging project** (`pt-2-staging`) — manual, 30 min
4. **Create Vercel project** — manual, 30 min, link to repo
5. **Phase 1B PR**: `vercel.json` at root, security headers in `next.config.ts`, env var wiring
6. **Phase 1C PR**: `deploy-staging.yml` workflow, post-deploy smoke tests
7. **Update deployment-guide.md** to reflect reality + Supabase remote flow

---

## Appendix A: File Inventory

### Active CI/CD Artifacts
| File | Purpose | Status |
|------|---------|--------|
| `.github/workflows/ci.yml` | PR validation (lint, type-check, RLS lint, test) | ACTIVE |
| `.github/workflows/migration-lint.yml` | RPC self-injection compliance | ACTIVE |
| `.github/workflows/check-srm-links.yml` | SRM doc link verification | ACTIVE |
| `.husky/pre-commit` | 7-hook orchestrator | ACTIVE |
| `scripts/lint-rls-write-path.sh` | Category A table detection | ACTIVE (in CI) |
| `scripts/validate-migration-names.sh` | Migration naming validation | EXISTS (not in CI) |

### Templates (Not Yet Deployed)
| File | Purpose | Status |
|------|---------|--------|
| `.claude/skills/devops-pt2/assets/vercel.json` | Vercel config template | TEMPLATE |
| `.claude/skills/devops-pt2/assets/workflows/deploy-staging.yml` | Staging deploy template | TEMPLATE (if exists) |

### Configuration
| File | Purpose | Status |
|------|---------|--------|
| `supabase/config.toml` | Local Supabase (PG17, ports, auth, seed) | ACTIVE |
| `supabase/seed.sql` | Dev seed data (2 casinos, 6 players, 6 tables) | ACTIVE |
| `next.config.ts` | React compiler, image optimization | ACTIVE (no security headers) |
| `tsconfig.json` | Strict mode, bundler resolution, `@/*` alias | ACTIVE |
| `.env.example` | Env var template | ACTIVE |
| `.env.test.example` | E2E test env template | ACTIVE |

### Database
| Item | Count/Detail |
|------|-------------|
| Migrations | 177 files (`supabase/migrations/`) |
| RPCs | 108+ `CREATE OR REPLACE FUNCTION` across migrations |
| Generated types | 4,723 lines (`types/remote/database.types.ts`) |
| Seed data | 1,157 lines (2 casinos, realistic workflows) |
| Remote project | `vaicxfihdldgepzryhpd` (US East 2) |

## Appendix B: ADR Cross-Reference for Pipeline Design

| ADR | Title | Pipeline Impact |
|-----|-------|----------------|
| ADR-015 | Connection Pooling + Pattern C | RPC self-injection gate; pooler-safe SET LOCAL |
| ADR-020 | Track A Hybrid MVP | Feature flag: no Track B in production |
| ADR-024 | Authoritative Context | No spoofable RPC inputs; CI scanner |
| ADR-030 | Auth System Hardening | D1-D5: TOCTOU, claims lifecycle, bypass lockdown, write-path, Template 2b |
| ADR-034 | RLS Write-Path Enforcement | Category A/B classification; lint gate in CI |

## Appendix C: Security Invariant Enforcement Matrix

| Invariant | Pre-Commit | CI Gate | Deploy Gate | Runtime |
|-----------|-----------|---------|------------|---------|
| Authoritative context (D1) | — | Test coverage | Smoke test | RPC validation |
| Write-path fail-closed (D4) | Hook #6 | `ci.yml` RLS lint | Smoke test | RLS policy |
| Bypass jailing (D3) | — | Lint for `skipAuth` | Env var check | Startup assertion |
| No spoofable inputs (INV-8) | Hook #2 | `migration-lint.yml` | — | RPC design |
| RPC self-injection (ADR-015) | Hook #2 | `migration-lint.yml` | — | RPC design |
