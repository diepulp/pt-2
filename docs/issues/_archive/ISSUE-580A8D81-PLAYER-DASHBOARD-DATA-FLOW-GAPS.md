# ISSUE-580A8D81: Player Dashboard Data Flow Gaps

**Status:** Open
**Severity:** Critical
**Category:** Auth / Data Flow / UX
**Created:** 2026-02-02
**Related Service:** Player360DashboardService, PlayerTimelineService, PlayerFinancialService
**Tags:** auth-expiry, gaming-day, retry-storm, RLS, data-flow, player-360

---

## Executive Summary

The Player 360 dashboard for player "Nikson Bell" (`1df8be36-efbd-48f2-a6b8-8fe84a80c141`) displays zeros in all session summary panels (session value, cash velocity) and quick filter tiles (financial, session) despite having an active visit with 5 buy-in transactions totaling $90,000. Simultaneously, the page enters a continuous re-query and reload loop that causes visual distortions.

**Three independent root causes identified:**

| # | Root Cause | Severity | Category |
|---|-----------|----------|----------|
| 1 | Expired JWT session (Dec 2025) with no auto-redirect to login | Critical | Auth |
| 2 | Gaming day mismatch: query filters `2026-02-02`, data is on `2026-02-01` | High | Data Flow |
| 3 | React Query retry storm + `window.location.reload()` on error | Medium | UX / Resilience |

---

## Database Verification (Service Role, Bypasses RLS)

Confirmed via Supabase MCP `execute_sql`:

| Check | Result |
|-------|--------|
| Active visits | **1** (started 2026-02-02 07:44 UTC, `gaming_identified_rated`) |
| Total visits | **1** |
| Financial transactions (all time) | **5** |
| Financial transactions (gaming_day=2026-02-02) | **0** |
| Financial transactions (gaming_day=2026-02-01) | **5** |
| Staff record (Marcus Thompson) | **active**, pit_boss, casino `ca000000-...0001` |

**Transaction detail (all on gaming_day=2026-02-01):**

| Amount | Direction | Created At |
|--------|-----------|------------|
| $50,000 | in | 2026-02-02 07:53:29 UTC |
| $60,000 | in | 2026-02-02 07:53:36 UTC |
| -$50,000 | in | 2026-02-02 07:54:15 UTC |
| $10,000 | in | 2026-02-02 09:36:33 UTC |
| $20,000 | in | 2026-02-02 09:36:58 UTC |

---

## Root Cause #1: Expired Auth Session (Critical)

### Evidence

Chrome DevTools network capture shows:

- **Token refresh failure (400):** POST `/auth/v1/token?grant_type=refresh_token` returns 400
- **API route failures (401):**
  - `GET /api/v1/players/{id}` -> `{"ok":false,"code":"UNAUTHORIZED","error":"Authentication required"}`
  - `GET /api/v1/players/{id}/identity` -> 401
  - `GET /api/v1/players/{id}/enrollment` -> 401
  - `GET /api/v1/casino/gaming-day` -> 401
- **RPC failure (400 P0001):**
  - `POST /rest/v1/rpc/rpc_get_player_timeline` -> `{"code":"P0001","message":"UNAUTHORIZED: staff identity not found"}`
- **Client-side Supabase REST (200 but empty):**
  - `GET /rest/v1/visit?...&ended_at=is.null` -> `[]` (RLS filters out rows since `auth.uid() IS NOT NULL` fails)
  - `GET /rest/v1/player_financial_transaction?...&gaming_day=eq.2026-02-02` -> `[]`

### JWT Analysis

The auth cookie contains a JWT with `exp: 1765774086` (approximately Dec 15, 2025). The token is 7+ weeks expired. The refresh token (`vbwi4rxuxdb3`) also fails, confirming the entire session is invalidated.

### Auth Request Flow

```
Browser (expired JWT in cookie)
  -> /api/v1/players/{id}          -> 401 (server-side auth check fails)
  -> Supabase REST (anon key)      -> 200 [] (RLS: auth.uid() IS NOT NULL = false)
  -> Supabase RPC                  -> 400 P0001 (set_rls_context_from_staff() fails)
  -> POST /auth/v1/token?refresh   -> 400 (refresh token invalid)
```

### Missing Safeguard

No middleware or client-side guard redirects to `/login` when the session is expired. The dashboard continues to render with empty/error states instead of forcing re-authentication.

---

## Root Cause #2: Gaming Day Mismatch (High)

### Location

`services/player360-dashboard/mappers.ts:133-135`

### Code

```typescript
export function getCurrentGamingDay(): string {
  return new Date().toISOString().slice(0, 10);  // UTC date
}
```

### Problem

- `getCurrentGamingDay()` returns `2026-02-02` (UTC date)
- All 5 financial transactions have `gaming_day = 2026-02-01`
- The query at `services/player360-dashboard/crud.ts:110-112` filters:

```typescript
.from("player_financial_transaction")
.select("amount, direction, created_at")
.eq("player_id", playerId)
.eq("gaming_day", currentGamingDay)  // 2026-02-02 -> 0 rows
```

- `financialSummary` becomes `null` (line 211-224)
- `mapToSessionValue()` at `mappers.ts:170-176` returns zeros:

```typescript
if (!financialSummary) {
  return { netWinLoss: 0, theoEstimate: 0, lastActionAt: new Date().toISOString(), trendPercent: 0 };
}
```

- `mapToCashVelocity()` at `mappers.ts:215-220` returns zeros:

```typescript
if (!financialSummary) {
  return { ratePerHour: 0, sessionTotal: 0, lastBuyInAt: new Date().toISOString() };
}
```

### Why the Mismatch Exists

The `gaming_day` column on financial transactions is set to `2026-02-01` because the casino gaming day likely runs past midnight (e.g., gaming day ends at 6 AM). Transactions created at 07:53 UTC on Feb 2 still belong to the Feb 1 gaming day. But `getCurrentGamingDay()` uses UTC calendar date, not the casino's gaming day boundary.

The `/api/v1/casino/gaming-day` endpoint (which would return the correct gaming day) returns 401 due to Root Cause #1, so the client falls back to `getCurrentGamingDay()`.

---

## Root Cause #3: Re-query Storm and Reload Loop (Medium)

### Retry Storm

**No retry suppression on auth-dependent queries:**

| Hook | File | Line | Issue |
|------|------|------|-------|
| `usePlayerSummary` | `hooks/player-360/use-player-summary.ts` | 79-84 | No `retry` config, defaults to 3 retries |
| `useInfinitePlayerTimeline` | `hooks/player-timeline/use-player-timeline.ts` | 187-217 | No `retry` config, defaults to 3 retries |

`getPlayerSummary()` at `services/player360-dashboard/crud.ts` calls `rpc_get_player_timeline` inside a `Promise.all()` with 4 other queries. Each retry re-fires all 5 queries. Combined with the timeline infinite query hook, this produces **9+ failed RPC calls** in rapid succession.

### Hard Reload on Error

`app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx:378`:

```typescript
onRetry={() => window.location.reload()}
```

When `GroupedTimeline` renders with `isError=true` (from the timeline RPC failure), clicking retry triggers a full page reload. This reinitializes all React Query hooks, which fail again due to the same auth issue, creating a reload cycle.

### HMR Compounds the Problem

In dev mode, Webpack HMR updates (observed at reqids 39, 49, 58) trigger component re-mounts that re-fire all queries, amplifying the request storm.

### Network Capture Evidence

38 fetch/XHR requests captured in a single page load:

- `rpc_get_player_timeline`: **10 calls** (all failed - 400)
- `visit` query: **3 calls** (all returned `[]`)
- `player_financial_transaction` query: **3 calls** (all returned `[]`)
- `player_loyalty` query: **3 calls** (all returned `[]`)
- `/api/v1/players/{id}`: **3 calls** (all 401)
- `/api/v1/casino/gaming-day`: **3 calls** (all 401)
- `/api/v1/players/{id}/identity`: **2 calls** (all 401)
- `/api/v1/players/{id}/enrollment`: **2 calls** (all 401)

---

## Visual Evidence

Screenshot captured via Chrome DevTools shows:

- Header: **"Failed to load player"** (red text)
- Summary band: **"Failed to load summary: UNAUTHORIZED: staff identity not found"** (red banner)
- Activity chart: **Empty** (no visits/rewards rendered)
- LAST BUY-IN / LAST REWARD / LAST NOTE: all show **"--"**
- Bottom: **"Failed to load timeline"** with warning icon
- Breadcrumb: Shows **raw UUID** instead of player name

---

## Affected Files Summary

| File | Lines | Gap |
|------|-------|-----|
| `services/player360-dashboard/mappers.ts` | 133-135 | `getCurrentGamingDay()` uses UTC, not casino TZ |
| `services/player360-dashboard/crud.ts` | 110-112 | Gaming day filter excludes previous-day transactions |
| `services/player360-dashboard/mappers.ts` | 170-176 | `mapToSessionValue()` returns zeros silently |
| `services/player360-dashboard/mappers.ts` | 215-220 | `mapToCashVelocity()` returns zeros silently |
| `hooks/player-360/use-player-summary.ts` | 79-84 | No `retry: false` for auth-dependent query |
| `hooks/player-timeline/use-player-timeline.ts` | 187-217 | No `retry: false` for auth-dependent query |
| `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx` | 378 | `window.location.reload()` on error creates reload loop |
| Auth middleware | -- | No redirect to `/login` on expired session |

---

## Recommended Fixes

### P0: Auth Session Recovery
- Add middleware or client-side guard that detects expired/invalid sessions and redirects to `/login`
- Ensure token refresh failure triggers a clean re-authentication flow

### P1: Gaming Day Resolution
- Use the casino gaming day from `/api/v1/casino/gaming-day` as the authoritative source
- Fall back to `getCurrentGamingDay()` only when the API is unavailable
- Consider deriving gaming day from the visit's `started_at` rather than the current calendar date

### P2: Retry & Error Resilience
- Add `retry: false` (or `retry: (failureCount, error) => !isAuthError(error)`) to all auth-dependent React Query hooks
- Replace `window.location.reload()` with a proper re-authentication redirect or React Query `refetch()`
- Add error boundary that distinguishes auth errors from data errors and routes appropriately

### P3: UX for Empty States
- Mappers should return a distinguishable "no data" state instead of zeros when `financialSummary` is null
- Components should show "No activity today" rather than "$0" when there are no transactions for the current gaming day
