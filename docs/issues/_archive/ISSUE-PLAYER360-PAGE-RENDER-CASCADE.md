# ISSUE: Player 360 Page Render Cascade

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **ID**         | ISSUE-PLAYER360-PAGE-RENDER-CASCADE                       |
| **Status**     | Open                                                      |
| **Severity**   | Medium                                                    |
| **Category**   | Performance / Dev Experience                              |
| **Component**  | Player 360 Dashboard (`/players/[[...playerId]]`)         |
| **Reported**   | 2026-02-02                                                |
| **Related**    | ISSUE-DD2C45CA (separate pit dashboard cascade)           |

---

## Symptom

Navigating to a player page produces 9+ full-page `GET` requests in the Next.js dev server logs:

```
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 88ms  (compile: 44ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 59ms  (compile: 33ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 315ms (compile: 248ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 34ms  (compile: 7ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 918ms (compile: 608ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 75ms  (compile: 42ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 66ms  (compile: 35ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 359ms (compile: 260ms)
GET /players/1df8be36-efbd-48f2-a6b8-8fe84a80c141 200 in 37ms  (compile: 6ms)
```

---

## Investigation

### Ruled Out

| Hypothesis | Verdict | Evidence |
| --- | --- | --- |
| `window.location.reload()` loop | No | Zero occurrences in player-related code |
| `router.refresh()` calls | No | Zero occurrences anywhere in codebase |
| `router.replace()` in a loop | No | Only user-triggered (search selection) |
| Middleware redirect cycle | No | `middleware.ts.bak` — disabled, no active root middleware |
| `revalidatePath` / `revalidateTag` | No | Zero occurrences in `app/` directory |
| Auth redirect loop | No | `layout.tsx:17-19` redirects to `/auth/login` only if `!user`, no cycle |

### Primary Cause: Dev-Mode On-Demand Compilation Cascade

The compile times reveal the pattern — cold starts (608ms), warm hits (248ms), and cache hits (6ms) intermixed. In Next.js App Router dev mode, a single page load generates multiple server requests:

1. **HTML document** — initial browser request
2. **RSC flight data** — App Router fetches React Server Component payload separately
3. **Layout segment compilation** — `(dashboard)/layout.tsx` compiles independently
4. **Page segment compilation** — `[[...playerId]]/page.tsx` compiles independently
5. **Prefetch requests** — Next.js prefetches RSC data for visible Link destinations
6. **HMR module graph updates** — if any file in the import chain was recently modified, webpack revalidates modules and triggers additional compile-and-serve cycles

The `[[...playerId]]` catch-all route nests under `(dashboard)`, creating multiple compilation segments. Each segment can trigger separate dev-server requests.

**In production (`next build && next start`) this reduces to 1-2 requests.** The compile step is eliminated entirely.

### Contributing Factors (real inefficiencies affecting both dev and production)

#### 1. Nine Parallel Queries on Single Component Mount

`timeline-content.tsx:105-197` fires 7 queries simultaneously:

| Hook | File:Line | staleTime | refetchOnWindowFocus |
| --- | --- | --- | --- |
| `useGamingDay()` | `timeline-content.tsx:119` | default | global `false` |
| `usePlayerSummary(playerId, { gamingDay })` | `timeline-content.tsx:129` | 30s | global `false` |
| `usePlayerWeeklySeries(playerId, { timeLens })` | `timeline-content.tsx:136` | default | global `false` |
| `useInfinitePlayerTimeline(playerId, ...)` | `timeline-content.tsx:149` | default | global `false` |
| `useRecentEvents(playerId)` | `timeline-content.tsx:183` | default | global `false` |
| `useAuth()` | `timeline-content.tsx:191` | N/A (useState) | N/A |
| `useGamingDaySummary(...)` | `timeline-content.tsx:192` | 15s | **`true` (override)** |

Plus the header adds 2 more:

| Hook | File:Line |
| --- | --- |
| `usePlayer(playerId)` | `player-360-header-content.tsx:79` |
| `useQuery` (enrollment) | `player-360-header-content.tsx:82` |

Each hook resolution triggers a React re-render of the component tree. With 9 hooks, the `TimelinePageContent` component re-renders at minimum 9 times as data streams in asynchronously.

#### 2. Duplicate `usePlayer` Hook

Both `Player360ContentWrapper` and `Player360HeaderContent` independently call `usePlayer(playerId)`:

- `player-360-content-wrapper.tsx:37` — uses `data: player` for `addRecent`
- `player-360-header-content.tsx:79` — uses `data: player` for identity display

TanStack Query deduplicates the network request (same query key), but the double subscription still produces redundant render notifications.

#### 3. `addRecent` Always Mutates State

```typescript
// player-360-content-wrapper.tsx:41-46
useEffect(() => {
  if (player) {
    const fullName = `${player.first_name} ${player.last_name}`.trim();
    addRecent(playerId, fullName);
  }
}, [player, playerId, addRecent]);
```

`addRecent` (`empty-states.tsx:446-454`) generates a fresh `viewedAt: new Date().toISOString()` on every call, producing a new `recentPlayers` array even when the player is already first in the list. This triggers an unnecessary render of the content wrapper and its entire subtree.

#### 4. `useGamingDaySummary` Overrides Global `refetchOnWindowFocus`

The global TanStack Query config sets `refetchOnWindowFocus: false` (`lib/query/client.ts:101`), but `useGamingDaySummary` (`hooks/mtl/use-gaming-day-summary.ts:86`) overrides with `refetchOnWindowFocus: true`. Tab-switching triggers an extra refetch cycle on this page.

---

## Impact

- **Dev experience**: 9 log entries per navigation make server logs noisy and obscure real issues
- **Render efficiency**: 9+ re-render passes per mount; each pass re-evaluates the full `TimelinePageContent` render tree (~400 lines of JSX with multiple conditional branches)
- **Network**: 9 parallel Supabase queries per page load (client-side, not page GETs)

---

## Affected Files

| File | Lines | Role |
| --- | --- | --- |
| `app/(dashboard)/players/[[...playerId]]/page.tsx` | 31-49 | Server component, catch-all route |
| `app/(dashboard)/players/[[...playerId]]/_components/player-360-content-wrapper.tsx` | 33-82 | Client wrapper, duplicate `usePlayer`, `addRecent` |
| `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx` | 105-197 | 7 parallel hooks on mount |
| `components/player-360/header/player-360-header-content.tsx` | 63-166 | Duplicate `usePlayer`, 2 more queries |
| `components/player-360/empty-states.tsx` | 446-454 | `addRecent` always mutates |
| `hooks/mtl/use-gaming-day-summary.ts` | 86 | `refetchOnWindowFocus: true` override |
| `lib/query/client.ts` | 95-104 | Global query defaults |

---

## Suggested Remediation

### P1: Consolidate Duplicate `usePlayer` Hook

Lift the `usePlayer(playerId)` call to `Player360ContentWrapper` and pass the result as a prop to `Player360HeaderContent`. Removes one subscription and one render notification path.

### P2: Guard `addRecent` Against No-Op Updates

```typescript
// empty-states.tsx — addRecent
const addRecent = React.useCallback((id: string, name: string) => {
  setRecentPlayers((prev) => {
    if (prev[0]?.id === id) return prev;  // Already first — skip update
    const filtered = prev.filter((p) => p.id !== id);
    const updated = [
      { id, name, viewedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX_RECENT);
    return updated;
  });
}, []);
```

Returning `prev` unchanged avoids a state update and downstream re-render.

### P3: Remove `refetchOnWindowFocus` Override on Compliance Hook

Align `useGamingDaySummary` with the global default (`false`), or scope the override to the shift dashboard where it was intended. The Player 360 page does not need tab-switch refetching for compliance data.

### P4: Consider Colocating Summary Data

The 7 parallel hooks in `TimelinePageContent` could be reduced by combining related queries (e.g., `usePlayerSummary` + `useRecentEvents` share the same data source in `getPlayerSummary`). A single orchestrator hook would produce 1 render notification instead of 2.

---

## Relationship to Other Issues

- **ISSUE-DD2C45CA** — Separate cascade on pit dashboard (`/pit`), caused by N×2 rating-slip fetch pattern in `useDashboardTables`. Different page, different root cause.
- **ISSUE-CASH-VELOCITY-METRIC-AMBIGUITY** — The cash velocity tile rendered by this page has a separate metric accuracy issue.
- **ISSUE-580A8D81** — Prior investigation into Player Dashboard data flow gaps and auth retry storm.

---

**Document Version:** 1.0.0
**Last Updated:** 2026-02-02
