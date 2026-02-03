# PERF-006: Player 360 Render Cascade — Comprehensive Performance, QA & Accessibility Audit

**Status:** Open
**Severity:** Critical
**Category:** Performance / Accessibility / Quality / Architecture
**Created:** 2026-02-02
**Investigation Method:** 3 parallel analysis agents (performance-engineer, qa-specialist, web-design-guidelines)
**Builds On:** [ISSUE-PLAYER360-PAGE-RENDER-CASCADE](../ISSUE-PLAYER360-PAGE-RENDER-CASCADE.md)

---

## Executive Summary

This report synthesizes findings from **3 independent audit streams** examining the Player 360 dashboard (`/players/[[...playerId]]`) — the primary player investigation surface used by pit bosses. Each stream analyzed the same codebase from a different lens: render performance, quality/reliability, and web design guideline compliance.

**Key numbers:**
- **28 unique findings** (deduplicated across all streams)
- **10-12 React re-renders** on every cold mount (production, not dev-only)
- **9 parallel Supabase RPC calls** per page navigation
- **Zero `React.memo` boundaries** in the entire component tree
- **Zero error boundaries** in the entire player route tree
- **7 icon-only buttons** missing `aria-label` (WCAG 2.1 AA violation)
- **~480KB** eager Recharts import in client bundle
- **Cross-player state leak** via unscoped Zustand filter store

### Cross-Audit Consensus Matrix

| Finding | Perf | QA | WDG | Consensus |
|---------|:----:|:--:|:---:|-----------|
| No error boundaries | X | X | X | **3/3** |
| Duplicate/triple `usePlayer` hook | X | X | | **2/3** |
| `addRecent` always mutates state | X | X | | **2/3** |
| `useGamingDaySummary` overrides globals | X | X | | **2/3** |
| Missing `aria-label` on icon buttons | | | X | **1/3** (a11y-only) |
| Zustand store cross-player leak | X | X | | **2/3** |
| No playerId UUID validation | | X | | **1/3** (QA-only) |
| Zero test coverage on orchestration layer | | X | | **1/3** (QA-only) |
| Search dropdown lacks listbox ARIA | | X | X | **2/3** |
| `prefers-reduced-motion` not respected | | | X | **1/3** (a11y-only) |

---

## Affected Files

| File | Lines | Role |
|------|-------|------|
| `app/(dashboard)/players/[[...playerId]]/page.tsx` | 31-49 | Server component, catch-all route |
| `app/(dashboard)/players/[[...playerId]]/_components/player-360-content-wrapper.tsx` | 33-82 | Client wrapper, duplicate `usePlayer`, `addRecent` |
| `app/(dashboard)/players/[[...playerId]]/_components/player-360-shell.tsx` | 20-55 | Layout shell, exposes `data-player-id` |
| `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx` | 105-212 | **Main bottleneck**: 7 hooks, 440-line JSX |
| `components/player-360/header/player-360-header-content.tsx` | 63-454 | Header, search, enrollment, edit modal, duplicate `usePlayer` |
| `components/player-360/empty-states.tsx` | 446-454 | `addRecent` always mutates |
| `components/player-360/timeline/grouped-timeline.tsx` | 1-320 | Infinite scroll, no `React.memo` |
| `components/player-360/charts/activity-chart.tsx` | 12-22 | Eager Recharts import (~480KB) |
| `components/player-360/layout.tsx` | 1-250 | 3-panel layout, nested `<main>` |
| `components/player-dashboard/player-edit-modal.tsx` | 37 | 3rd `usePlayer` subscription, always mounted |
| `hooks/mtl/use-gaming-day-summary.ts` | 73-89 | `refetchOnWindowFocus: true`, `refetchInterval: 60s` |
| `hooks/player-360/use-timeline-filter.ts` | 139-158 | Zustand without selectors, no per-player scope |
| `hooks/use-auth.ts` | 54-101 | Per-mount auth subscription |
| `lib/query/client.ts` | 95-104 | Global query defaults |

---

## P0 — Critical Issues

### P0-1: No Error Boundary in Entire Player Route Tree (3/3 consensus)

**Confirmed by:** Performance, QA, Web Design

**Files:** No `error.tsx` exists at any level under `app/(dashboard)/players/`

A single `<Suspense>` boundary at `page.tsx:40` catches loading states only. Any uncaught exception from the 9+ hooks, malformed API response, or null dereference crashes the entire page with no recovery UI. Users see a white screen or root error page.

