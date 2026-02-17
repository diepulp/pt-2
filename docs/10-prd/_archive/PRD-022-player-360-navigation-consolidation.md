---
id: PRD-022
title: Player 360 Navigation Consolidation
version: 1.1.0
status: Draft
date: 2026-01-22
owner: Product/Engineering
bounded_contexts:
  - PlayerService (Identity Context) — consumes player data
affects_routes:
  - /players (lookup surface)
  - /players/[playerId] (Player 360 detail)
  - /players/[playerId]/timeline (redirect target)
depends_on:
  - ADR-029 (Player 360 Event Taxonomy)
  - GAP-PLAYER-360-NAVIGATION.md (Gap Analysis - Option B recommended)
  - PLAYER-360-NAV-OVERLAP-RESOLUTION.md (Resolution Plan)
tags: [navigation, player-360, routing, ux, frontend]
---

# PRD-022 — Player 360 Navigation Consolidation

## 1. Overview

- **Owner:** Product/Engineering
- **Status:** Draft
- **Summary:** Resolve the navigation overlap between `/players` (dashboard) and `/players/[playerId]/timeline` by establishing Player 360 as the single canonical player detail surface. This PRD consolidates duplicate UI panels, converts state-based selection to URL-based navigation, and ensures a clear entry/exit path for player workflows. The result is a predictable, shareable, and maintainable player detail experience.

## 2. Problem & Goals

### 2.1 Problem

The current UX and routing architecture creates **two competing "player detail" surfaces**:

1. **`/players` (Dashboard)** — Behaves like search + detail via Zustand `selectedPlayerId` state. Renders full detail panels (profile, notes, metrics, compliance, activity) inline based on client-side selection.

2. **`/players/[playerId]/timeline` (Player 360)** — Behaves like canonical detail via URL routing. Also renders profile header, timeline, and rail panels (notes/metrics/compliance).

**Consequences:**
- **Unclear source-of-truth** — Users don't know which surface is "the" player view
- **Fragmented navigation** — No clear entry/exit path; dead-end routes exist
- **Duplicated components** — 6+ panel components exist in both `components/player-dashboard/` and `components/player-360/`
- **State vs URL inconsistency** — Dashboard selection is non-shareable; timeline route is shareable
- **Divergent behavior** — Same conceptual panels behave differently between surfaces
- **Maintenance burden** — Engineering must sync features across two implementations

**Root cause:** Missing ownership rule for the "Player Detail" concept.

### 2.2 Goals

1. **URL-authoritative navigation** — Clicking a player always navigates to `/players/[playerId]`; no in-app pseudo-routing via Zustand
2. **Single canonical detail** — Player 360 (`/players/[playerId]`) is the only player detail surface; `/players` becomes lookup-only
3. **Component consolidation** — One set of detail panels owned by Player 360; no duplicates in dashboard
4. **Preserved search workflow** — Fast lookup with query params (`/players?query=smith&status=active`) that survive navigation round-trips
5. **Clear navigation UX** — Breadcrumbs, "Back to search" with preserved context, no dead-end routes

### 2.3 Non-Goals

- **New feature development** — This PRD does not add new Player 360 capabilities; it consolidates existing ones
- **Backend changes** — No database migrations, RPC changes, or service layer modifications
- **New bounded contexts** — This PRD does NOT create or formalize any new service boundary. Timeline data is consumed from existing services/data sources (PlayerService, VisitService, etc.). PRD scope is **UI navigation + component consolidation only**
- **Player 360 panel enhancements** — Per ADR-029, timeline/notes/tags are already covered; this PRD addresses routing/navigation only
- **Mobile-specific layouts** — Responsive design improvements are out of scope

## 3. Users & Use Cases

### Primary Users

- **Pit Boss** — Primary operator viewing player details during floor operations
- **Floor Supervisor** — Reviewing player activity across multiple tables
- **Cashier** — Verifying player identity before transactions (read-only detail view)

### Top Jobs

- As a **pit boss**, I need to quickly search for a player and view their full profile so that I can make informed decisions about comps and service.
- As a **pit boss**, I need to share a player's detail page URL with a colleague so that they can see the same view without re-searching.
- As a **floor supervisor**, I need to return from a player's detail page to my search results so that I can continue reviewing other players.
- As a **cashier**, I need to navigate directly to a player's detail page from a transaction screen so that I can verify their identity.

## 4. Scope & Feature List

### In Scope

