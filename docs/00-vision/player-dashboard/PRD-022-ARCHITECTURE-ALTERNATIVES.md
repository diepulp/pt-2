---
title: PRD-022 Architecture Alternatives Analysis
status: Draft
date: 2026-01-24
relates_to:
  - PRD-022
  - GAP-PLAYER-360-NAVIGATION.md
  - PLAYER-360-NAV-OVERLAP-RESOLUTION.md
  - PLAYER-360-CONSOLIDATION-STRATEGY.md
tags: [architecture, navigation, player-360, decision]
---

# PRD-022 Architecture Alternatives Analysis

## 1. Problem Statement

PRD-022 as currently specified creates an architectural pattern where:

```
/players (lookup-only)  →  page navigation  →  /players/[playerId] (Player 360)
                        ←  "Back to search" ←
```

This introduces **cognitive overhead** and **unnecessary navigation** for a common workflow: *searching for a player and viewing their details*.

### Identified Redundancy

The `/players` page becomes a "lookup-only" surface whose sole purpose is to navigate away to Player 360. This raises the question: **Why not embed search directly into Player 360?**

### Additional Concerns

1. **Profile editing functionality** in `PlayerEditModal` must be preserved and accessible
2. **Player personal info display** needs to be restored in the consolidated view
3. **Decision needed:** Should Player 360 (timeline) become the SoT for player detail, or should the dashboard be extended?

## 2. Current State Analysis

### Components in Player Dashboard (`components/player-dashboard/`)

| Component | Purpose | Status |
|-----------|---------|--------|
| `PlayerDashboard` | Search + empty state | Lookup-only (PRD-022 WS4) |
| `PlayerSearchCommand` | Debounced search with results | Preserved |
| `PlayerProfilePanel` | Profile display with edit button | To be deprecated |
| `PlayerEditModal` | Profile editing form | **Must be preserved** |
| `PlayerEditForm` | Zod-validated form fields | **Must be preserved** |
| `*Panel` components | Detail panels (7 total) | To be deprecated |

### Components in Player 360 (`components/player-360/`)

| Component | Purpose | Status |
|-----------|---------|--------|
| `Player360Layout` | Three-panel layout container | Implemented |
| `Player360Header` | Sticky header with player identity | Implemented |
| `SnapshotCard` | Shareable player summary | Implemented |
| `CollaborationPanel` | Notes, tags (right rail) | Placeholder |
| `CompliancePanel` | CTR/MTL (right rail) | Placeholder |
| Timeline components | Event feed (center) | Implemented |

### Gap: Missing Profile Editing in Player 360

The `PlayerEditModal` currently lives in `player-dashboard/` and is triggered from `PlayerProfilePanel`. PRD-022's component deprecation plan does not explicitly address where profile editing will live in the consolidated architecture.

## 3. Architectural Options

### Option A: PRD-022 As-Is (Two-Surface Architecture)

```
/players (lookup) ───navigate───> /players/[playerId] (detail)
                 <──returnTo────
```

**Implementation:**
- `/players` renders `PlayerDashboard` (search only)
- Row click navigates to `/players/[playerId]`
- "Back to search" decodes `returnTo` param

**Pros:**
- Clean URL separation
- Simple mental model ("search page" vs "detail page")
- Each page has single responsibility
- Already partially implemented

**Cons:**
- Page navigation for every lookup (slow)
- Context switching between surfaces
- "Search dead end" - must navigate back to search again
- `returnTo` param complexity
- Redundant page that only exists to navigate away

**Profile Editing:** Add `PlayerEditModal` to Player 360 header

---

### Option B: Embedded Search in Player 360 (Single-Surface)

```
/players/[playerId] (or /players for no selection)
┌─────────────────────────────────────────────────────┐
│  [Search: ___________]  │  Player 360 Header       │
├────────────────────────┤─────────────────────────────│
│  Search Results        │  Timeline / Rails          │
│  ● John Smith ✓        │                            │
│  ○ Jane Doe            │  Profile, Metrics,         │
│  ○ Bob Wilson          │  Compliance, Notes         │
└────────────────────────┴─────────────────────────────┘
```

**Implementation:**
- Single route handles both `/players` and `/players/[playerId]`
- Search sidebar always visible (collapsible)
- Player selection updates URL via `router.replace()`
- No page navigation required

