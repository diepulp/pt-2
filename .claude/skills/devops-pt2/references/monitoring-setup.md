# Monitoring & Observability Setup

Comprehensive guide for setting up monitoring, alerting, and observability for PT-2.

## Monitoring Stack Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PT-2 Observability Stack                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Frontend                 Backend                    Database            │
│  ┌─────────────┐         ┌─────────────┐           ┌─────────────┐     │
│  │   Vercel    │         │   Sentry    │           │  Supabase   │     │
│  │  Analytics  │         │   (Errors)  │           │  Dashboard  │     │
│  │  (Vitals)   │         │             │           │  (Metrics)  │     │
│  └──────┬──────┘         └──────┬──────┘           └──────┬──────┘     │
│         │                       │                         │             │
│         └───────────────────────┴─────────────────────────┘             │
│                                 │                                        │
│                         ┌───────▼───────┐                               │
│                         │     Axiom     │                               │
│                         │(Log Aggregation)│                              │
│                         └───────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Vercel Analytics (Built-in)

### Enable Analytics

1. Go to Vercel Dashboard > Project > Analytics
2. Enable "Web Analytics" and "Speed Insights"

### Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| LCP | Largest Contentful Paint | ≤ 2.5s |
| FID | First Input Delay | ≤ 100ms |
| CLS | Cumulative Layout Shift | ≤ 0.1 |
| TTFB | Time to First Byte | ≤ 600ms |

### Custom Analytics Events

```typescript
// lib/analytics.ts
import { track } from '@vercel/analytics';

export function trackSlipCreated(slipId: string, tableId: string) {
  track('slip_created', {
    slipId,
    tableId,
    timestamp: new Date().toISOString(),
  });
}

export function trackPlayerCheckIn(playerId: string) {
  track('player_checkin', { playerId });
}
```

## 2. Sentry Setup

### Installation

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### Configuration Files

#### `sentry.client.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || 'development',

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Ignore common non-errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'Load failed',
  ],
});
```

#### `sentry.server.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 0.1,

  // Capture unhandled promise rejections
  integrations: [
    Sentry.captureConsoleIntegration({
      levels: ['error'],
    }),
  ],
});
```

### Custom Error Boundaries

```typescript
// components/error-boundary.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="p-4">
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### User Context

```typescript
// After authentication
import * as Sentry from '@sentry/nextjs';

Sentry.setUser({
  id: staff.id,
  email: staff.email,
  username: staff.name,
  ip_address: '{{auto}}',
});

// On logout
Sentry.setUser(null);
```

## 3. Supabase Monitoring

### Dashboard Metrics

Access via Supabase Dashboard > Project > Reports:

- **Database Health**: Connections, query performance
- **Auth Metrics**: Sign-ins, failed attempts
- **Storage Usage**: Database size, storage quotas
- **Edge Functions**: Invocations, errors, duration

### Connection Pool Monitoring

```sql
-- Check connection stats
SELECT
  state,
  count(*)
FROM pg_stat_activity
WHERE datname = 'postgres'
GROUP BY state;

-- Check long-running queries
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '5 seconds';
```

### Alerts Setup

1. Go to Supabase Dashboard > Project > Settings > Alerts
2. Configure alerts for:
   - High CPU usage (> 80%)
   - High memory usage (> 80%)
   - Connection pool exhaustion (> 90%)
   - Slow queries (> 1s average)

## 4. Axiom Integration (Log Aggregation)

### Setup via Vercel

1. Go to Vercel Dashboard > Integrations
2. Add "Axiom" integration
3. Configure log streaming

### Custom Logging

```typescript
// lib/logger.ts
import { log } from '@vercel/edge-config';

export function logEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV,
    ...data,
  }));
}

// Usage
logEvent('slip_created', {
  slipId: slip.id,
  tableId: slip.table_id,
  playerId: slip.player_id,
});
```

## 5. Health Check Endpoint