1. **Routing restructure** — Create `/players/[playerId]/page.tsx` as Player 360 canonical entry
2. **Dashboard demotion** — Convert `/players` to lookup-only surface (search, filter, list, recents)
3. **Selection-to-navigation conversion** — Replace Zustand `selectedPlayerId` → detail rendering with `router.push(/players/${playerId})`
4. **Component ownership transfer** — Move detail panels from `player-dashboard/` to `player-360/` ownership
5. **Timeline route handling** — Redirect `/players/[playerId]/timeline` to `/players/[playerId]`
6. **Breadcrumb navigation** — Add `Players → {Player Name}` breadcrumb in Player 360
7. **Search context preservation** — Persist `/players` query params during navigation round-trips
8. **"Back to search" behavior** — Restore lookup surface with preserved filters when returning from Player 360

### Out of Scope

- Player 360 timeline implementation (covered by ADR-029)
- Notes/tags collaboration features (covered by ADR-029)
- New search/filter capabilities
- Performance optimizations (React Query caching, prefetch)

## 5. Requirements

### 5.1 Functional Requirements

**Navigation:**
- FR-1: Selecting a player row in `/players` MUST navigate to `/players/[playerId]`
- FR-2: `/players/[playerId]` MUST render the full Player 360 layout with all canonical panels
- FR-3: `/players/[playerId]/timeline` MUST issue HTTP **308 Permanent Redirect** to `/players/[playerId]#timeline`
  - Implementation: **Route Handler** (`route.ts`), NOT `page.tsx` with `redirect()`
  - `redirect()` from `next/navigation` does not provide status code control
  - Route handler allows explicit `NextResponse.redirect(url, 308)`
  - **Deep-link contract (locked):** Anchor `#timeline` is REQUIRED in the redirect target. Player 360 page MUST scroll to/focus the timeline section when `#timeline` anchor is present. This preserves intent for existing bookmarks and shared links.
- FR-4: Player 360 MUST display breadcrumb navigation: `Players → {Player Name}`
- FR-5: "Back to search" in Player 360 MUST return to `/players` with preserved query params (see FR-12 for mechanism)
  - **Visibility decision:** Provide a distinct, always-visible "Back to search" control adjacent to the breadcrumb (do not rely on breadcrumb alone).

**State Management:**
- FR-6: Zustand `selectedPlayerId` MAY be used only for row highlight in `/players` list
- FR-7: Zustand MUST NOT be used to render full detail panels in `/players`
- FR-8: URL query params (`/players?query=...&status=...`) MUST be the source of truth for search state

**Lookup-Only Boundary (Enforceable):**

`/players` is a **lookup surface**. The following rules define what it may and may not render:

| Allowed in `/players` | Disallowed in `/players` |
|-----------------------|--------------------------|
| List-row data returned by search query | Any component requiring `playerId` to fetch a panel dataset |
| Inline badges (status, tier, VIP indicator) | Timeline events or activity feed |
| Last visit timestamp (from search result) | Notes panel or note list |
| Player name, ID display | Compliance panel or compliance history |
| Row selection highlight (visual only) | Metrics aggregates (theo win, ADT, session stats) |
| "Open Player" action button | Profile detail beyond name/tier |
| Search input, filters, sort controls | Loyalty balance or ledger entries |

**Data Access Rule (Hard Boundary):**
1. `/players` may render **only row-level fields** already present in the list/search query response (or trivially derived from them): `id`, `first_name`, `last_name`, `tier`, `status`, `last_visit_at`
2. `/players` MUST NOT trigger **any additional fetch** keyed by `playerId` to render UI beyond the list row
3. Hover/preview cards (if implemented) MUST consume **only** the list payload — no extra fetch allowed
4. If a UI element requires data not in the list response, it belongs in `/players/[playerId]`

**Boundary Test:** If rendering a UI element requires a `useQuery`/`useSuspenseQuery` call with `playerId` as a key parameter (beyond the initial search/list query), that element belongs in `/players/[playerId]`, not `/players`. This includes "small" previews that fetch notes, metrics, or compliance data.

- FR-9: `/players` MUST NOT render any component that fetches data using `playerId` as a query key (e.g., `usePlayerTimeline(playerId)`, `usePlayerNotes(playerId)`, `usePlayerMetrics(playerId)`)
- FR-10: `/players` MAY render only data already present in the search/list response (player name, status, tier, last visit timestamp)
- FR-11: All `playerId`-keyed data fetching MUST occur within `/players/[playerId]` route

**Query Param Preservation (Mechanism):**
- FR-12: When navigating from `/players?query=...&status=...` to `/players/[playerId]`, the origin URL MUST be encoded and passed as a `returnTo` query param:
  ```
  /players/abc-123?returnTo=%2Fplayers%3Fquery%3Dsmith%26status%3Dactive
  ```