**Impact:** 100% page failure on any panel error. No graceful degradation. No correlation ID for support escalation.

**Remediation:** Add `error.tsx` at `app/(dashboard)/players/[[...playerId]]/error.tsx` with retry capability. Additionally wrap each panel (`LeftRail`, `Center`, `RightRail`) with per-panel error boundaries using the existing `ErrorState` component.

---

### P0-2: Zustand Filter Store Cross-Player State Leak (2/3 consensus)

**Confirmed by:** Performance, QA

**File:** `hooks/player-360/use-timeline-filter.ts:81-97`

`useTimelineFilterStore` is a global Zustand singleton with no per-player scoping. Navigating from Player A (filtered to `activeCategory: 'financial'`) to Player B retains the filter. Player B's timeline loads pre-filtered to financial events — misleading and confusing.

No mechanism resets the store when `playerId` changes. No `useEffect` in `TimelinePageContent` or `Player360ContentWrapper` calls `clearFilter()` on navigation.

**Impact:** Users see incorrect data presentation when switching between players.

**Reproduction:**
1. Navigate to `/players/player-a-uuid`
2. Click "Financial" filter tile
3. Navigate to `/players/player-b-uuid`
4. Observe: timeline shows only financial events, not all events

**Remediation:** Add a `useEffect` in `Player360ContentWrapper` that calls `clearFilter()` when `playerId` changes:

```typescript
useEffect(() => {
  clearFilter();
}, [playerId, clearFilter]);
```

---

### P0-3: 10-12 Re-Renders on Cold Mount (2/3 consensus)

**Confirmed by:** Performance (S1), QA (H-2, H-3)

**File:** `timeline-content.tsx:105-212`

`TimelinePageContent` subscribes to 7 TanStack Query hooks + Zustand + Context. The parent and header add 4 more subscriptions. Each async resolution triggers a full re-render of the 440-line JSX tree. Zero `React.memo` boundaries exist in the entire component tree.

**Minimum re-render sequence on cold mount:**

| # | Trigger | Cascade Effect |
|---|---------|----------------|
| 1 | Initial render (all loading) | — |
| 2 | `useAuth()` resolves | `casinoId` available |
| 3 | `useGamingDay()` resolves | `gamingDay` changes → `usePlayerSummary` key invalidated |
| 4 | `usePlayerSummary` starts refetch | Loading state toggles |
| 5 | `usePlayerWeeklySeries` resolves | Chart data available |
| 6 | `useInfinitePlayerTimeline` resolves | Timeline cards available |
| 7 | `useRecentEvents` resolves | Events strip available |
| 8 | `usePlayerSummary` resolves (2nd) | `summaryData.gamingDay` changes → `useGamingDaySummary` key invalidated |
| 9 | `useGamingDaySummary` starts refetch | Loading state toggles |
| 10 | `useGamingDaySummary` resolves | Compliance data available |

**Production impact:** YES — all async resolutions happen in production. The 9+ dev-server GET requests are a red herring (Next.js on-demand compilation). The real problem is 10-12 client-side React re-renders × full tree depth = hundreds of wasted component renders.

**Remediation:** Split `TimelinePageContent` into isolated panel components with their own subscriptions. Add `React.memo` to `GroupedTimeline`, `ActivityChart`, `SummaryBand`, `FilterTileStack`, `CompliancePanel`.

---

### P0-4: 7 Icon-Only Buttons Missing `aria-label` (1/3 — a11y-critical)

**Confirmed by:** Web Design

**Files and lines:**

| Button | File | Line |
|--------|------|------|
| Back (`<ArrowLeft>`) | `player-360-header-content.tsx` | 199-208 |
| Favorite (`<Star>`/`<StarOff>`) | `player-360-header-content.tsx` | 397-410 |
| Share (`<Share2>`) | `player-360-header-content.tsx` | 418-429 |
| Search clear (`<X>`) | `player-360-header-content.tsx` | 295-301 |
| Empty state search clear (`<X>`) | `empty-states.tsx` | 634-639 |
| Add note (compact) | `header/add-note-button.tsx` | 57-68 |
| Issue reward (compact) | `header/issue-reward-button.tsx` | 57-69 |

Additionally, both search `<input>` elements (`player-360-header-content.tsx:280`, `empty-states.tsx:616`) lack `aria-label` or associated `<label>`. Placeholder text alone does not satisfy WCAG 2.1 AA.

**Impact:** Screen reader users cannot identify or use these controls. WCAG 2.1 AA violation.

