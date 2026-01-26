---
title: "Player 360 Navigation Overlap Resolution"
doc_type: "plan"
version: "v1.0"
status: "approved-draft"
date: "2026-01-21"
project: "casino-player-tracker (PT-2)"
owner: "Product/Engineering"
tags: ["navigation", "player-360", "routing", "ux", "architecture"]
---

# Problem Statement

The current UX and routing create **two competing “player detail” surfaces**:

- `/players` (dashboard) behaves like **search + detail** via a client state selection (e.g., Zustand `selectedPlayerId`)
- `/players/[playerId]/timeline` behaves like **canonical detail** via URL routing (shareable, deep-linkable)

Both surfaces duplicate the same conceptual panels (profile header, notes, metrics, compliance, activity/timeline). This causes:
- unclear source-of-truth for “player view”
- fragmented navigation (no clear entry/exit path)
- duplicated components and divergent behavior
- state vs URL inconsistency (non-shareable selection vs shareable route)

**Root cause:** missing ownership rule for the “Player Detail” concept.

# Decision: One Canonical Player Detail

**Make Player 360 the only canonical player detail.**  
Demote `/players` to **lookup only** (search/list + navigation).

## Canonical Contract (Routes)

- `/players`
  - **Lookup Surface**: search, filter, list, recents
  - No deep “detail” panels beyond lightweight list context
  - Selection is navigational (URL), not “in-app pseudo-routing”

- `/players/[playerId]`
  - **Player 360 (Canonical Detail)**: header + timeline + rails (notes/metrics/compliance)

- `/players/[playerId]/timeline`
  - **Removed as a separate canonical page**
  - Either:
    - redirect to `/players/[playerId]` (preferred), or
    - become a section anchor within Player 360 (e.g., `/players/[playerId]#timeline`)

# Non-Negotiable Principles

1. **URL is authoritative** for “selected player”.
2. **One domain concept → one canonical screen** (Player Detail = Player 360).
3. Client state (Zustand) may exist only for **UI convenience**, never as navigation truth.
4. If a new screen needs ~60% of the same panels, it’s not a new screen — it’s duplication.

# Implementation Plan (Concrete)

## 1) Routing Restructure: Create the Canonical Player 360 Page

### Action
Create `app/(dashboard)/players/[playerId]/page.tsx` as the Player 360 canonical page.

### Result
- Player 360 becomes the default entry for any player deep-link.
- `/timeline` ceases to be a competing “detail route.”

## 2) Convert Dashboard Selection from State to Navigation

### Action
In `/players`, clicking a player row (or “Open Player”) must:
- `router.push(/players/${playerId})`

### Allowed State
You may keep Zustand (or local state) only for:
- highlighting the selected row
- temporarily caching search UI state

### Disallowed State
- Rendering full detail panels inside `/players` based solely on `selectedPlayerId` without navigation.

## 3) Consolidate Duplicate Panels into a Single Component Set Owned by Player 360

### Action
Move/standardize the following into Player 360 ownership:

- PlayerHeader / Profile summary
- Notes panel
- Metrics rail
- Compliance panel
- Activity / Timeline

### Required Outcome
- `/players` must not contain full duplicates of these panels.
- Any “preview” in `/players` must be **lightweight** (e.g., quick badges/summary lines) and must not attempt to replicate Player 360.

## 4) Navigation Clarity: Entry Points and Return Path

### Required UX Elements

- In `/players` list:
  - Each row has a clear action: **Open Player** → `/players/[playerId]`

- In Player 360:
  - Breadcrumb: `Players → {Player Name}`
  - “Back to search” returns to `/players` with preserved query state (see next section)

## 5) Preserve Search Context Without Making It the Source of Truth

### Action
Use URL query params for the lookup surface:
- `/players?query=smith&status=active&sort=recent`

When navigating back from Player 360, restore the lookup surface using those params.

### Why
This keeps search workflows fast and recoverable without relying on non-shareable in-memory selection.

## 6) Decommission `/players/[playerId]/timeline` as a Canonical Screen

### Action (Preferred)
- Replace route content with redirect to `/players/[playerId]`

### Acceptable Alternative
- Keep the route but make it a thin wrapper that renders Player 360 with the timeline section focused,
  without duplicating a second detail implementation.

**Rule:** No second “detail UI” may exist under a different route.

# Acceptance Criteria (Definition of Done)

## Functional
- Selecting a player in `/players` navigates to `/players/[playerId]`
- `/players/[playerId]` renders Player 360 with all canonical panels
- `/players/[playerId]/timeline` no longer represents a separate detail UI (redirect or thin wrapper)
- Back navigation from Player 360 returns to `/players` and preserves search query state

## Architectural
- Player 360 owns detail panels; `/players` owns lookup/list
- No duplicated “detail” component trees across both surfaces
- URL is the single source of truth for player selection
- Client state is not used as navigation truth

## UX
- Clear entry points to Player 360 from `/players`
- Breadcrumbs exist in Player 360
- No “dead-end” routes

# Component Ownership Map

## Owned by `/players` (Lookup Surface)
- Search input, filters, sorting
- Results table/list, recent players
- Lightweight list badges (status, tier, last visit)
- Optional: selected-row highlight

## Owned by `/players/[playerId]` (Player 360)
- Player header/profile
- Notes
- Metrics rail
- Compliance
- Timeline / activity feed
- Any nested panels that are player-specific detail

# Migration Sequence (Safe and Deterministic)

1. Create `/players/[playerId]/page.tsx` and render Player 360 there.
2. Update `/players` row click to `router.push(/players/${playerId})`.
3. Remove/deprecate detail rendering in `/players` that depends on Zustand `selectedPlayerId`.
4. Consolidate duplicated components into Player 360 ownership.
5. Replace `/players/[playerId]/timeline` with redirect or a thin wrapper.
6. Add breadcrumbs and “Back to search” behavior with query params.

# Risks and How This Plan Prevents Them

- **Risk: User loses quick lookup workflow**
  - Mitigation: keep `/players` as fast lookup with query params; do not degrade search UX.

- **Risk: Engineering drifts into maintaining two detail screens**
  - Mitigation: hard rule + redirect removal; Player 360 is the only canonical detail.

- **Risk: State desync bugs (Zustand vs URL)**
  - Mitigation: URL authoritative; Zustand limited to UI conveniences only.

# “No More Overlap” Guardrail

Any new feature request that adds player detail panels must attach to:
- `/players/[playerId]` (Player 360) or its internal sections/tabs

If someone proposes re-adding deep detail panels to `/players`, the correct response is:
- “That’s duplication. Put it in Player 360 and link to it.”