- FR-13: The "Back to search" link in Player 360 MUST decode and navigate to the `returnTo` param value
- FR-14: If `returnTo` is missing or invalid, "Back to search" MUST fall back to `/players` (no params)
- FR-15: `returnTo` MUST be validated to ensure it starts with `/players` (prevent open redirect)

### 5.2 Non-Functional Requirements

- NFR-1: Row click handler MUST NOT perform synchronous blocking work (no heavy computation, no synchronous fetches). Navigation initiation (`router.push`) must be immediate.
- NFR-2: "Back to search" MUST restore filter state immediately via URL params decoded from `returnTo`. Results SHOULD be served from React Query cache when available; a fresh fetch is acceptable if cache is cold.
- NFR-3: Deep-link to `/players/[playerId]` MUST be shareable and bookmarkable (no auth-gated state required beyond session)

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM v4.11.0)
> Component inventory: See `components/player-dashboard/` and `components/player-360/`

## 6. UX / Flow Overview

### Primary Flow: Search → Detail → Return

```
/players                          /players/[playerId]
┌──────────────────────┐         ┌──────────────────────────────┐
│  Search Input        │         │  Breadcrumb: Players > Smith │
│  ─────────────────── │         │  ──────────────────────────  │
│  Filters: Active ▼   │         │  ┌─────────────────────────┐ │
│  ─────────────────── │   ───→  │  │  Player Header/Profile  │ │
│  Results:            │  click  │  └─────────────────────────┘ │
│  ┌─────────────────┐ │   row   │  ┌─────────────────────────┐ │
│  │ Smith, John  ●  │─┼────────→│  │  Timeline + Rails       │ │
│  │ Active | Tier 3 │ │         │  │  (Notes, Metrics, etc)  │ │
│  └─────────────────┘ │   ←──   │  └─────────────────────────┘ │
│  ┌─────────────────┐ │  "Back  │                              │
│  │ Jones, Mary     │ │   to    │  [Back to search]            │
│  └─────────────────┘ │ search" └──────────────────────────────┘
└──────────────────────┘

URL: /players?query=smith&status=active    URL: /players/abc-123?returnTo=%2Fplayers%3Fquery%3Dsmith%26status%3Dactive
                                           ↑ returnTo encodes origin URL
```

**Navigation Mechanism:**
1. Row click in `/players` → `router.push(\`/players/${playerId}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}\`)`
2. "Back to search" in Player 360 → `router.push(decodeURIComponent(returnTo))` (after validation)
3. If `returnTo` missing/invalid → `router.push('/players')`

**Client-Only Constraint (A3):**
- The `returnTo` capture logic (`window.location.*`) MUST live in a **client component** event handler (e.g., `onClick` in the player list row)
- Server Components and Server Actions MUST NOT reference `window`
- The `/players/page.tsx` may be a Server Component, but the clickable row must be a Client Component (`'use client'`) or use a Client Component wrapper for the click handler

### URL Patterns

| Route | Surface | Purpose |
|-------|---------|---------|
| `/players` | Lookup | Search, filter, list, recents |
| `/players?query=smith&status=active` | Lookup | Filtered search results |
| `/players/[playerId]` | Player 360 | Canonical detail (direct access) |
| `/players/[playerId]?returnTo=%2Fplayers%3Fquery%3Dsmith` | Player 360 | Detail with return context |
| `/players/[playerId]#timeline` | Player 360 | Detail with timeline anchor |
| `/players/[playerId]/timeline` | Route Handler | 308 Permanent → `/players/[playerId]#timeline` |

### Allowed vs Disallowed State

| State Location | Allowed Use | Disallowed Use |
|----------------|-------------|----------------|
| URL query params | Search filters, sort order | — |
| URL path params | Player ID for detail view | — |
| Zustand | Row highlight, UI preferences | Rendering detail panels |
| Local state | Temporary form input | Navigation decisions |

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| ADR-029 Player 360 Event Taxonomy | Approved | Defines panel structure |
| Player 360 Layout (`components/player-360/layout.tsx`) | Implemented | Base layout exists |
| Player Dashboard (`components/player-dashboard/`) | Implemented | To be demoted |
| `usePlayerDashboard` hook | Implemented | To be modified |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing bookmarks to `/players/[playerId]/timeline` | Medium | HTTP 308 permanent redirect preserves intent |
| User confusion during transition | Low | Breadcrumbs + "Back to search" provide clear affordances |
| Regression in search UX | Medium | Preserve all current search functionality; add query param persistence |
| Component removal may break imports | Low | Migration sequence ensures no orphan imports |

