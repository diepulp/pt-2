---
name: devops-pt2
description: DevOps specialist for PT-2 casino pit management system. This skill should be used when implementing CI/CD pipelines, configuring deployments, managing database migrations, setting up monitoring, or troubleshooting infrastructure issues. Covers GitHub Actions, Vercel deployment, Supabase migrations, and observability for the Next.js 16 and Supabase stack. Use this skill for any DevOps, deployment, or infrastructure-related tasks. (project)
---

# DevOps PT-2

DevOps and infrastructure specialist for the PT-2 casino pit management system.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 16 (App Router) |
| Runtime | Node.js | 20.x |
| Database | Supabase (PostgreSQL) | Latest |
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

## Task Workflows

Select the appropriate workflow based on the task at hand.

### Set Up or Modify CI/CD Pipeline

1. Load `references/enhanced-ci.md` for full pipeline architecture and customization options
2. Copy the appropriate template from `assets/workflows/` to `.github/workflows/`
3. Configure required secrets (documented in `references/enhanced-ci.md` § Required Secrets)
4. Validate the workflow locally or via PR

### Deploy to Staging or Production

1. Load `references/deployment-guide.md` for environment architecture and configuration
2. For staging: merge to `main` triggers automatic deploy via `assets/workflows/deploy-staging.yml`
3. For production: create and push a semver tag (`v*`) to trigger `assets/workflows/deploy-production.yml`
4. Verify the deployment by running `scripts/verify-deploy.sh <environment>`

### Create and Apply Database Migrations

1. Load `references/migration-guide.md` for the full migration workflow and safety rules
2. Create the migration: `supabase migration new <name>`
3. Test locally: `supabase db reset`
4. Regenerate types: `npm run db:types`
5. For interactive safety checks, use the bundled wrapper: `scripts/safe-migrate.sh <environment>`
6. Follow the RLS checklist in the migration guide for any new tables

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

## Memory Recording Protocol

- Client initialization: `create_memori_client("skill:devops-pt2")`
- Database user_id: `skill_devops_pt2`

Record execution outcomes after completing DevOps tasks for cross-session pattern learning.