**Pros:**
- No page navigation - instant player switching
- Search context always visible
- URL still reflects current player (`/players/[playerId]`)
- Matches common CRM patterns (Salesforce, HubSpot sidebar)
- Faster pit boss workflow
- Eliminates redundant lookup-only page

**Cons:**
- More complex single-page layout
- Need to handle "no player selected" state
- Sidebar consumes horizontal space
- Requires layout restructuring

**Profile Editing:** Integrated in Player 360 header

---

### Option C: Extended Dashboard (Dashboard as Primary)

```
/players
┌─────────────────────────────────────────────────────┐
│  Search + Filter Controls                           │
├────────────────┬────────────────────────────────────│
│  Player List   │  Detail Panel (Right Side)         │
│  ● Selected    │  ┌──────────────────────────────┐  │
│  ○ Other       │  │ Profile + Edit               │  │
│                │  │ Timeline (collapsed)          │  │
│                │  │ Metrics + Loyalty            │  │
│                │  └──────────────────────────────┘  │
└────────────────┴────────────────────────────────────┘
```

**Implementation:**
- `/players` is the primary surface
- Detail panel renders inline based on selection
- Timeline integrated as collapsible section
- `/players/[playerId]` could redirect to `/players?selected={playerId}`

**Pros:**
- Single surface for everything
- List always visible for multi-player workflows
- No navigation required
- Profile editing naturally fits in detail panel

**Cons:**
- This IS the original problem - recreates two detail surfaces
- Harder to share specific player URL (state vs URL)
- Layout constraints (list + full detail can feel cramped)
- Zustand state management complexity returns

**Profile Editing:** Remains in dashboard detail panel

---

## 4. Comparative Analysis

| Criterion | Option A (PRD-022) | Option B (Embedded) | Option C (Extended) |
|-----------|-------------------|---------------------|---------------------|
| Navigation friction | High | Low | Low |
| URL shareability | Good | Good | Poor |
| Implementation effort | Low (partially done) | Medium | High |
| Search context preservation | Via `returnTo` | Always visible | Always visible |
| Profile editing | Header button | Header button | Panel button |
| Pit boss workflow speed | Slow | Fast | Fast |
| Layout complexity | Simple | Medium | Complex |
| Component consolidation | Clean | Clean | Mixed |
| Maintenance burden | Two pages | One page | One complex page |

## 5. Recommendation

### Primary Recommendation: **Option B - Embedded Search in Player 360**

This eliminates the identified redundancy while preserving PRD-022's key benefits:

| PRD-022 Goal | How Option B Achieves It |
|--------------|--------------------------|
| URL-authoritative | `/players/[playerId]` remains canonical |
| Single detail surface | Player 360 is the only detail surface |
| Shareable URLs | Deep links work identically |
| Component consolidation | All panels in `player-360/` |
| Profile editing | `PlayerEditModal` in Player 360 header |
| No Zustand pseudo-routing | URL drives all state |

### Proposed Layout Structure

```tsx
// app/(dashboard)/players/[[...playerId]]/page.tsx
// Catch-all route handles both /players and /players/[playerId]

<Player360LayoutProvider playerId={playerId}>
  <Player360Layout>
    {/* Collapsible search sidebar */}
    <Player360Sidebar>
      <PlayerSearchCommand onSelectPlayer={handleSelectPlayer} />
      <RecentPlayersList />
    </Player360Sidebar>

    {/* Main content area */}
    <Player360Main>
      {playerId ? (
        <>
          <Player360Header>
            <PlayerIdentity player={player} />
            <PlayerEditButton onClick={() => setEditModalOpen(true)} />
            <PlayerEditModal playerId={playerId} open={editModalOpen} />
          </Player360Header>
          <Player360Body>
            <Player360LeftRail>{/* Metrics */}</Player360LeftRail>
            <Player360Center>{/* Timeline */}</Player360Center>
            <Player360RightRail>{/* Collaboration */}</Player360RightRail>
          </Player360Body>
        </>
      ) : (
        <Player360EmptyState />
      )}
    </Player360Main>
  </Player360Layout>
</Player360LayoutProvider>
```

### URL Handling

```typescript
// When user selects a player from search:
const handleSelectPlayer = (playerId: string) => {
  // Update URL without full page navigation
  router.replace(`/players/${playerId}`, { scroll: false });
};

// When user clears selection:
const handleClearSelection = () => {
  router.replace('/players', { scroll: false });
};
```