**Remediation:** Add `aria-label` to each button (e.g., `aria-label="Go back"`, `aria-label="Add to favorites"`, `aria-label="Share player link"`, `aria-label="Clear search"`). Add `aria-label="Search players"` to both search inputs.

---

## P1 — High Severity Issues

### P1-1: Gaming-Day Waterfall Creates Cascading Refetches

**Source:** Performance (S2)

**File:** `timeline-content.tsx:119-197`

3-step data dependency chain:

```
useGamingDay() → gamingDay
    ↓
usePlayerSummary(playerId, { gamingDay }) → summaryData
    ↓
useGamingDaySummary({ gamingDay: summaryData?.gamingDay ?? gamingDay })
```

`getCurrentGamingDay()` provides a synchronous client-side fallback (line 120). When the server-authoritative value resolves, query keys change, triggering cascading refetches.

**Impact:** 2-3 extra network requests per page load. 4-6 extra re-renders from the cascade.

**Remediation:** Compute `gamingDay` server-side in `page.tsx` RSC and pass as prop. Eliminates the `useGamingDay()` hook and the entire cascade.

---

### P1-2: Triple `usePlayer` Subscription

**Source:** Performance (S3), QA (H-2)

**Files:**
- `player-360-content-wrapper.tsx:37` — uses `player` for `addRecent()` only
- `player-360-header-content.tsx:79` — uses `player` for identity display
- `player-edit-modal.tsx:37` — uses `player` for edit form (always mounted)

TanStack Query deduplicates the network request, but 3 subscriptions create 3 independent render notification paths. The `PlayerEditModal` subscription is especially wasteful since it's always mounted even when `open={false}`.

**Impact:** 3 redundant render notifications per query state change.

**Remediation:**
1. Lift `usePlayer(playerId)` to `Player360ContentWrapper`, pass result as prop
2. Conditionally render `PlayerEditModal`: `{editModalOpen && <PlayerEditModal ... />}`

---

### P1-3: `addRecent` Always Mutates State

**Source:** Performance (S4), QA (H-3)

**File:** `empty-states.tsx:446-454`

```typescript
const addRecent = React.useCallback((id: string, name: string) => {
  setRecentPlayers((prev) => {
    const filtered = prev.filter((p) => p.id !== id);
    const updated = [
      { id, name, viewedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX_RECENT);
    return updated;   // Always a new array, never returns prev
  });
}, []);
```

Always creates a new `Date().toISOString()` and new array even when the player is already first. Triggers unnecessary state update → re-render of `Player360ContentWrapper` subtree → unnecessary `localStorage.setItem`.

**Impact:** 1-3 unnecessary state mutations per page load.

**Remediation:**

```typescript
const addRecent = React.useCallback((id: string, name: string) => {
  setRecentPlayers((prev) => {
    if (prev[0]?.id === id) return prev; // Already first — skip
    const filtered = prev.filter((p) => p.id !== id);
    return [
      { id, name, viewedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX_RECENT);
  });
}, []);
```

---

### P1-4: `useGamingDaySummary` Overrides Global Query Defaults

**Source:** Performance (S5), QA (H-4)

**File:** `hooks/mtl/use-gaming-day-summary.ts:86-88`

```typescript
refetchOnWindowFocus: true,   // overrides global false
refetchInterval: 60_000,      // polls every 60 seconds
```

Designed for the compliance dashboard but bleeds into Player 360. Every tab switch triggers an extra refetch. Polls indefinitely even when the compliance tab is not visible.

**Impact:** 1 extra Supabase RPC call every 60s while page is open. 1 extra refetch on every tab switch. Each triggers a re-render of the entire `TimelinePageContent` subtree.

**Remediation:** Remove defaults from the hook. Let callers opt in: `useGamingDaySummary(filters, { polling: true })`.

---

### P1-5: No PlayerId UUID Validation

**Source:** QA (H-1)

**Files:**
- `page.tsx:34` — raw segment extracted
- `hooks/player/use-player.ts:36` — `enabled: !!playerId` only checks truthiness

The catch-all route passes `playerIdSegments?.[0]` directly to all hooks and API calls without UUID format validation. Non-UUID strings like `not-a-uuid`, `../../admin`, or `<script>` reach Supabase RPC calls.

**Impact:** Unnecessary network requests with invalid IDs. Error messages may leak internal details.

**Remediation:** Validate `playerId` as UUID format before enabling queries. Show "Invalid player ID" for malformed URLs.

