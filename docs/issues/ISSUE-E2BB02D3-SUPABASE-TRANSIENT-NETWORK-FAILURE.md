# ISSUE-E2BB02D3: Supabase Transient Network Failure in Production

**Status:** Open
**Severity:** High
**Category:** Infrastructure / Reliability
**Created:** 2026-01-26
**Related ADR:** ADR-015, ADR-020
**Related PRD:** PRD-022, PRD-023
**Related Service:** Supabase SSR Client (Middleware, Server Components)
**Tags:** DNS, network, transient-failure, retry, production, auth, player-360

---

## Executive Summary

Production build encountered transient DNS resolution and connection timeout failures when attempting to reach Supabase authentication endpoints. The failure caused users to be logged out unexpectedly.

**Trigger Point:** Player 360 Lookup Page (`/players/[[...playerId]]`)

The issue was first observed when navigating to the recently implemented Player 360 page (PRD-022/PRD-023). This route uses server-side session validation via middleware before rendering.

**Error Signatures:**
```
TypeError: fetch failed
[cause]: Error: getaddrinfo ENOTFOUND vaicxfihdldgepzryhpd.supabase.co
         errno: -3007, code: 'ENOTFOUND', syscall: 'getaddrinfo'

TypeError: fetch failed
[cause]: Error [ConnectTimeoutError]: Connect Timeout Error
         (attempted address: vaicxfihdldgepzryhpd.supabase.co:443, timeout: 10000ms)
         code: 'UND_ERR_CONNECT_TIMEOUT'
```

**Impact:** Users are forcibly logged out when server-side session validation fails due to network transience.

---

## Root Cause Analysis

### Verified Facts

1. **Supabase project is active** - Dashboard confirms project is not paused
2. **DNS resolves correctly** - `nslookup` returns `172.64.149.246` and `104.18.38.10`
3. **API is reachable** - `curl` returns HTTP 401 (auth required, as expected)
4. **Error is transient** - Occurs intermittently, not persistently

### Failure Chain

```
Middleware (updateSession)
  └─ createServerClient()
      └─ supabase.auth.getClaims()
          └─ fetch() to vaicxfihdldgepzryhpd.supabase.co
              └─ DNS ENOTFOUND / Connect Timeout
                  └─ Session validation fails
                      └─ User redirected to /auth/login
```

### Likely Causes

| Cause | Probability | Evidence |
|-------|-------------|----------|
| DNS resolver hiccup (systemd-resolved/cloud DNS) | High | ENOTFOUND is DNS-specific |
| Network congestion / packet loss | Medium | ConnectTimeoutError after 10s |
| Supabase CDN edge node unavailable | Low | Multiple IPs returned by DNS |
| Container/serverless cold start DNS cache miss | Medium | SSR context, ephemeral containers |

---

## Trigger Route: Player 360 Page

### Route Structure

```
app/(dashboard)/players/[[...playerId]]/
├── page.tsx                              # Server component entry point
├── _components/
│   ├── player-360-content-wrapper.tsx    # Client wrapper with usePlayer hook
│   ├── player-360-empty-state-wrapper.tsx
│   └── player-360-shell.tsx              # Layout shell
```

### Request Flow

```
Browser: GET /players/[playerId]
    │
    ▼
Middleware (middleware.ts)
    │
    └─► updateSession(request)
            │
            └─► supabase.auth.getClaims()  ← FAILURE POINT
                    │
                    └─► fetch() to vaicxfihdldgepzryhpd.supabase.co
                            │
                            └─► DNS ENOTFOUND / Connect Timeout
                                    │
                                    └─► user = null
                                            │
                                            └─► Redirect to /auth/login
```

### Related Components

| Component | Type | Supabase Call |
|-----------|------|---------------|
| `page.tsx` | Server | Renders layout, passes `playerId` |
| `player-360-content-wrapper.tsx` | Client | `usePlayer(playerId)` hook |
| `TimelinePageContent` | Client | Timeline data fetching |

### Recent Implementation History

```
8c0ee7a feat(player-360): implement PRD-023 Player 360 Panels v0
1371d30 feat(player-timeline): implement ADR-029 Player 360 Timeline Dashboard
44ee114 docs(prd-022): add Player 360 navigation consolidation PRD and specs
```

---

## Affected Code Paths

### 1. Middleware Session Refresh (`lib/supabase/middleware.ts:48`)

```typescript
const { data } = await supabase.auth.getClaims();  // ← Fails here
const user = data?.claims;

if (!user && !isPublicRoute) {
  return NextResponse.redirect(loginUrl);  // ← User logged out
}
```

### 2. Server Component Client (`lib/supabase/server.ts:14`)