### Profile Editing Integration

```tsx
// components/player-360/header/player-360-header-content.tsx
export function Player360HeaderContent({ playerId }: { playerId: string }) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const { data: player } = usePlayer(playerId);

  return (
    <div className="flex items-center justify-between px-4 py-3">
      {/* Player identity */}
      <div className="flex items-center gap-4">
        <PlayerAvatar player={player} />
        <div>
          <h1 className="text-xl font-bold">{player?.first_name} {player?.last_name}</h1>
          <PlayerStatusBadge status={player?.enrollment_status} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" />
          Edit Profile
        </Button>
        {/* Other quick actions */}
      </div>

      {/* Edit Modal - reuse existing component */}
      <PlayerEditModal
        playerId={playerId}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />
    </div>
  );
}
```

## 6. Implementation Impact on PRD-022

If Option B is adopted, the following PRD-022 workstreams would change:

| Workstream | Original Scope | Revised Scope |
|------------|----------------|---------------|
| WS1 | Create `/players/[playerId]/page.tsx` | Create catch-all route with search sidebar |
| WS2 | Timeline 308 redirect | Unchanged |
| WS3 | Navigation utilities | Simplified (no `returnTo` needed) |
| WS4 | Dashboard demotion | **Removed** - dashboard becomes part of Player 360 |
| WS5 | Zustand store modification | Unchanged (still row highlight only) |
| WS6 | Query key registry | Unchanged |
| WS7 | ESLint configuration | Unchanged |
| WS8 | Component consolidation | Add `PlayerEditModal` to player-360 |
| WS9 | Component cleanup | Unchanged |
| WS10 | Unit + integration tests | Update for new layout |
| WS11 | E2E tests | Update for embedded search flow |
| WS12 | CODEOWNERS | Unchanged |

**New Workstream:** WS-NEW: Search Sidebar Integration
- Move `PlayerSearchCommand` into Player 360 layout
- Create `Player360Sidebar` component
- Implement `router.replace()` navigation pattern
- Handle "no player selected" empty state

## 7. Open Questions for Decision

1. **Sidebar behavior:** Should the search sidebar be:
   - Always visible (persistent)
   - Toggleable via button/shortcut
   - Auto-collapse on player selection

2. **Recent players:** Should the sidebar show:
   - Recent searches only
   - Pinned/favorite players
   - Both

3. **Empty state:** When no player is selected (`/players`), should the main area show:
   - Empty state illustration with guidance
   - Recent player cards
   - Dashboard-style overview

4. **Mobile behavior:** On small screens, should search be:
   - Sheet/drawer overlay
   - Separate page (fallback to Option A behavior)

5. **Profile editing scope:** Should the edit modal support:
   - Basic info only (name, DOB)
   - Extended info (address, contact)
   - Identity verification updates

## 8. Next Steps

1. **Decision:** Confirm architectural direction (A, B, or C)
2. **If Option B:** Revise EXECUTION-SPEC-PRD-022.md with updated workstreams
3. **Profile editing:** Confirm scope and migrate `PlayerEditModal` to `player-360/`
4. **Prototype:** Build search sidebar component to validate UX
5. **Update PRD-022:** Reflect chosen architecture in PRD document

---

## Appendix: File References

### Components to Preserve and Migrate

```
components/player-dashboard/
├── player-edit-modal.tsx    → Migrate to player-360/header/
├── player-edit-form.tsx     → Migrate to player-360/header/
└── player-search-command.tsx → Migrate to player-360/sidebar/
```

### Components to Deprecate (After Migration)

```
components/player-dashboard/
├── player-profile-panel.tsx    → Superseded by Player360Header
├── notes-panel.tsx             → Superseded by CollaborationPanel
├── metrics-panel.tsx           → Superseded by Player360LeftRail
├── compliance-panel.tsx        → Superseded by CompliancePanel
├── activity-visualization-panel.tsx → Superseded by Timeline
├── loyalty-panel.tsx           → Superseded by LeftRail section
└── session-control-panel.tsx   → Superseded by Header actions
```

---

**Document Version:** 1.0.0
**Created:** 2026-01-24
**Status:** Draft - Pending Decision