---

### P1-6: Zero Test Coverage on Orchestration Layer

**Source:** QA (H-5)

**Files with zero tests:**

| File | Lines | Role |
|------|-------|------|
| `timeline-content.tsx` | 440 | Main orchestrator, 7 hooks |
| `player-360-content-wrapper.tsx` | 82 | State coordination |
| `player-360-header-content.tsx` | 454 | Search, enrollment, edit modal |
| `grouped-timeline.tsx` | 320 | Infinite scroll, filtering |
| `empty-states.tsx` | 828 | `useRecentPlayers`, search flow |

Tested components (SummaryBand, FilterTile, Breadcrumb) are pure presentational. The critical orchestration layer is entirely untested. E2E tests use tautological assertions (`if (visible) { expect(visible) }`) that pass vacuously.

**Impact:** No regression safety net for the most complex code paths.

**Remediation:** Add integration tests for `TimelinePageContent` (mock hooks, verify render count), `Player360ContentWrapper` (verify single `usePlayer` call), and error boundary behavior. Fix E2E tests to fail when auth is unavailable.

---

## P2 — Major Issues

### P2-1: Search Dropdown Lacks Listbox ARIA + Keyboard Navigation

**Source:** QA (M-3), Web Design

**Files:** `player-360-header-content.tsx:305-365`, `empty-states.tsx:654-737`

Custom search dropdowns lack `role="listbox"`, `role="option"`, `aria-activedescendant`, and arrow-key navigation. Users cannot keyboard-navigate results.

**Remediation:** Implement combobox/listbox ARIA pattern with `role="listbox"` on container, `role="option"` on items, ArrowUp/ArrowDown/Enter/Escape keyboard handling.

---

### P2-2: `prefers-reduced-motion` Not Respected

**Source:** Web Design

15+ instances of `animate-pulse` and `animate-spin` across skeleton/loading components. Tailwind's animation utilities do not respect `prefers-reduced-motion` by default.

**Remediation:** Replace `animate-pulse` with `motion-safe:animate-pulse` and `animate-spin` with `motion-safe:animate-spin`.

---

### P2-3: Missing `tabular-nums` on Monetary Displays

**Source:** Web Design

**Files:** `summary/summary-tile.tsx:122`, `compliance/panel.tsx:264`, `snapshot/card.tsx:210-211`

Monetary values (`$1,250`, `$890`) display without `font-variant-numeric: tabular-nums`. Numbers shift as values change, causing layout jank in grids.

**Remediation:** Add Tailwind `tabular-nums` class to all numeric display elements.

---

### P2-4: Left/Right Rails Inaccessible Below lg/xl Breakpoints

**Source:** Web Design

**File:** `components/player-360/layout.tsx:179, 237`

Left rail: `hidden lg:flex` — completely hidden below 1024px. Right rail: `hidden xl:flex` — hidden below 1280px. No mobile alternative provided for filter tiles, rewards eligibility, compliance panel, or jump-to navigation.

**Remediation:** Add mobile drawer or collapsible section for rail content on smaller screens.

---

### P2-5: Touch Targets Under 44x44px

**Source:** Web Design

| Element | Size | File:Line |
|---------|------|-----------|
| Search clear button | ~18x18px | `player-360-header-content.tsx:295-301` |
| Filter clear button | ~16x16px | `left-rail/filter-tile.tsx:120-128` |
| Reward filter chips | ~28x18px | `rewards/rewards-history-list.tsx:85-99` |
| Favorite/share buttons | 32x32px | `player-360-header-content.tsx:397-429` |

**Remediation:** Use `min-h-[44px] min-w-[44px]` on interactive elements or add invisible padding.

---

### P2-6: No `aria-live` Regions for Dynamic Content

**Source:** Web Design

No `aria-live` regions for search results appearing/disappearing, timeline loading more events, filter state changes, or error messages. Screen reader users get no feedback when content updates asynchronously.

**Remediation:** Add `aria-live="polite"` to search results container, timeline loading status, and error/empty state regions.

---

### P2-7: Nested `<main>` Landmarks

**Source:** Web Design

**Files:** `app/(dashboard)/layout.tsx:39` uses `<main>`, `components/player-360/layout.tsx:204` also uses `<main>` (via `Player360Center`). Nested `<main>` landmarks violate ARIA best practices.

**Remediation:** Change inner `Player360Center` to `<div role="region">`.

---