```typescript
export const createClient = async (): Promise<SupabaseClient<Database>> => {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,  // ← No retry config
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {...} }
  );
};
```

---

## Recommended Remediation: Retry Configuration Strategy

### Strategy Overview

Implement exponential backoff with jitter for Supabase client fetch operations. This is the standard approach for handling transient network failures in distributed systems.

### Implementation Options

#### Option A: Custom Fetch with Retry (Recommended)

**Why:** Full control over retry behavior, works with all Supabase client types.

```typescript
// lib/supabase/fetch-with-retry.ts
type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
};

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  retryableErrors: [
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'ECONNRESET',
    'EAI_AGAIN',  // DNS temporary failure
  ],
};

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: Error }).cause;
    const code = (cause as Error & { code?: string })?.code;
    return DEFAULT_CONFIG.retryableErrors.includes(code ?? '');
  }
  return false;
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff with full jitter
  const exponentialDelay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  return Math.random() * exponentialDelay;
}

export function createFetchWithRetry(
  config: Partial<RetryConfig> = {}
): typeof fetch {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async function fetchWithRetry(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        return await fetch(input, init);
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(error) || attempt === finalConfig.maxRetries) {
          throw error;
        }

        const delay = calculateDelay(attempt, finalConfig);
        console.warn(
          `[Supabase] Fetch failed (attempt ${attempt + 1}/${finalConfig.maxRetries + 1}), ` +
          `retrying in ${Math.round(delay)}ms: ${(error as Error).message}`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  };
}
```

#### Option B: Apply to Supabase Clients

**Middleware Client:**

```typescript
// lib/supabase/middleware.ts
import { createFetchWithRetry } from './fetch-with-retry';

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: { ... },
    global: {
      fetch: createFetchWithRetry({ maxRetries: 2 }),  // Lower for middleware
    },
  }
);
```

**Server Component Client:**

```typescript
// lib/supabase/server.ts
import { createFetchWithRetry } from './fetch-with-retry';

export const createClient = async (): Promise<SupabaseClient<Database>> => {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { ... },
      global: {
        fetch: createFetchWithRetry({ maxRetries: 3 }),
      },
    },
  );
};
```

### Retry Configuration Rationale

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `maxRetries` | 3 | Balance between resilience and latency |
| `baseDelayMs` | 100ms | Fast first retry for transient hiccups |
| `maxDelayMs` | 2000ms | Cap to prevent excessive user wait |
| Jitter | Full (random 0-delay) | Prevents thundering herd on recovery |

### Expected Behavior

```
Attempt 1: Immediate
Attempt 2: 0-200ms delay (random)
Attempt 3: 0-400ms delay (random)
Attempt 4: 0-800ms delay (random)
Total max time: ~3.5s additional latency in worst case
```

---

## Investigation Checklist

This section outlines all aspects requiring investigation before implementing the retry strategy.

### 1. Failure Frequency & Patterns

| Question | Status | Finding |
|----------|--------|---------|
| What is the frequency of these transient failures? | [ ] Pending | |
| Is there a time-of-day pattern? | [ ] Pending | |
| Does it correlate with deployments or cold starts? | [ ] Pending | |
| Is it specific to the Player 360 route or system-wide? | [ ] Pending | |
| Does it occur on other routes with similar SSR patterns? | [ ] Pending | |

**Action:** Add structured logging before implementing retry to establish baseline.

### 2. DNS & Network Investigation

| Question | Status | Finding |
|----------|--------|---------|
| What DNS resolver is used in production? (systemd-resolved, cloud provider DNS, etc.) | [ ] Pending | |
| Is DNS caching configured? What is the TTL? | [ ] Pending | |
| Are there multiple DNS servers configured for failover? | [ ] Pending | |
| What is the network path from production to Supabase? | [ ] Pending | |
| Are there any firewall rules or network policies affecting outbound HTTPS? | [ ] Pending | |

**Action:** Run `cat /etc/resolv.conf` and `systemd-resolve --status` in production environment.

### 3. Deployment Environment Analysis

| Question | Status | Finding |
|----------|--------|---------|
| Where is the production build deployed? (Vercel, self-hosted, Docker, etc.) | [ ] Pending | |
| Is this a serverless/edge deployment with cold starts? | [ ] Pending | |
| What is the function timeout configuration? | [ ] Pending | |
| Is the deployment in the same region as Supabase? | [ ] Pending | |
| Are there connection pooling or keep-alive settings? | [ ] Pending | |

**Action:** Document deployment architecture and region configuration.

### 4. Supabase Configuration Review

