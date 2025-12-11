---
name: devops-pt2
description: DevOps specialist for PT-2 casino pit management system. This skill should be used when implementing CI/CD pipelines, configuring deployments, managing database migrations, setting up monitoring, or troubleshooting infrastructure issues. Covers GitHub Actions, Vercel deployment, Supabase migrations, and observability for the Next.js 15 and Supabase stack. Use this skill for any DevOps, deployment, or infrastructure-related tasks. (project)
---

# DevOps PT-2

DevOps and infrastructure specialist for the PT-2 casino pit management system. Provides
workflows, templates, and guidance for CI/CD, deployments, migrations, and monitoring.

## Tech Stack Context

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 16 (App Router) |
| Runtime | Node.js | 20.x |
| Database | Supabase (PostgreSQL) | Latest |
| Hosting | Vercel | Edge + Serverless |
| CI/CD | GitHub Actions | v4 |
| Package Manager | npm | 10.x |

## Environment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PT-2 Environment Flow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Feature Branch    PR Preview         Staging           Production   │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐      ┌──────────┐  │
│  │ develop/ │───▶│ Vercel   │      │ Vercel   │      │ Vercel   │  │
│  │ feature/ │    │ Preview  │──PR─▶│ Staging  │─Tag─▶│ Prod     │  │
│  └──────────┘    └──────────┘      └──────────┘      └──────────┘  │
│       │               │                  │                 │        │
│       ▼               ▼                  ▼                 ▼        │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐      ┌──────────┐  │
│  │ Supabase │    │ Supabase │      │ Supabase │      │ Supabase │  │
│  │ Local    │    │ Preview  │      │ Staging  │      │ Prod     │  │
│  │ (docker) │    │ Branch   │      │ Project  │      │ Project  │  │
│  └──────────┘    └──────────┘      └──────────┘      └──────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Recommended Setup** (Staging + Production):
- Critical casino operations require pre-production testing
- Preview deployments automatic for all PRs via Vercel
- Database branching available via Supabase for isolated testing

---

## CI/CD Pipeline Design

### Pipeline Stages

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Lint   │──▶│  Type   │──▶│  Test   │──▶│  Build  │──▶│ Deploy  │
│         │   │  Check  │   │         │   │         │   │         │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
     │             │             │             │             │
     ▼             ▼             ▼             ▼             ▼
  ESLint       TypeScript     Jest +       Next.js      Vercel
  Prettier     --noEmit      Playwright    build        Deploy
```

### Workflow Files Location

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `.github/workflows/ci.yml` | Main CI pipeline | push, PR |
| `.github/workflows/deploy-staging.yml` | Staging deployment | merge to main |
| `.github/workflows/deploy-production.yml` | Production release | tag v* |
| `.github/workflows/db-migrate.yml` | Database migrations | manual, merge |

### GitHub Actions Best Practices for PT-2

1. **Use matrix strategy for parallel jobs**:
   ```yaml
   jobs:
     test:
       strategy:
         matrix:
           node-version: [20]
           test-type: [unit, integration, e2e]
   ```

2. **Cache aggressively**:
   ```yaml
   - uses: actions/cache@v4
     with:
       path: |
         ~/.npm
         .next/cache
       key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}
   ```

3. **Use environment protection rules**:
   - Require approval for production deployments
   - Add deployment reviewers (pit_boss, admin roles)

4. **Fail fast on critical checks**:
   ```yaml
   - name: Type check
     run: npm run type-check
     # No continue-on-error for type safety
   ```

---

## Vercel Configuration

### Project Settings

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    }
  ]
}
```

### Environment Variables

| Variable | Staging | Production | Notes |
|----------|---------|------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | staging.supabase.co | prod.supabase.co | Public, prefixed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging-anon-key | prod-anon-key | Public, prefixed |
| `SUPABASE_SERVICE_ROLE_KEY` | staging-service | prod-service | **Server-only** |
| `SUPABASE_DB_URL` | staging-db | prod-db | Migrations only |

### Vercel CLI Commands

```bash
# Link to project
vercel link

# Deploy preview
vercel

# Deploy to production
vercel --prod

# Pull environment variables
vercel env pull .env.local

# Add environment variable
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

---

## Supabase Migration Workflow

### Safe Migration Process

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

### Migration Commands

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

### Migration Safety Rules

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

### RLS Considerations

PT-2 uses Row-Level Security extensively. Migration checklist:

- [ ] New tables have RLS enabled
- [ ] RLS policies include `casino_id` scoping
- [ ] JWT claims integration per ADR-015
- [ ] Test with both `anon` and `authenticated` roles

---

## Monitoring & Observability

### Recommended Stack

| Tool | Purpose | Integration |
|------|---------|-------------|
| **Vercel Analytics** | Web vitals, LCP | Built-in |
| **Sentry** | Error tracking | `@sentry/nextjs` |
| **Supabase Dashboard** | DB metrics, logs | Built-in |
| **Axiom** | Log aggregation | Vercel integration |

### Health Check Endpoint

Implement at `app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const start = Date.now();

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('casino').select('id').limit(1);

    if (error) throw error;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
