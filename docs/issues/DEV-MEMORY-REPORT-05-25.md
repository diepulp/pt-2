**Dev Memory Report**
- Culprit process: `next-server (v16.2.2)` on port `3000`, PID `192767`.
- Peak observed: ~`6.0 GB` RSS, with ~`5.95 GB` private anonymous memory and ~`662 MB` swap.
- Idle behavior: sampled for ~30s after route activity; RSS stabilized around `5.9 GB`, so I did not observe an active runaway leak in that window.
- Dev trace: `.next/dev/trace` shows heavy on-demand webpack compilation, especially `/players/[[...playerId]]`, `/api/v1/rating-slips/[id]/modal-data`, `/api/v1/tables/[tableId]/current-session`, and `/api/v1/mtl/gaming-day-summary`.
- Logs: `.next/dev/logs/next-development.log` shows compile churn plus repeated RLS info logs, but no repeating runtime error loop.

**Likely Drivers**
- Sentry is enabled locally via `.env`, so dev loads `@sentry/nextjs` and OpenTelemetry. The largest server vendor chunks are `@sentry.js` at ~`24 MB` and `@opentelemetry.js` at ~`16 MB`, and they contribute to a very large retained dev compiler graph.
- The Player 360 route emits repeated client entries with ~`33` modules per entry, pulling many dashboard/player components into dev compilation.
- `app/providers.tsx` imports `HeroUIProvider` globally and always mounts React Query Devtools, which broadens the app-wide client graph.
- Real leak candidate: [lib/rate-limiter.ts](/home/diepulp/projects/pt-2/lib/rate-limiter.ts:161) starts a top-level `setInterval` at module load without HMR protection. This is not the 6 GB culprit by itself, but it is a genuine dev hot-reload resource leak pattern.

**Current Patch**
I already made a provisional patch before your interruption; no further changes were made after you asked for review first.

- [next.config.ts](/home/diepulp/projects/pt-2/next.config.ts:9) gates Sentry wrapping unless production, CI, or `ENABLE_SENTRY_IN_DEV=true`.
- [instrumentation.ts](/home/diepulp/projects/pt-2/instrumentation.ts:3) avoids importing Sentry instrumentation in normal local dev.
- [lib/rate-limiter.ts](/home/diepulp/projects/pt-2/lib/rate-limiter.ts:28) makes the cleanup interval singleton/HMR-safe.

Validation Result

  - npm run type-check failed, but not from this patch.
  - Blocking errors are existing @react-pdf/renderer module resolution failures in report PDF files, plus implicit any in report-footer.tsx.
  - git diff --check passed for the touched files.

  Efficacy

  - Before patch: next-server stabilized around 5.9 GB RSS with ~650 MB swap.
  - After patch restart: initially stabilized around 4.45 GB RSS with 0 swap.
  - Later after more route/global-error activity: climbed back to ~5.4 GB RSS.

  So the patch helped, but it did not fully solve the dev memory problem.

  Why Not Fully

  - Logs still show Sentry/OpenTelemetry being compiled:
      - @sentry/nextjs warnings: 46
      - @opentelemetry warnings: 230
      - traces through app/global-error.tsx: 21
  - Root cause: app/global-error.tsx:3 still has a top-level import * as Sentry from '@sentry/nextjs';, so even with config/instrumentation gated, the dev compiler still pulls Sentry and OpenTelemetry.

  

  All three investigations complete. Compiling the consolidated findings report.

---

## Dev Memory Findings Report — 2026-05-25

### Executive Summary

Three parallel audits confirm the dev server memory problem has **four independent root causes** remaining after the current patch. The Sentry config gate was necessary but insufficient because a client-side import in `app/global-error.tsx` bypasses it entirely. HeroUI is a fully vestigial dependency — all components migrated to shadcn, only the provider wrapper remains. The Player 360 route has a structural bundle problem that is the primary cause of the ~33 modules/entry compilation overhead.

---

### Finding 1 — `app/global-error.tsx:3` — Sentry bypass (CRITICAL)

**File:** `app/global-error.tsx:3`
**Issue:** Top-level `import * as Sentry from '@sentry/nextjs'` bypasses the `next.config.ts` Sentry gating. The config gate prevents the _server wrapper_, but this client-side module import pulls `@sentry/nextjs` + the full OpenTelemetry tree into the dev compiler on every hot-reload.
**Evidence:** Post-patch logs still show 46 Sentry warnings and 230 OpenTelemetry warnings, and 21 traces through this file.
**Fix:** Replace the static import with a lazy load inside the error handler:

```tsx
// app/global-error.tsx — remove line 3 static import
// In the error reporting callback:
const Sentry = await import('@sentry/nextjs');
Sentry.captureException(error);
```

**Estimated impact:** 200–300 MB RSS reduction.

---

### Finding 2 — `lib/errors/rate-limiter.ts:121` — Second HMR leak (HIGH)