### P2-8: Loading Skeletons Lack `aria-busy` / `role="status"`

**Source:** Web Design

**File:** `components/player-360/skeletons.tsx`

No `aria-busy="true"` on skeleton containers. `LoadingSpinner` (line 369-371) renders a purely visual `<div>` with no `role="status"` or screen-reader label.

**Remediation:** Add `role="status"` and `aria-label="Loading"` to spinner/skeleton containers.

---

## P3 — Medium Issues

### P3-1: `handleShare` Unguarded + No User Feedback

**Source:** QA (M-5), Web Design

**File:** `player-360-header-content.tsx:150-152`

```typescript
const handleShare = async () => {
  await navigator.clipboard.writeText(window.location.href);
};
```

No try/catch. `navigator.clipboard.writeText` can throw `NotAllowedError`. No toast or visual indicator on success or failure.

**Remediation:** Wrap in try/catch with toast feedback.

---

### P3-2: `useAuth` Creates Per-Mount Subscription

**Source:** Performance (S9)

**File:** `hooks/use-auth.ts:54-101`

`useState`-based hook that calls `supabase.auth.getUser()` and `supabase.auth.onAuthStateChange()` on every mount. No deduplication. Returns a new object reference every render.

**Remediation:** Convert to context provider at layout level, or use TanStack Query hook for dedup/caching.

---

### P3-3: Zustand Store Without Selectors

**Source:** Performance (S6)

**File:** `hooks/player-360/use-timeline-filter.ts:140`

```typescript
const store = useTimelineFilterStore(); // Subscribes to ENTIRE store
```

Every `scrollToEvent()` / `clearScrollTarget()` re-renders all consumers.

**Remediation:** Use Zustand selectors: `useTimelineFilterStore(s => s.activeCategory)`.

---

### P3-4: `PlayerEditModal` Always Mounted

**Source:** Performance (S10)

**File:** `player-360-header-content.tsx:446-450`

Always rendered with `open={false}`. Creates 2 active TanStack Query subscriptions (`usePlayer` + `usePlayerIdentity`) even when closed.

**Remediation:** `{editModalOpen && <PlayerEditModal ... />}`.

---

### P3-5: E2E Tests Are Tautological No-Ops

**Source:** QA (M-1)

**Files:** `e2e/workflows/player-360-navigation.spec.ts`, `e2e/workflows/player-360-panels.spec.ts`

Pattern: `if (await el.isVisible()) { await expect(el).toBeVisible(); }` — tautological assertions that pass vacuously without authenticated data.

**Remediation:** Fail fast when auth unavailable. Add authenticated test fixtures.

---

## P4 — Low Issues

### P4-1: Recharts Imported Eagerly (~480KB)

**Source:** Performance (S11)

**File:** `charts/activity-chart.tsx:12-22`

**Remediation:** Use `next/dynamic` with `ssr: false`.

---

### P4-2: `isFavorite` Not Persisted

**Source:** QA (L-1)

**File:** `player-360-header-content.tsx:72`

`useState(false)` — resets on every page load. Misleading UI affordance.

**Remediation:** Persist to localStorage/backend or remove until implemented.

---

### P4-3: Inconsistent `staleTime` Across Related Hooks

**Source:** QA (L-3)

| Hook | staleTime |
|------|-----------|
| `useGamingDaySummary` | 15s |
| `usePlayerSummary` | 30s |
| `useRecentEvents` | 30s |
| `useInfinitePlayerTimeline` | 30s |
| `usePlayer` | 60s |
| `usePlayerWeeklySeries` | 5 min |
| `useGamingDay` | 5 min |

Related data on the same page has wildly varying freshness. Compliance events may appear in the compliance panel 15-30 seconds before they appear in the timeline.

**Remediation:** Align staleTime values for co-displayed data.

---

### P4-4: `transition-all` Anti-Pattern

**Source:** Web Design

**Files:** `layout.tsx:243`, `sidebar/player-360-sidebar.tsx:129`

`transition-all` instead of explicit property transitions.

**Remediation:** Replace with `transition-[width]` or specific properties.

---

### P4-5: `useRecentPlayers` Double-Writes to localStorage

**Source:** Performance (S13)

**File:** `empty-states.tsx:428-444`

Effect 1 reads localStorage → sets state → triggers Effect 2 → writes same data back.

**Remediation:** Use a ref to skip initial write-back.

---

### P4-6: Deprecated Sidebar in Barrel Export

**Source:** Performance (S12)

