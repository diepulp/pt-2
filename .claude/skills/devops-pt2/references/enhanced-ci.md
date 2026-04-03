# CI Pipeline Reference

Architecture and customization guide for the PT-2 CI/CD pipeline.

## Current Pipeline State

PT-2 runs **4 GitHub Actions workflows**. The primary `ci.yml` is the merge gate; the others are specialized checks.

### ci.yml — Primary Merge Gate

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     checks       │     │      test        │     │       e2e        │
│ (lint, types,    │     │ (jest, advisory) │     │ (playwright,     │
│  build, env      │     │                  │     │  advisory)       │
│  drift guard)    │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
     REQUIRED                ADVISORY                 ADVISORY
```

**Trigger:** `pull_request` to `main` + `workflow_dispatch`  
**Concurrency:** `ci-${{ github.ref }}`, cancel-in-progress  

**Jobs:**
- **checks** (required) — lint, type-check, build, env drift guard
- **test** (advisory, `continue-on-error: true`) — `npx jest --ci --config jest.node.config.js --maxWorkers=2`
- **e2e** (advisory, `continue-on-error: true`) — starts local Supabase, runs Playwright against chromium

Key details that differ from generic templates:
- Uses `.nvmrc` for Node version (currently 24), not a hardcoded version
- Uses `npm install`, not `npm ci`
- Unit tests use `jest.node.config.js`, not the default jest config
- E2E starts a local Supabase with minimal services: `supabase start -x storage,imgproxy,inbucket,...`
- E2E captures Supabase env dynamically from `supabase status -o env`
- Build uses placeholder env vars: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`

### security-gates.yml — SEC-007 SQL Assertion Gates

**Trigger:** PR touching `supabase/migrations/**` or `supabase/tests/security/**`  
**Purpose:** Runs 8 pure-SQL assertion scripts against an ephemeral Postgres instance  
**Key:** Uses `supabase db start` (DB only, no PostgREST/Studio/Realtime), then `supabase db push --local`

### migration-lint.yml — RPC Self-Injection Compliance

**Trigger:** PR touching `supabase/migrations/**/*.sql`  
**Purpose:** Validates that any new `rpc_*` functions include `set_rls_context` calls (ADR-015 Phase 1A)  
**Key:** Diffs against `origin/${{ github.base_ref }}` to check only changed files

### check-srm-links.yml — SRM Documentation Integrity

**Trigger:** PR/push touching `docs/**/*.md`  
**Purpose:** Verifies all cross-references in SRM documentation resolve correctly  
**Key:** Uses `npm run check:srm-links`

---

## Required Secrets

Configure these in GitHub Repository Settings > Secrets:

| Secret | Description | Where to Get |
|--------|-------------|--------------|
| `VERCEL_TOKEN` | Vercel API token | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | Vercel organization ID | `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Vercel project ID | `.vercel/project.json` |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI token | Supabase Dashboard > Access Tokens |
| `SUPABASE_STAGING_PROJECT_REF` | Staging project reference | Supabase Dashboard > Project Settings |
| `SUPABASE_PROD_PROJECT_REF` | Production project reference | Supabase Dashboard > Project Settings |
| `CODECOV_TOKEN` | Coverage upload token | Codecov Dashboard |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard > Settings > API |

## Environment Configuration

### GitHub Environments

Create these environments in Repository Settings > Environments:

#### `staging`
- **Protection rules**: None (auto-deploy on merge)
- **Secrets**: Staging-specific Supabase credentials
- **Variables**: `ENVIRONMENT=staging`

#### `production`
- **Protection rules**: Required reviewers (add team leads)
- **Wait timer**: 5 minutes (optional rollback window)
- **Secrets**: Production Supabase credentials
- **Variables**: `ENVIRONMENT=production`

#### `production-db`
- **Protection rules**: Required reviewers (DBA or lead)
- **Purpose**: Extra protection for database migrations

---

## Testing Governance (ADR-044)

CI/CD and branch protection are governed by `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`.

### Key Rules

- **§7 Branch Protection**: `main` must be protected — all changes via PR, required status checks, 1+ review, up-to-date branch, force push/deletion blocked
- **§8 Minimum Merge Gate**: Static checks (lint + type-check + build) AND at least one functional test layer
- **§6 Green CI Semantics**: "Green CI" = all required checks passed. "Compile green" = static only. Never conflate them.
- **§5 Enforcement Tiers**: Required = listed in branch protection. Advisory = useful but non-governing.
- **§7 Ordering Rule**: Enable branch protection FIRST, then add CI jobs, then mark as required

### Change-Control Disclosure (§12)

Any PR modifying CI workflows, test scripts, or branch protection **must** include this 6-point disclosure:

```markdown
## CI Change Disclosure (ADR-044 §12)

1. **What changed**: [describe the CI/test modification]
2. **Why**: [motivation — bug fix, governance gap, new feature]
3. **Layers affected**: [which CI jobs/checks are impacted]
4. **Confidence impact**: [does this strengthen or weaken the merge gate?]
5. **Compensating control**: [if weakening, what mitigates the risk?]
6. **Exit criteria**: [when can advisory jobs become required?]
```

---

## Caching Strategy

### npm Cache

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
    cache: 'npm'
```

### Next.js Build Cache

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
      ${{ runner.os }}-nextjs-
```

### Playwright Cache

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}
```

## Concurrency Control

### Prevent Redundant Runs

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### Production Deploy Protection

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false  # Never cancel production deploys
```

## Artifact Management

### Test Reports

```yaml
- name: Upload Playwright report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: |
      playwright-report/
      test-results/
    retention-days: 14
```

## Workflow Triggers

### Tag-Based (for future production deploys)

```yaml
on:
  push:
    tags: ['v*']
```

### Manual

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
```

## Debugging Tips

### Enable Debug Logging

Add to repository secrets:
- `ACTIONS_STEP_DEBUG`: `true`
- `ACTIONS_RUNNER_DEBUG`: `true`

## Cost Optimization

1. **Use `ubuntu-latest`** — cheapest runner
2. **Cache aggressively** — reduce install time
3. **Cancel redundant runs** — `cancel-in-progress: true`
4. **Reduce artifact retention** — 1-14 days, not 90
5. **Skip unnecessary jobs** — use `if` conditions and path filters
6. **Minimal Supabase services** — exclude storage, imgproxy, inbucket, etc. in E2E
