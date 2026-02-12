# Deployment Guide

Comprehensive reference for Vercel deployment, environment configuration, and release management for PT-2.

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

- Preview deployments are automatic for all PRs via Vercel
- Database branching is available via Supabase for isolated testing
- Critical casino operations require pre-production testing via staging

## Vercel Configuration

### Project Settings

Use the template at `assets/vercel.json` as the canonical configuration. Key settings:

| Setting | Value | Rationale |
|---------|-------|-----------|
| `regions` | `["iad1"]` | US East for low latency to Supabase |
| `maxDuration` | `30` (API routes) | Casino operations may involve multi-table queries |
| `installCommand` | `npm ci` | Deterministic installs for CI/CD |

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

## Deployment Workflows

### Preview Deployment (Automatic)

Every PR automatically receives a Vercel preview deployment. No configuration needed.

### Staging Deployment

- **Trigger**: Merge to `main` branch
- **Workflow template**: `assets/workflows/deploy-staging.yml`
- **Domain**: `staging.pt2.app`
- **Process**: CI checks → Build → Deploy → Alias → Health check → Run migrations

### Production Deployment

- **Trigger**: Push tag `v*`
- **Workflow template**: `assets/workflows/deploy-production.yml`
- **Domain**: `pt2.app`
- **Process**: Validate semver → CI checks → Build → Deploy → Health check → Migrations → GitHub Release

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

## Security Hardening

### Secret Management

1. **Vercel Environment Variables**: Use encrypted secrets
2. **GitHub Actions Secrets**: Never log secrets
3. **Local Development**: Use `.env.local` (gitignored)

### Security Headers

Configure in `next.config.ts`:

```typescript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

The `assets/vercel.json` template includes these headers pre-configured.

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

## Post-Deployment Verification

Run the bundled verification script after any deployment:

```bash
scripts/verify-deploy.sh staging
scripts/verify-deploy.sh production https://pt2.app
```

The script checks: health endpoint, page loads, API auth enforcement, response times, security headers, and SSL certificates (production only).