**File:** `components/player-360/index.ts:57-67`

Deprecated components still exported. May defeat tree-shaking.

**Remediation:** Remove deprecated exports.

---

### P4-7: Hydration Mismatches from Browser API in Render

**Source:** Web Design

**Files:**
- `player-360-header-content.tsx:179-186` — `navigator.userAgentData` access during render
- `sidebar/player-360-sidebar.tsx:28-32` — `localStorage` in `useState` initializer

**Remediation:** Move browser-specific reads to `useEffect`.

---

## Remediation Phases

### Phase 1 — Quick Wins (minimal risk, high impact)

| # | Fix | Lines Changed | Impact |
|---|-----|--------------|--------|
| 1 | Guard `addRecent` with `if (prev[0]?.id === id) return prev` | 1 line | Eliminates 1-3 wasted re-renders/mount |
| 2 | Remove `refetchOnWindowFocus`/`refetchInterval` from `useGamingDaySummary` | 2 lines | Stops 60s polling + tab-switch refetch |
| 3 | Conditionally render `PlayerEditModal` | 1 line | Removes 2 active subscriptions |
| 4 | Add `aria-label` to 7 buttons + 2 inputs | 9 attributes | WCAG 2.1 AA compliance |
| 5 | Add `motion-safe:` prefix to animations | ~15 lines | `prefers-reduced-motion` compliance |
| 6 | Add `tabular-nums` to monetary displays | ~5 classes | Eliminates layout jank |

### Phase 2 — Structural Fixes (architecture changes)

| # | Fix | Scope | Impact |
|---|-----|-------|--------|
| 7 | Add `error.tsx` at player route segment | New file | Crash recovery |
| 8 | Reset Zustand filter store on `playerId` change | 3 lines | Fixes cross-player leak |
| 9 | Lift `usePlayer` to single location, pass as prop | 3 files | Eliminates triple subscription |
| 10 | Add UUID validation for `playerId` | ~10 lines | Prevents malformed API calls |
| 11 | Split `TimelinePageContent` into panel components | Major refactor | Isolates re-render paths |
| 12 | Add `React.memo` to 5 key components | 5 files | Prevents cascade propagation |

### Phase 3 — Data Flow & Bundle

| # | Fix | Scope | Impact |
|---|-----|-------|--------|
| 13 | Compute `gamingDay` server-side, pass as prop | RSC change | Eliminates waterfall |
| 14 | Convert `useAuth` to context provider or TanStack Query | Architecture | Dedup auth subscriptions |
| 15 | Use Zustand selectors per consumer | Hook refactor | Prevents transient re-renders |
| 16 | Lazy-load `ActivityChart` with `next/dynamic` | 1 file | Saves ~480KB from initial bundle |
| 17 | Implement combobox/listbox ARIA for search | 2 files | Keyboard navigation + a11y |

### Phase 4 — Testing

| # | Fix | Scope | Impact |
|---|-----|-------|--------|
| 18 | Add `error.tsx` integration tests | New test | Validates crash recovery |
| 19 | Add cross-player filter reset test | New test | Validates state isolation |
| 20 | Add `TimelinePageContent` orchestration test | New test | Validates render count |
| 21 | Fix E2E tautological assertions | Test refactor | Real regression coverage |

---

## Summary Scorecard

| Audit Stream | Critical | High | Major | Medium | Low |
|-------------|----------|------|-------|--------|-----|
| **Performance** | 1 (S1) | 3 (S2-S4) | — | 4 (S5-S8) | 4 (S10-S13) |
| **QA** | 2 (C-1, C-2) | 5 (H-1–H-5) | — | 6 (M-1–M-6) | 4 (L-1–L-4) |
| **Web Design** | 2 (a11y) | — | 8 | — | 10 |
| **Combined (dedup)** | **4** | **7** | **8** | **5** | **7** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation Phase |
|------|-----------|--------|-----------------|
| White screen crash (no error boundary) | Medium | High | Phase 2 (#7) |
| Cross-player filter confusion | High | Medium | Phase 2 (#8) |
| Render performance degradation | High | Medium | Phase 1 (#1-3) + Phase 2 (#11-12) |
| Accessibility lawsuit/complaint | Low | High | Phase 1 (#4-6) |
| E2E regression undetected | High | High | Phase 4 (#21) |
| Bundle bloat from Recharts | Constant | Low | Phase 3 (#16) |

---

**Document Version:** 1.0.0
**Last Updated:** 2026-02-02