**File:** `lib/errors/rate-limiter.ts:121`
**Issue:** A second `RateLimiter` class (separate from `lib/rate-limiter.ts`) creates a `setInterval` in its constructor without `.unref()` or a singleton guard. Every HMR cycle creates a new instance; stale intervals accumulate indefinitely.
**Fix:** Mirror the pattern already applied in `lib/rate-limiter.ts` — add `.unref()` after `setInterval` and wrap instantiation in a `Symbol.for` global singleton guard.
**Estimated impact:** Eliminates compounding interval leak; prevents memory climb over long dev sessions.

---

### Finding 3 — `app/providers.tsx` — ReactQueryDevtools always bundled (HIGH)

**File:** `app/providers.tsx:28` (approximately)
**Issue:** `<ReactQueryDevtools initialIsOpen={false} />` is unconditionally imported and mounted. Even though it doesn't open by default, the full devtools bundle is included in every page's client graph.
**Fix:**
```tsx
{process.env.NODE_ENV === 'development' && (
  <ReactQueryDevtoolsDynamic initialIsOpen={false} />
)}
// where ReactQueryDevtoolsDynamic = dynamic(() => import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools })), { ssr: false })
```
**Estimated impact:** 150–200 MB RSS reduction.

---

### Finding 4 — HeroUI is fully vestigial (MEDIUM, easy win)

**Root cause of presence:** HeroUI was added in October 2025 for the initial landing page launch. All HeroUI components have since been migrated to shadcn equivalents. Only `HeroUIProvider` remains in `app/providers.tsx`, wrapping the provider tree with a `navigate={router.push}` prop that Next.js 16 never uses.

**Current state:**
- `@heroui/react` is in `package.json` but **zero component files** import from it
- The `hero.mjs` Tailwind plugin is explicitly disabled
- No HeroUI CSS variables appear anywhere

| HeroUI item          | Status                      | Shadcn equivalent            |
| -------------------- | --------------------------- | ---------------------------- |
| `HeroUIProvider`     | Wrapping providers.tsx only | Not needed — remove entirely |
| All other components | Not imported anywhere       | Fully migrated               |

**Fix:** One PR: remove `@heroui/react` from `package.json`, delete the `HeroUIProvider` import and wrapper from `app/providers.tsx`.
**Estimated impact:** ~800 KB bundle, removes Framer Motion from the compile graph, reduces provider tree depth.

---

### Finding 5 — Player 360 route structural bundle problem (MEDIUM, higher effort)

**Root cause of ~33 modules/entry:** The route has no lazy loading boundaries and no server component boundaries on inner panels.

| Issue                                                                      | File                                                            | Fix                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Barrel index exports ~40+ components; webpack resolves all                 | `components/player-360/index.ts:1-137`                          | Import directly from sub-paths instead of the barrel             |
| `PlayerEditModal` imported unconditionally, pulls `react-hook-form` + zod  | `components/player-360/header/player-360-header-content.tsx:24` | `next/dynamic` with `ssr: false`                                 |
| All 5 timeline panels imported statically                                  | `timeline-content.tsx:32-36`                                    | `next/dynamic` for below-fold panels                             |
| `Player360Shell` is `'use client'` — pulls all children into client bundle | `player-360-content-wrapper.tsx:10`                             | Push `'use client'` boundary down to leaf interactive components |
| `useRecentPlayers` fires unconditionally including on empty state          | `empty-states.tsx:424`                                          | Move inside the branch that needs it                             |

**Note:** Recharts is already correctly deferred via `next/dynamic`. That pattern needs to be applied to the remaining heavy panels.

---

### Prioritized Action Plan

| Priority | Action                                            | File                                                             | Est. Impact                 |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| P0       | Lazy-load Sentry in `global-error.tsx`            | `app/global-error.tsx:3`                                         | 200–300 MB                  |
| P0       | Fix second rate-limiter HMR leak                  | `lib/errors/rate-limiter.ts:121`                                 | Interval leak               |
| P1       | Lazy-load ReactQueryDevtools                      | `app/providers.tsx:28`                                           | 150–200 MB                  |
| P1       | Remove HeroUI entirely                            | `package.json`, `app/providers.tsx`                              | 800 KB + Framer Motion      |
| P2       | Player 360 barrel → direct imports                | `components/player-360/index.ts`                                 | 33→~15 modules/entry        |
| P2       | Lazy-load PlayerEditModal, timeline panels        | `player-360-header-content.tsx:24`, `timeline-content.tsx:32-36` | Compile-time savings        |
| P3       | Push `'use client'` boundaries down in Player 360 | `player-360-content-wrapper.tsx:10`                              | Server-side rendering gains |

P0 and P1 items are low-risk, surgical fixes. P0 alone should drop the post-activity peak from ~5.4 GB back toward the 4.45 GB floor seen after the initial patch restart. Removing HeroUI (P1) is zero-risk since no components use it. The Player 360 refactor (P2–P3) requires testing against the dashboard golden path but has the highest long-term benefit.
