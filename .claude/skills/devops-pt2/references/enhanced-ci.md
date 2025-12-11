# Enhanced CI Pipeline Reference

Comprehensive guide for implementing and customizing the PT-2 CI/CD pipeline.

## Pipeline Architecture

### Job Dependencies

```
                    ┌───────────────┐
                    │    quality    │
                    │ (lint, types) │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌─────────┐   ┌─────────┐   ┌─────────┐
        │  test   │   │  build  │   │security │
        │ (jest)  │   │ (next)  │   │ (audit) │
        └────┬────┘   └────┬────┘   └─────────┘
             │             │
             └──────┬──────┘
                    ▼
              ┌─────────┐
              │   e2e   │
              │(playwright)│
              └─────────┘
```

### Parallel Execution Strategy

The pipeline maximizes parallelism while respecting dependencies:

1. **Quality checks** run first (fast feedback)
2. **Test, Build, Security** run in parallel after quality
3. **E2E** runs after build (needs artifacts)

## Required Secrets

Configure these in GitHub Repository Settings > Secrets:

| Secret | Description | Where to Get |
|--------|-------------|--------------|
| `VERCEL_TOKEN` | Vercel API token | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | Vercel organization ID | Project settings or `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Vercel project ID | Project settings or `.vercel/project.json` |
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

## Caching Strategy

### npm Cache

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # Automatic npm caching
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

## Test Configuration

### Jest (Unit/Integration)

```yaml
- name: Run tests
  run: npm run test:ci
  env:
    CI: true
```

The `test:ci` script includes:
- `--ci` flag for CI-specific behavior
- `--coverage` for code coverage
- `--maxWorkers=2` for parallel execution

### Playwright (E2E)

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run e2e:playwright
```

Note: Only install chromium to save time (vs all browsers).

## Artifact Management

### Build Artifacts

```yaml
- name: Upload build artifact
  uses: actions/upload-artifact@v4
  with:
    name: next-build
    path: .next
    retention-days: 1  # Short retention for CI artifacts
```

### Test Reports

```yaml
- name: Upload Playwright report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7  # Keep reports for debugging
```

## Concurrency Control

### Prevent Redundant Runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # Cancel old runs on new push
```

### Production Deploy Protection

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false  # Never cancel production deploys
```

## Custom npm Scripts

Ensure `package.json` has these scripts:

```json
{
  "scripts": {
    "lint:check": "eslint . --max-warnings=0",
    "type-check": "tsc --noEmit --strict",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "e2e:playwright": "playwright test"
  }
}
```

## Workflow Triggers

### Standard Triggers

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
```

### Tag-Based Triggers

```yaml
on:
  push:
    tags: ['v*']
```

### Manual Triggers

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

## Error Handling

### Continue on Non-Critical Failures

```yaml
- name: Security audit
  run: npm audit --audit-level=high
  continue-on-error: true  # Report but don't block
```

### Conditional Steps

```yaml
- name: Upload coverage
  uses: codecov/codecov-action@v4
  if: always()  # Run even if tests fail (for partial coverage)
```

## Notifications

### Slack Notification (Optional)

```yaml
- name: Notify Slack
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    channel: '#pt2-deploys'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Debugging Tips

### Enable Debug Logging

Add to repository secrets:
- `ACTIONS_STEP_DEBUG`: `true`
- `ACTIONS_RUNNER_DEBUG`: `true`

### SSH Debug Session

```yaml
- name: Debug with tmate
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 15
```

## Cost Optimization

1. **Use `ubuntu-latest`** - Cheapest runner
2. **Cache aggressively** - Reduce install time
3. **Cancel redundant runs** - Don't waste resources
4. **Optimize artifact retention** - Default is 90 days, reduce to 1-7
5. **Skip unnecessary jobs** - Use `if` conditions
