# Troubleshooting Guide

Common issues, debug commands, and quick references for PT-2 DevOps.

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Build fails: "Module not found" | Missing dependency | Check `package.json`, run `npm ci` |
| Deploy fails: "Function timeout" | API route > 10s | Optimize query, add streaming |
| RLS error in production | Missing JWT claims | Verify ADR-015 implementation |
| Type errors after migration | Stale types | Run `npm run db:types` |
| Preview deploy missing env vars | Not configured | Add to Vercel project settings |

## Debug Commands

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

## Health Check Endpoint

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

## Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| LCP (Largest Contentful Paint) | ≤ 2.5s | > 4.0s |
| API Response Time (p95) | ≤ 500ms | > 1000ms |
| Error Rate | < 0.1% | > 1% |
| Database Connection Pool | < 80% | > 90% |
| Serverless Function Duration | < 10s | > 25s |

## Essential Commands

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

## File Locations

| Purpose | Location |
|---------|----------|
| CI Pipeline | `.github/workflows/ci.yml` |
| Vercel Config | `vercel.json` |
| Supabase Config | `supabase/config.toml` |
| Migrations | `supabase/migrations/*.sql` |
| Types | `types/database.types.ts` |
| Environment | `.env.local` (local only) |