```

### Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| LCP (Largest Contentful Paint) | ≤ 2.5s | > 4.0s |
| API Response Time (p95) | ≤ 500ms | > 1000ms |
| Error Rate | < 0.1% | > 1% |
| Database Connection Pool | < 80% | > 90% |
| Serverless Function Duration | < 10s | > 25s |

---

## Deployment Workflows

### Preview Deployment (Automatic)

Every PR automatically gets a Vercel preview deployment. No configuration needed.

### Staging Deployment

Trigger: Merge to `main` branch

```yaml
name: Deploy Staging
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          alias-domains: staging.pt2.app
```

### Production Deployment

Trigger: Push tag `v*`

```yaml
name: Deploy Production
on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Release Process

```bash
# 1. Ensure main is up to date
git checkout main && git pull

# 2. Create release tag
git tag -a v1.0.0 -m "Release 1.0.0: MVP pit dashboard"

# 3. Push tag (triggers production deploy)
git push origin v1.0.0

# 4. Create GitHub release
gh release create v1.0.0 --generate-notes
```

---

## Security Hardening

### Secret Management

1. **Vercel Environment Variables**: Use encrypted secrets
2. **GitHub Actions Secrets**: Never log secrets
3. **Local Development**: Use `.env.local` (gitignored)

### Security Headers (next.config.ts)

```typescript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

### Dependency Scanning

```yaml
# Add to CI pipeline
- name: Security audit
  run: npm audit --audit-level=high
  continue-on-error: true

- name: Dependabot alerts check
  uses: actions/dependency-review-action@v4
  if: github.event_name == 'pull_request'
```

---

## Troubleshooting Guide

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Build fails: "Module not found" | Missing dependency | Check `package.json`, run `npm ci` |
| Deploy fails: "Function timeout" | API route > 10s | Optimize query, add streaming |
| RLS error in production | Missing JWT claims | Verify ADR-015 implementation |
| Type errors after migration | Stale types | Run `npm run db:types` |
| Preview deploy missing env vars | Not configured | Add to Vercel project settings |

### Debug Commands

```bash
# Check Vercel deployment logs
vercel logs <deployment-url>

# Check Supabase logs
supabase functions logs

# Local build matching production
npm run build && npm start

# Verify environment
vercel env ls
```

---

## Quick Reference

### Essential Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm run type-check             # TypeScript validation

# Testing
npm run test                   # Unit tests
npm run test:ci                # CI mode with coverage
npm run e2e:playwright         # E2E tests

# Database
supabase db reset              # Reset local DB
supabase migration new <name>  # Create migration
npm run db:types               # Regenerate types

# Deployment
vercel                         # Preview deploy
vercel --prod                  # Production deploy
git tag -a v1.x.x -m "msg"     # Release tag
```

### File Locations

| Purpose | Location |
|---------|----------|
| CI Pipeline | `.github/workflows/ci.yml` |
| Vercel Config | `vercel.json` |
| Supabase Config | `supabase/config.toml` |
| Migrations | `supabase/migrations/*.sql` |
| Types | `types/database.types.ts` |
| Environment | `.env.local` (local only) |

---

## Resources

### Bundled Assets

- `assets/workflows/` - GitHub Actions workflow templates
- `assets/vercel.json` - Vercel configuration template

### Reference Documents

- `references/enhanced-ci.md` - Full enhanced CI pipeline documentation
- `references/monitoring-setup.md` - Detailed monitoring configuration

### Scripts

- `scripts/verify-deploy.sh` - Post-deployment verification
- `scripts/safe-migrate.sh` - Safe migration wrapper

---

## Memory Recording Protocol

This skill tracks execution outcomes to build pattern knowledge.

### Namespace Reference

- Client initialization: `create_memori_client("skill:devops-pt2")`
- Database user_id: `skill_devops_pt2`

### Execution Tracking

After completing DevOps tasks, record outcomes:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:devops-pt2")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="devops-pt2",
    task="Setup CI/CD pipeline for staging",
    outcome="success",
    pattern_used="GitHub Actions + Vercel",
    validation_results={
        "workflow_valid": True,
        "secrets_configured": True,
        "deploy_successful": True
    },
    files_created=[
        ".github/workflows/deploy-staging.yml"
    ],
    lessons_learned=[
        "Cache .next/cache for faster builds"
    ]
)
```