### Implementation

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: 'ok' | 'error';
    latency_ms: number;
  };
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const start = Date.now();
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('casino')
      .select('id')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      dbStatus = 'error';
    }
  } catch {
    dbStatus = 'error';
  }

  const latency = Date.now() - start;
  const status = dbStatus === 'error' ? 'unhealthy' :
                 latency > 500 ? 'degraded' : 'healthy';

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    checks: {
      database: dbStatus,
      latency_ms: latency,
    },
  }, {
    status: status === 'unhealthy' ? 503 : 200,
  });
}
```

### External Monitoring

Use services like:
- **UptimeRobot**: Free tier, 5-minute checks
- **Better Uptime**: More features, alerting
- **Pingdom**: Enterprise-grade

Configuration:
- URL: `https://pt2.app/api/health`
- Interval: 1-5 minutes
- Alert: Status code != 200 or response time > 5s

## 6. Alerting Strategy

### Alert Levels

| Level | Response Time | Examples |
|-------|---------------|----------|
| P1 - Critical | Immediate | Site down, DB unreachable |
| P2 - High | < 1 hour | Error rate > 5%, API timeouts |
| P3 - Medium | < 4 hours | Error rate > 1%, slow queries |
| P4 - Low | Next business day | Warnings, non-critical issues |

### Alert Channels

1. **Slack** - Primary channel for all alerts
2. **Email** - Backup for P1/P2
3. **PagerDuty/OpsGenie** - After-hours P1

### Sentry Alert Rules

1. Go to Sentry > Alerts > Create Alert Rule
2. Configure:
   - **Issue Alerts**: New issues, issue frequency
   - **Metric Alerts**: Error count, transaction duration

Example rules:
- Alert on > 10 errors in 5 minutes
- Alert when p95 response time > 2s
- Alert on any unhandled exception

## 7. Dashboard Setup

### Key Dashboards

#### Operations Dashboard
- Active tables count
- Open rating slips
- Player check-ins (last hour)
- Error rate
- API response times

#### Performance Dashboard
- LCP by page
- API latency (p50, p95, p99)
- Database query times
- Cache hit rates

### Grafana Setup (Optional)

If using Grafana Cloud:

```yaml
# datasources.yaml
datasources:
  - name: Supabase
    type: postgres
    url: ${SUPABASE_DB_URL}
    database: postgres
    user: postgres
    jsonData:
      sslmode: require
```

## 8. Runbook Templates

### High Error Rate

```markdown
## Symptoms
- Error rate > 1%
- Sentry alerts firing

## Investigation
1. Check Sentry for error patterns
2. Check Vercel logs: `vercel logs <deployment>`
3. Check Supabase dashboard for DB issues
4. Check recent deployments

## Resolution
- If deployment caused: rollback via Vercel
- If DB issue: check Supabase status
- If third-party: verify external services
```

### Slow Response Times

```markdown
## Symptoms
- p95 > 2s
- User complaints about slow pages

## Investigation
1. Check Vercel Analytics for slow pages
2. Check Supabase for slow queries
3. Review recent changes

## Resolution
- Add caching for slow queries
- Optimize database indexes
- Review N+1 query issues
```

## 9. Cost Considerations

| Service | Free Tier | Notes |
|---------|-----------|-------|
| Vercel Analytics | Included | Pro plan |
| Sentry | 5K errors/month | Upgrade as needed |
| Supabase | Included | Dashboard metrics |
| Axiom | 500GB ingest/month | Usually sufficient |
| UptimeRobot | 50 monitors | For health checks |

## 10. Quick Setup Checklist

- [ ] Enable Vercel Analytics
- [ ] Install and configure Sentry
- [ ] Create health check endpoint
- [ ] Set up external uptime monitoring
- [ ] Configure Supabase alerts
- [ ] Create Slack alert channel
- [ ] Document runbooks
- [ ] Test alerting pipeline