**Open Questions:**
1. ~~Should `/players/[playerId]/timeline` redirect or render as thin wrapper?~~ **Decision: Redirect (preferred per gap resolution doc)**
2. Should search query params be stored in localStorage as backup? **Decision: No — URL is sufficient per principle "URL is authoritative"**

## 8. Definition of Done (DoD)

The release is considered **Done** when:

### Functionality

- [ ] `/players/[playerId]/page.tsx` exists and renders Player 360 with all canonical panels
- [ ] Clicking a player row in `/players` navigates to `/players/[playerId]`
- [ ] `/players/[playerId]/timeline` returns HTTP 308 redirect to `/players/[playerId]#timeline`
- [ ] `/players` no longer renders full detail panels when a player is "selected"
- [ ] `/players` displays only lightweight list view with search/filter/recents
- [ ] Breadcrumb displays `Players → {Player Name}` in Player 360
- [ ] "Back to search" navigates to `/players` with preserved query params (decoded from `returnTo`)
- [ ] `/players/[playerId]#timeline` scrolls to/focuses the timeline section on load

### Data & Integrity

- [ ] No orphaned Zustand state affecting navigation (player selection → route change, not state change)
- [ ] Query params survive full navigation cycle: `/players?query=x` → `/players/abc?returnTo=...` → Back → `/players?query=x`
- [ ] `returnTo` param is validated (must start with `/players`)

### No Duplicate Fetch (Performance Regression Prevention)

- [ ] Player 360 page load triggers **at most one fetch per data domain**:
  - One player identity/profile fetch
  - One timeline events fetch
  - One notes fetch
  - One metrics aggregate fetch
- [ ] **Shared query-key registry required:** All Player 360 panels MUST use query keys from a central registry (e.g., `hooks/player-360/keys.ts` or `player360QueryKeys`) to guarantee React Query de-duplication
- [ ] Verified via React Query DevTools or integration test asserting Supabase call count
- [ ] No redundant fetches across header, rail, and center panels (shared query keys, not component-local keys)

### Security & Access

- [ ] Player 360 respects existing RLS policies (casino-scoped access)
- [ ] No new permission requirements introduced

### Testing

- [ ] Integration test: Search → Click row → Verify URL includes `returnTo` param
- [ ] Integration test: `/players/[playerId]/timeline` → Verify HTTP status 308 and `Location` header to `/players/[playerId]#timeline` (use `fetch` with `redirect: 'manual'`)
- [ ] Integration test: "Back to search" decodes `returnTo` and navigates to exact origin URL
- [ ] Integration test: Invalid `returnTo` (e.g., `//evil.com`) falls back to `/players`
- [ ] Unit test: `usePlayerDashboard` hook no longer drives detail panel rendering
- [ ] ESLint `no-restricted-imports` rule configured per §9 (One Import Path Rule)
- [ ] CI check: No detail panel exports from `components/player-dashboard/`

### Operational Readiness

- [ ] No console errors during navigation flow
- [ ] Browser history works correctly (back/forward)

### Documentation

- [ ] `components/player-dashboard/README.md` updated to reflect "lookup-only" role
- [ ] `PLAYER-360-NAV-OVERLAP-RESOLUTION.md` status updated to "Implemented"

## 9. Component Ownership Map (Post-Implementation)

### Owned by `/players` (Lookup Surface)

| Component | Location | Purpose |
|-----------|----------|---------|
| `PlayerSearchCommand` | `player-dashboard/` | Search input with autocomplete |
| `PlayerListTable` | TBD | Results table with row click → navigate |
| `RecentPlayersList` | TBD | Quick access to recently viewed |
| Filters/Sort UI | TBD | Query param-driven filtering |

### Owned by `/players/[playerId]` (Player 360)

| Component | Location | Purpose |
|-----------|----------|---------|
| `Player360Layout` | `player-360/layout.tsx` | 3-panel layout container |
| `Player360LayoutProvider` | `player-360/layout.tsx` | Context provider |
| `PlayerHeader` / `SnapshotCard` | `player-360/snapshot/` | Profile summary |
| `CollaborationPanel` | `player-360/collaboration/` | Notes, tags |
| `CompliancePanel` | `player-360/compliance/` | Compliance indicators |
| `TimelineContent` | `player-360/timeline/` | Activity feed |

### To Be Deprecated/Removed

