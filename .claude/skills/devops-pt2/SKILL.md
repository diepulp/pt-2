---
name: devops-pt2
description: DevOps specialist for PT-2 casino pit management system. This skill should be used when implementing CI/CD pipelines, configuring deployments, managing database migrations, setting up monitoring, troubleshooting infrastructure issues, investigating database performance, running Supabase advisors, upgrading Postgres, modifying GitHub Actions workflows, checking CI status, debugging build failures, managing RLS policy performance, or handling any deployment/infrastructure task. Covers GitHub Actions (4 workflows), Vercel deployment, Supabase migrations, security gates, and observability for the Next.js 16 / React 19 / Supabase stack. Also use this skill when the user mentions CI failures, branch protection, merge gates, Postgres upgrades, or Supabase MCP operations. (project)
---

# DevOps PT-2

DevOps and infrastructure specialist for the PT-2 casino pit management system.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 16 (App Router) |
| UI | React | 19 |
| Runtime | Node.js | 24 (via `.nvmrc`) |
| Database | Supabase (PostgreSQL 17) | Latest |
| Hosting | Vercel | Edge + Serverless |
| CI/CD | GitHub Actions | v4 |
| Package Manager | npm | 10.x |

## Testing Governance (ADR-044)

CI/CD and branch protection are governed by the **Testing Governance Standard** (`docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`), established by ADR-044:

- **§7 Branch Protection**: `main` must be protected — all changes via PR, required status checks, 1+ review, up-to-date branch, force push/deletion blocked. Non-negotiable.
- **§8 Minimum Merge Gate**: Must include static checks (lint + type-check + build) AND at least one functional test layer. Compile-only gates are governance-deficient.
- **§6 Green CI Semantics**: "Green CI" means all required checks passed. "Compile green" means lint/type-check/build only. Never claim runtime verification from static-only gates.
- **§5 Enforcement Tiers**: A CI job is Required only when listed in branch-protection required checks. Otherwise it is Advisory — useful but non-governing.
- **§7 Ordering Rule**: Enable branch protection FIRST, then add CI test jobs, then mark as required. Reversing this creates governance illusion.
- **§12 Change-Control**: PRs modifying CI workflows, test scripts, or branch protection must include a 6-point disclosure (what changed, why, layers affected, confidence impact, compensating control, exit criteria).

---

## Current CI/CD Landscape

PT-2 has **4 active GitHub Actions workflows** in `.github/workflows/`:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | PR to main | Lint, type-check, build, unit tests (advisory), E2E (advisory) |
| **Security Gates** | `security-gates.yml` | PR touching `supabase/migrations/**` | SEC-007 SQL assertion gates against ephemeral Postgres |
| **Migration Lint** | `migration-lint.yml` | PR touching `supabase/migrations/**/*.sql` | RPC self-injection pattern compliance (ADR-015) |
| **SRM Link Check** | `check-srm-links.yml` | PR/push touching `docs/**/*.md` | Verifies SRM documentation link integrity |

The CI job uses `.nvmrc` for Node version (currently 24) and `npm install` (not `npm ci`). Unit tests run via `jest.node.config.js`, not the default jest config. E2E starts a local Supabase instance with most services excluded.

## Supabase MCP Integration

When the Supabase MCP is authenticated, you have direct access to:
- `get_advisors` — security and performance linter (run regularly after DDL changes)
- `execute_sql` — run queries against the remote database
- `list_migrations` / `apply_migration` — manage migrations remotely
- `list_tables` / `list_extensions` — inspect schema

Use `get_advisors` after any migration to catch missing RLS policies, mutable search paths, and InitPlan re-evaluation issues.

---

## Task Workflows

Select the appropriate workflow based on the task at hand.

### Set Up or Modify CI/CD Pipeline

1. Load `references/enhanced-ci.md` for full pipeline architecture and customization options
2. Review the current workflows in `.github/workflows/` before making changes
3. Any PR modifying CI workflows must include the **ADR-044 6-point disclosure** (see enhanced-ci.md § Change-Control Disclosure)
4. Configure required secrets (documented in `references/enhanced-ci.md` § Required Secrets)
5. Validate the workflow locally or via PR

### Deploy to Staging or Production

1. Load `references/deployment-guide.md` for environment architecture and configuration
2. For staging: merge to `main` triggers automatic deploy via `assets/workflows/deploy-staging.yml`
3. For production: create and push a semver tag (`v*`) to trigger `assets/workflows/deploy-production.yml`
4. Verify the deployment by running `scripts/verify-deploy.sh <environment>`

### Create and Apply Database Migrations

1. Load `references/migration-guide.md` for the full migration workflow and safety rules
2. Generate timestamp: `date +"%Y%m%d%H%M%S"` — never fabricate
3. Create the migration: `supabase migration new <name>` (verb prefix: `add_`, `create_`, `drop_`, `alter_`, `fix_`)
4. Test locally: `supabase db reset`
5. Regenerate types: `npm run db:types-local` (local) or `npm run db:types` (remote validation only)
6. For interactive safety checks, use the bundled wrapper: `scripts/safe-migrate.sh <environment>`
7. Follow the RLS checklist in the migration guide for any new tables

### Set Up Monitoring and Observability

1. Load `references/monitoring-setup.md` for the full observability stack configuration
2. Key integrations: Vercel Analytics (built-in), Sentry (`@sentry/nextjs`), Supabase Dashboard, Axiom
3. Implement a health check endpoint — see `references/troubleshooting-guide.md` § Health Check Endpoint

### Troubleshoot Issues

1. Load `references/troubleshooting-guide.md` for common issues, debug commands, and key metrics
2. Search patterns for quick lookup:
   - Build failures: `grep -i "Module not found\|Function timeout"` in troubleshooting guide
   - RLS errors: `grep -i "RLS\|JWT\|ADR-015"` in troubleshooting guide
   - Type errors: `grep -i "db:types\|stale types"` in troubleshooting guide

## Bundled Resources

### Scripts (executable without loading into context)

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/verify-deploy.sh` | Post-deployment verification | `./scripts/verify-deploy.sh staging\|production [url]` |
| `scripts/safe-migrate.sh` | Interactive safe migration wrapper | `./scripts/safe-migrate.sh local\|staging\|production` |

### References (load into context as needed)

| Reference | Content | When to Load |
|-----------|---------|--------------|
| `references/enhanced-ci.md` | CI pipeline architecture, secrets, caching, testing | CI/CD setup or modification |
| `references/monitoring-setup.md` | Sentry, Vercel Analytics, Axiom, health checks, alerting | Monitoring and observability tasks |
| `references/deployment-guide.md` | Environment architecture, Vercel config, release process, security | Deployment and release tasks |
| `references/migration-guide.md` | Migration workflow, safety rules, RLS checklist | Database migration tasks |
| `references/troubleshooting-guide.md` | Common issues, debug commands, key metrics, file locations | Debugging and troubleshooting |

### Assets (copy to project, do not load into context)

| Asset | Purpose | Target Location |
|-------|---------|-----------------|
| `assets/workflows/ci-enhanced.yml` | Enhanced CI pipeline template | `.github/workflows/ci.yml` |
| `assets/workflows/deploy-staging.yml` | Staging deployment workflow | `.github/workflows/deploy-staging.yml` |
| `assets/workflows/deploy-production.yml` | Production deployment workflow | `.github/workflows/deploy-production.yml` |
| `assets/vercel.json` | Vercel configuration with security headers | `vercel.json` |