| Question | Status | Finding |
|----------|--------|---------|
| What region is the Supabase project deployed in? | [ ] Pending | |
| Is there any rate limiting configured on the Supabase project? | [ ] Pending | |
| Are there IP allowlists/blocklists affecting connectivity? | [ ] Pending | |
| What is the Supabase project's connection limit? | [ ] Pending | |
| Is Supabase returning any quota or limit errors in logs? | [ ] Pending | |

**Action:** Review Supabase dashboard logs and project settings.

### 5. Player 360 Route-Specific Investigation

| Question | Status | Finding |
|----------|--------|---------|
| Does the issue occur on initial page load only or also on navigation? | [ ] Pending | |
| Is `usePlayer` hook making concurrent requests that could trigger rate limits? | [ ] Pending | |
| Are there any prefetch or preload patterns that increase request volume? | [ ] Pending | |
| Does the Timeline component make additional auth-dependent requests? | [ ] Pending | |
| Is the catch-all route `[[...playerId]]` causing unexpected middleware invocations? | [ ] Pending | |

**Action:** Trace full request lifecycle with verbose logging enabled.

### 6. Logging Enhancement (Pre-Implementation)

Add structured logging to capture transient failure data:

```typescript
// Temporary diagnostic logging (add to middleware.ts)
try {
  const { data } = await supabase.auth.getClaims();
  // ... existing logic
} catch (error) {
  console.error(JSON.stringify({
    event: 'supabase_auth_failure',
    route: request.nextUrl.pathname,
    errorMessage: (error as Error).message,
    errorCode: (error as Error & { cause?: { code?: string } }).cause?.code,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent'),
  }));
  throw error;
}
```

### 7. Comparison Testing

| Test | Status | Result |
|------|--------|--------|
| Does the issue reproduce on local `npm run build && npm start`? | [ ] Pending | |
| Does it reproduce in a different network environment? | [ ] Pending | |
| Does a direct `curl` to Supabase auth endpoint fail intermittently? | [ ] Pending | |
| Does the pit dashboard (`/pit`) exhibit the same behavior? | [ ] Pending | |

**Action:** Reproduce in controlled environment with network monitoring.

---

## Definition of Done

### Phase 1: Investigation (Complete Before Implementation)

- [ ] Diagnostic logging deployed to production
- [ ] Failure frequency baseline established (min 48h of data)
- [ ] DNS resolver configuration documented
- [ ] Deployment environment architecture documented
- [ ] Supabase project region and settings verified
- [ ] Player 360 route request lifecycle traced
- [ ] Root cause hypothesis confirmed or refined

### Phase 2: Implementation

- [ ] `lib/supabase/fetch-with-retry.ts` created with exponential backoff + jitter
- [ ] `lib/supabase/middleware.ts` updated to use retry fetch (maxRetries: 2)
- [ ] `lib/supabase/server.ts` updated to use retry fetch (maxRetries: 3)
- [ ] Unit tests for retry logic (success, retry-then-success, max-retries-exceeded)
- [ ] Structured logging added for retry events

### Phase 3: Validation

- [ ] Retry events appearing in logs (confirms mechanism works)
- [ ] No increase in auth failures post-deployment
- [ ] P95 latency impact measured and acceptable
- [ ] Monitoring dashboard updated to track `supabase_fetch_retry` events
- [ ] Production deployment verified with no regression

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Increased latency on failures | Jitter + low base delay minimizes impact |
| Masking persistent failures | Only retry network errors, not 4xx/5xx |
| Memory pressure from retries | Single retry instance, no parallel retries |
| Middleware timeout exceeded | Lower retry count (2) in middleware path |

---

## Related Documents

- [ADR-015: Connection Pooling Strategy](/docs/adr/ADR-015-connection-pooling-strategy.md)
- [ADR-020: Track A Hybrid RLS Strategy](/docs/adr/ADR-020-track-a-hybrid-strategy.md)
- [PRD-022: Player 360 Navigation Consolidation](/docs/10-prd/PRD-022-player-360-navigation-consolidation.md)
- [PRD-023: Player 360 Panels v0](/docs/10-prd/PRD-023-player-360-panels-v0.md)
- [Supabase SSR Auth Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)

## Affected Files

| File | Role | Investigation Priority |
|------|------|----------------------|
| `middleware.ts` | Session validation | High - primary failure point |
| `lib/supabase/middleware.ts` | Supabase client creation | High - no retry config |
| `lib/supabase/server.ts` | Server component client | Medium - same pattern |
| `app/(dashboard)/players/[[...playerId]]/page.tsx` | Trigger route | Medium - trace entry point |
| `components/player-360/` | UI components | Low - downstream of failure |

---

**Document Version:** 1.1.0
**Last Updated:** 2026-01-26
**Author:** Investigation Agent
**Changelog:**
- v1.1.0: Added trigger route context (Player 360), expanded investigation checklist, phased DoD