| Component | Current Location | Action |
|-----------|------------------|--------|
| `PlayerProfilePanel` | `player-dashboard/` | Consolidate into `player-360/snapshot/` |
| `NotesPanel` | `player-dashboard/` | Consolidate into `player-360/collaboration/` |
| `MetricsPanel` | `player-dashboard/` | Consolidate into `player-360/` |
| `CompliancePanel` | `player-dashboard/` | Consolidate into `player-360/compliance/` |
| `ActivityVisualizationPanel` | `player-dashboard/` | Consolidate into timeline |
| `LoyaltyPanel` | `player-dashboard/` | Consolidate into `player-360/` |
| `SessionControlPanel` | `player-dashboard/` | Consolidate into `player-360/` |

### One Import Path Rule (Anti-Drift Enforcement)

**Canonical source for player detail panels:** `components/player-360/**`

**Enforcement (Layered):**

1. **ESLint `no-restricted-imports` (Primary — Required):**
   ```js
   // .eslintrc.js (or eslint.config.js)
   rules: {
     'no-restricted-imports': ['error', {
       patterns: [
         {
           group: ['@/components/player-dashboard/*Panel*', '@/components/player-dashboard/*Notes*', '@/components/player-dashboard/*Metrics*', '@/components/player-dashboard/*Compliance*', '@/components/player-dashboard/*Activity*', '@/components/player-dashboard/*Timeline*', '@/components/player-dashboard/*Profile*', '@/components/player-dashboard/*Loyalty*', '@/components/player-dashboard/*Session*'],
           message: 'Detail panels must be imported from components/player-360/. See PRD-022.'
         }
       ]
     }]
   }
   ```

2. **Post-migration cleanup:**
   - `components/player-dashboard/` contains ONLY: `PlayerSearchCommand`, `PlayerListTable`, index exports
   - All `*Panel` components deleted or moved to `player-360/`

3. **CODEOWNERS:**
   - `components/player-360/` owned by Player 360 maintainers
   - PRs adding detail-like components to `player-dashboard/` require explicit approval

4. **CI grep tripwire (Secondary — Backup):**
   ```bash
   # Fails if any Panel-like exports exist in player-dashboard
   grep -r "export.*Panel\|export.*Notes\|export.*Metrics\|export.*Compliance" components/player-dashboard/ && exit 1
   ```
   Note: Grep is a tripwire, not a fence. ESLint rule is the primary enforcement.

## 10. Migration Sequence

Safe, deterministic migration order:

1. **Create canonical route** — Add `app/(dashboard)/players/[playerId]/page.tsx` rendering Player 360
2. **Update navigation** — Modify `/players` row click to:
   ```ts
   router.push(`/players/${playerId}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)
   ```
3. **Remove detail rendering** — Strip Zustand-driven detail panels from `/players`
4. **Consolidate components** — Move duplicate panels to `player-360/` ownership
5. **Add redirect** — Replace `/players/[playerId]/timeline/page.tsx` with Route Handler for explicit 308:
   ```ts
   // app/(dashboard)/players/[playerId]/timeline/route.ts
   import { NextRequest, NextResponse } from 'next/server';

   export async function GET(
     request: NextRequest,
     { params }: { params: Promise<{ playerId: string }> }
   ) {
     const { playerId } = await params;
     const url = new URL(`/players/${playerId}#timeline`, request.url);
     return NextResponse.redirect(url, 308); // 308 Permanent Redirect
   }
   ```
   - Delete `page.tsx` and `_components/` from `/timeline/` directory
   - Route handler intercepts all GET requests and issues 308
6. **Add UX elements** — Implement breadcrumbs and "Back to search" with `returnTo` param decoding
7. **Cleanup** — Remove deprecated components from `player-dashboard/`; add CI drift check

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| `docs/00-vision/player-dashboard/GAP-PLAYER-360-NAVIGATION.md` | Gap analysis (identifies problem, recommends Option B) |
| `docs/00-vision/player-dashboard/PLAYER-360-NAV-OVERLAP-RESOLUTION.md` | Resolution plan (decision rationale) |
| `docs/00-vision/player-dashboard/player-360-crm-dashboard-ux-ui-baselines.md` | UX design baseline |
| `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md` | Player 360 event taxonomy |
| `docs/25-api-data/PLAYER_360_EVENT_TAXONOMY.md` | Event taxonomy reference |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | SRM v4.11.0 (PlayerTimelineService) |
| `docs/10-prd/PRD-STD-001_PRD_STANDARD.md` | PRD standard |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-22 | Redirect via Route Handler (not `redirect()`); `returnTo` param mechanism; client-only `window` constraint; data access boundary for lookup-only; ESLint `no-restricted-imports` enforcement; shared query-key registry requirement; `#timeline` anchor contract locked; measurable NFRs |
| 1.0.0 | 2026-01-21 | Initial draft |

---

**Document Version:** 1.1.0
**Created:** 2026-01-21
**Updated:** 2026-01-22
**Status:** Draft
