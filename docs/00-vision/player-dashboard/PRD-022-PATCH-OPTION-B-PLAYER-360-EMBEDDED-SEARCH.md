---
title: PRD-022 Patch — Adopt Option B (Embedded Search in Player 360)
status: Draft Patch
date: 2026-01-24
patch_type: navigation-architecture
targets:
  - PRD-022
relates_to:
  - PRD-022-ARCHITECTURE-ALTERNATIVES.md
  - GAP-PLAYER-360-NAVIGATION.md
  - PLAYER-360-NAV-OVERLAP-RESOLUTION.md
  - PLAYER-360-CONSOLIDATION-STRATEGY.md
tags: [prd, patch, navigation, player-360, ux, nextjs]
---

# PRD-022 Patch — Option B: Embedded Search in Player 360

## 0. Patch Summary

This patch replaces the PRD-022 “two-surface” navigation flow:

- `/players` (lookup-only) → navigate → `/players/[playerId]` (Player 360) → “Back to search”

with a **single ergonomic surface**:

- `/players` and `/players/[playerId]` handled by one **catch-all route**
- **Search sidebar/drawer is always accessible** inside Player 360
- Player selection uses `router.replace()` to update URL **without** a search→detail page hop
- Removes `returnTo` / “Back to search” complexity and reduces cognitive overhead

This patch also explicitly relocates **profile editing** (PlayerEditModal + PlayerEditForm) into Player 360 so deprecations do not break core functionality.

---

## 1. Decision

**Adopt Option B**: Embedded search in Player 360 (single-surface UX) with URL-authoritative navigation.

### Non-goals
- Do not rebuild a second “detail surface” inside `/players` (avoid Option C relapse).
- Do not introduce pseudo-routing via Zustand (URL remains the authority).
- Do not expand analytics scope beyond Player 360 ergonomics + parity preservation.

---

## 2. Route & Layout Changes

### 2.1 Replace PRD-022 WS1 route plan with a catch-all route

**New canonical route:**

- `app/(dashboard)/players/[[...playerId]]/page.tsx`

This route handles:
- `/players` → “no player selected” state
- `/players/:playerId` → Player 360 detail

### 2.2 Layout skeleton (conceptual)

- `Player360Shell` (layout + suspense boundaries)
  - `Player360Sidebar` (desktop persistent/collapsible; mobile drawer)
    - `PlayerSearchCommand` (migrated from player-dashboard)
    - `RecentPlayersList` (MVP: local persistence)
  - `Player360Main`
    - `Player360Header` (identity + actions)
      - `PlayerEditModal` (moved here; reuses existing form)
    - `Player360Body`
      - Left rail (metrics)
      - Center (timeline)
      - Right rail (collaboration/compliance placeholders)

---

## 3. Navigation Behavior Spec

### 3.1 Player selection

When a player is selected from search results:
- Update URL via `router.replace('/players/:playerId', { scroll: false })`
- Do **not** force a hard navigation to a separate surface
- Keep search context available

### 3.2 Clear selection

When selection is cleared:
- `router.replace('/players', { scroll: false })`

### 3.3 Sidebar ergonomics (MVP defaults)

Desktop:
- Sidebar is **visible by default** and **collapsible**
- No auto-collapse on selection (avoid “clever” behavior that fights the operator)
- Selected player remains highlighted in the results list (if present)
- Persist sidebar collapsed state in localStorage (MVP acceptable)

Mobile:
- Sidebar becomes a **sheet/drawer**
- Selecting a player closes the drawer

Keyboard (MVP):
- `Ctrl/⌘ + K` focuses search
- `Esc` clears query; second `Esc` closes drawer (mobile) / collapses sidebar (desktop)

---

## 4. Profile Editing Parity (Critical)

PRD-022 deprecations must not strand profile editing.

### 4.1 Change

- Move `PlayerEditModal` + `PlayerEditForm` under Player 360 header actions.
- Keep modal mounted at header-level to avoid remount churn when rails/timeline suspense boundaries swap.

### 4.2 Acceptance

- A user can open “Edit Profile” from Player 360 for any selected player.
- Existing validations and submission behavior remain unchanged.

---

## 5. Workstream Mapping (PRD-022 Delta)

This patch updates PRD-022 workstreams as follows.

