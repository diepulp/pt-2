# GAP: Player 360 Timeline Navigation Integration

**Status:** Open
**Priority:** High
**Created:** 2026-01-21
**Related:** ADR-029, EXEC-SPEC-029, player-360-crm-dashboard-ux-ui-baselines.md

---

## Summary

The Player 360 Timeline (`/players/[playerId]/timeline`) has been implemented but has **no navigation entry points** in the UI. Users can only access it via manual URL entry. Additionally, there's a state management paradigm mismatch between the existing player dashboard and the new timeline route.

---

## Current Architecture

| Route | Purpose | Navigation Entry | State Management |
|-------|---------|------------------|------------------|
| `/players` | Player Lookup Dashboard | Sidebar → "Players" | Zustand (`usePlayerDashboard`) |
| `/players/[playerId]/timeline` | Player 360 Timeline | **None** | URL param (route-based) |

### Route Structure

```
app/(dashboard)/players/
├── page.tsx                           # Player lookup dashboard (Zustand-based)
└── [playerId]/
    └── timeline/
        ├── page.tsx                   # Player 360 Timeline
        └── _components/
            └── timeline-content.tsx   # Timeline implementation
```

### Missing Elements

1. **No `/players/[playerId]/page.tsx`** - No default player detail route exists
2. **No links to timeline** - Zero UI elements navigate to the timeline route
3. **No breadcrumb navigation** - Timeline has no way to return to player lookup

---

## Architectural Gaps

### Gap 1: Navigation Isolation

The timeline route is completely isolated from the rest of the application. There are no:
- Links from player profile panel
- Quick action buttons
- Sidebar sub-menu items
- Search result actions
- Rating slip / visit drilldown links

### Gap 2: State Management Mismatch

| Component | Pattern | Implications |
|-----------|---------|--------------|
| Player Dashboard (`/players`) | Zustand store for `selectedPlayerId` | Client-side, not URL-shareable |
| Timeline (`/players/[playerId]/timeline`) | URL param `playerId` | Shareable, bookmarkable |

This creates UX friction:
- Selecting a player in dashboard doesn't navigate anywhere
- Timeline URL can't be derived from dashboard state
- Back navigation from timeline loses context

### Gap 3: Feature Overlap

Both views contain overlapping functionality:

| Feature | Player Dashboard | Player 360 Timeline |
|---------|------------------|---------------------|
| Player Profile | `player-profile-panel.tsx` | `Player360Header` |
| Notes | Notes Panel | `collaboration/panel.tsx` |
| Activity | Activity Visualization Panel | Center timeline |
| Metrics | Performance Metrics Panel | Left rail metrics |
| Compliance | Compliance Panel | `compliance/panel.tsx` |

---

## Integration Options

### Option A: Add Navigation Link (Minimal)

Add "View Timeline" button to the player profile panel in the existing dashboard.

**Changes Required:**
- `components/player-dashboard/player-profile-panel.tsx` - Add Link button
- Consider: How to pass `playerId` from Zustand to URL

**Pros:**
- Minimal code change
- Preserves both UIs

**Cons:**
- Two separate views for same player
- Context switching overhead
- Doesn't resolve paradigm mismatch

### Option B: Replace Dashboard with Player 360 (Recommended)

Make the Player 360 Timeline the canonical player detail view at `/players/[playerId]`.

**Route Structure:**
```
app/(dashboard)/players/
├── page.tsx                    # Search/lookup only (simplified)
└── [playerId]/
    ├── page.tsx                # Player 360 view (was timeline)
    └── layout.tsx              # Optional: shared layout
```

**Changes Required:**
1. Rename/move timeline to be the default `[playerId]/page.tsx`
2. Simplify `/players/page.tsx` to search-only with navigation to player detail
3. Update sidebar to show "Player Lookup" (search) and remove redundant items
4. Add search result click → navigate to `/players/[playerId]`

**Pros:**
- Single source of truth for player view
- URL-based state (shareable, bookmarkable)
- Aligns with UX baseline vision
- 3-panel layout handles all use cases

**Cons:**
- Larger refactor
- May need to preserve quick-lookup workflow

### Option C: Tab Integration (Hybrid)

Add timeline as a tab within the existing dashboard.

**Pros:**
- Unified experience
- No route changes

**Cons:**
- Complex state management (Zustand + heavy component)
- Performance concerns (loading timeline data eagerly)
- Mixed paradigms

### Option D: Sidebar Sub-Navigation

Add timeline as a sub-menu item under Players in the sidebar.

**Changes Required:**
- `components/layout/app-sidebar.tsx` - Add dynamic sub-item when player selected
- Persist selected player in URL or session

**Pros:**
- Discoverable
- Consistent with sidebar pattern

**Cons:**
- Still needs player selection mechanism
- Sidebar gets cluttered

---

## Recommendation

**Proceed with Option B (Replace Dashboard)** for the following reasons:

1. **UX Baseline Alignment**: The Player 360 3-panel design was created as the canonical player view
2. **State Consistency**: URL-based player ID enables deep linking and sharing
3. **Feature Consolidation**: Eliminates duplicate panels (notes, metrics, compliance)
4. **Modern Pattern**: Route-based navigation is more predictable than client-side state

### Migration Path

1. **Phase 1**: Add quick navigation link (Option A) as interim solution
2. **Phase 2**: Refactor `/players` to search-only with navigation
3. **Phase 3**: Move timeline to `/players/[playerId]` as default view
4. **Phase 4**: Deprecate old dashboard panels, migrate features to Player 360

---

## Action Items

- [x] Create PRD for Player 360 Navigation Integration → **PRD-022-player-360-navigation-consolidation.md**
- [x] Design search → detail navigation flow → Documented in PRD-022 §6
- [x] Decide on interim solution (Option A) timeline → **Skip interim; proceed directly with Option B per resolution plan**
- [x] Plan deprecation of overlapping dashboard panels → Documented in PRD-022 §9 (Component Ownership Map)

---

## References

- `docs/00-vision/player-dashboard/player-360-crm-dashboard-ux-ui-baselines.md` - UX design
- `docs/00-vision/player-dashboard/player-360-dashboard-mvp-outline.md` - MVP scope
- `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md` - Event taxonomy
- `components/player-dashboard/` - Existing dashboard components
- `components/player-360/` - New Player 360 components