| Workstream | Original Scope | Patch Scope (Option B) |
|---|---|---|
| WS1 | Create `/players/[playerId]/page.tsx` | Replace with catch-all `app/(dashboard)/players/[[...playerId]]/page.tsx` + embed search sidebar |
| WS2 | Timeline 308 redirect | Unchanged |
| WS3 | Navigation utilities (`returnTo`) | **Simplified**: remove `returnTo`; navigation is `router.replace()` only |
| WS4 | Dashboard demotion to lookup-only | **Removed**: dashboard search becomes part of Player 360 |
| WS5 | Zustand store modification | Unchanged (row highlight only; no pseudo-routing) |
| WS6 | Query key registry | Unchanged |
| WS7 | ESLint configuration | Unchanged |
| WS8 | Component consolidation | **Extended**: migrate `PlayerSearchCommand` and move `PlayerEditModal` into `components/player-360/` |
| WS9 | Component cleanup | Unchanged |
| WS10 | Unit + integration tests | Update to reflect embedded search + catch-all routing |
| WS11 | E2E tests | Update flows: no “back to search”; validate sidebar/drawer behavior |
| WS12 | CODEOWNERS | Unchanged |

### 5.1 New workstream

**WS-NEW — Search Sidebar Integration**
- Create `Player360Sidebar` (collapsible sidebar + mobile drawer)
- Migrate `PlayerSearchCommand` into sidebar
- Implement selection/clear handlers using `router.replace()`
- Implement `/players` empty state
- Implement keyboard shortcut wiring (`Ctrl/⌘+K`, `Esc` behavior)

---

## 6. Definition of Done (DoD)

Option B is complete when:

1. **Single-surface flow**
   - Selecting a player does not require navigating away to a different page just to see detail.
   - Search remains accessible while viewing player details.

2. **URL-authoritative**
   - `/players/:id` deep link loads Player 360 reliably.
   - Switching players updates the URL via `router.replace()`.

3. **Empty state**
   - `/players` renders a purposeful empty state (instructions + recent players list).

4. **Profile editing parity**
   - Edit Profile is accessible from Player 360 header.
   - Submissions persist and UI refreshes correctly.

5. **No pseudo-routing**
   - Zustand is not used to drive “selected player” navigation state (highlight-only permitted).

6. **Tests updated**
   - Unit/integration and E2E coverage updated for new route + sidebar flow.

---

## 7. Test Plan Updates

### 7.1 Unit + Integration (WS10)

Add/Update tests for:

- **Routing**
  - Selecting a player calls `router.replace('/players/:id', { scroll:false })`
  - Clearing selection calls `router.replace('/players', { scroll:false })`

- **Empty state**
  - `/players` renders empty state and recent list component

- **Modal parity**
  - “Edit Profile” button opens `PlayerEditModal`
  - Form submission calls existing mutation and closes modal on success

- **Sidebar**
  - Collapsible toggle persists state (localStorage)
  - Selected row highlight updates

### 7.2 E2E (WS11)

Scenarios:

1. **Search → select → switch**
   - Visit `/players`
   - Search for a player
   - Select result → URL becomes `/players/:id` and 360 renders
   - Select another result → URL updates; no “back” hop needed

2. **Deep link**
   - Visit `/players/:id` directly
   - Sidebar available, 360 renders identity + timeline

3. **Edit profile**
   - Open edit modal from header
   - Update a field
   - Save and verify updated value is displayed

4. **Mobile behavior** (viewport)
   - Open drawer, search, select → drawer closes, 360 shows
   - Reopen drawer and switch player

---

## 8. Migration Steps (Low Drama)

1. **Introduce catch-all route** (`/players/[[...playerId]]`) and render Player 360 layout.
2. **Add sidebar wrapper** with placeholder content and empty state for `/players`.
3. **Move `PlayerSearchCommand`** into sidebar and wire selection to `router.replace()`.
4. **Move `PlayerEditModal/Form`** into Player 360 header actions.
5. **Remove “lookup-only” `/players` surface behavior** and delete `returnTo` utilities.
6. Update tests (WS10/WS11) accordingly.

---

## 9. Risks & Mitigations

- **Layout width pressure (desktop):** default sidebar collapsible; keep rails responsive.
- **Data churn on rapid switching:** isolate heavy timeline query behind suspense boundary and use transitions (`startTransition`) during selection.
- **Regression risk on modal:** keep edit modal mounted at header-level; do not couple it to timeline component lifecycle.

---

## 10. Appendix: Minimal UX Specs (MVP)

- Sidebar default: open on desktop, drawer on mobile
- Recent players: last 10 viewed (localStorage-backed is acceptable for MVP)
- No auto-collapse on selection
- Keyboard: `Ctrl/⌘+K` focus search; `Esc` clear/close behavior

---
