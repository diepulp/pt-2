# Player 360 Consolidation Strategy

**Version:** 1.0.0
**Status:** Draft
**Created:** 2026-01-21
**Related:** GAP-PLAYER-360-NAVIGATION.md, ADR-029, player-360-crm-dashboard-ux-ui-baselines.md

---

## Executive Summary

This document defines the strategy for consolidating the scattered player-related UI features into a unified **Player 360 Portal** using the existing Player Timeline Dashboard as the backbone. The consolidation follows **Option B** from the Gap Analysis: replace the current dashboard with the Player 360 3-panel layout as the canonical player detail view.

### Goals

1. **Single Source of Truth**: One `/players/[playerId]` route for all player information
2. **Feature Preservation**: Retain all working features (search, profile edit, loyalty, timeline)
3. **UX Consistency**: Adopt the 3-panel layout as the standard ("scan → decide → act")
4. **State Management Alignment**: URL-based player selection (shareable, bookmarkable)
5. **Incremental Delivery**: Phased migration without breaking existing functionality

---

## Current State Analysis

### Existing Routes

| Route | Purpose | State Management | Status |
|-------|---------|------------------|--------|
| `/players` | Player Lookup Dashboard | Zustand (`usePlayerDashboard`) | Working |
| `/players/[playerId]/timeline` | Player 360 Timeline | URL param (route-based) | Working |
| `/players/[playerId]` | Player Detail (default) | N/A | **Missing** |

### Feature Location Matrix

| Feature | Current Location | Target Location | Migration Effort |
|---------|------------------|-----------------|------------------|
| Player Search | `player-search-command.tsx` | `/players` (search-only page) | Refactor |
| Profile Panel | `player-profile-panel.tsx` | `Player360Header` | Merge |
| Profile Edit Modal | `player-edit-modal.tsx` | `Player360Header` action | Reuse |
| Loyalty Panel | `loyalty-panel.tsx` | Player 360 Left Rail | Integrate |
| Timeline | `timeline-content.tsx` | Player 360 Center (already) | None |
| Metrics Tiles | Timeline left rail | Player 360 Left Rail | Extend |
| Notes Panel | Placeholder | Player 360 Right Rail | Build |
| Compliance Panel | Placeholder | Player 360 Right Rail tab | Build |
| Session Control | Placeholder | Player 360 Header/Actions | Design |

### Component Inventory

**Working Components to Preserve:**
- `components/player-dashboard/player-search-command.tsx` (303 lines) - Debounced search with status badges
- `components/player-dashboard/player-edit-modal.tsx` (150 lines) - Profile edit modal
- `components/player-dashboard/player-edit-form.tsx` - Zod-validated form
- `components/player-dashboard/loyalty-panel.tsx` (248 lines) - Tier display with progression

**Player 360 Components (Backbone):**
- `components/player-360/layout.tsx` (389 lines) - 3-panel layout system
- `components/player-360/timeline/` - Event filtering, types, pagination
- `components/player-360/collaboration/` - Notes, tags (Phase 4 ready)
- `components/player-360/compliance/` - CTR/MTL display
- `components/player-360/snapshot/` - Cross-dashboard portability

---

## Target Architecture

### Route Structure

```
app/(dashboard)/players/
├── page.tsx                           # Search-only page (simplified)
├── layout.tsx                         # Optional: shared layout for /players/*
└── [playerId]/
    ├── page.tsx                       # Player 360 Portal (canonical view)
    ├── layout.tsx                     # Player-scoped layout with header
    └── _components/
        ├── player-360-portal.tsx      # Main portal orchestration
        ├── header-with-actions.tsx    # Profile + edit + status + actions
        ├── metrics-rail.tsx           # Left rail: KPIs + Loyalty
        ├── timeline-feed.tsx          # Center: Event timeline
        └── collaboration-rail.tsx     # Right rail: Notes + Tags + Compliance
```

### URL-Based State Management

**Current (Problematic):**
```typescript
// Zustand store - not shareable
const { selectedPlayerId } = usePlayerDashboard()
```

**Target (URL-based):**
```typescript
// Route params - shareable, bookmarkable
const { playerId } = useParams<{ playerId: string }>()
```

### Navigation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar: "Player Lookup"                                       │
│     └─→ /players (search page)                                  │
│            └─→ Click result → /players/[playerId]               │
│                   └─→ Player 360 Portal (full view)             │
│                          ├─→ Profile Edit (modal)               │
│                          ├─→ Timeline (center panel)            │
│                          ├─→ Loyalty (left rail section)        │
│                          └─→ Notes/Compliance (right rail)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3-Panel Layout Specification

Following the UX baseline ("scan → decide → act"):

### Header (Sticky)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Avatar] Player Name           [Status Badge] [Tier Badge]      │
│ ID: 12345678 | Since: Jan 2024 | DOB: 1985-03-15               │
│                                                                 │
│ [Edit Profile] [Start Visit] [Add Note] [Share Snapshot]       │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
- Player identity (name, ID, enrollment date, DOB)
- Status badge (active/inactive with pulsing indicator)
- Tier badge (Bronze → Diamond with tier-specific colors)
- Quick actions: Edit Profile (modal), Start Visit, Add Note, Share Snapshot

### Left Rail (Metrics + Loyalty)

```
┌──────────────────┐
│ KEY METRICS      │
├──────────────────┤
│ Total Events  47 │
│ Sessions      12 │
│ Financial    $8K │
│ Points    15,230 │
├──────────────────┤
│ ENGAGEMENT       │
│ [████████░░] 78% │
│ Active Player    │
├──────────────────┤
│ LOYALTY          │
│ ★ Gold Tier      │
│ 15,230 pts       │
│ → 4,770 to Plat  │
├──────────────────┤
│ RECENCY          │
│ Last visit: 2d   │
│ Avg freq: 3/week │
└──────────────────┘
```

**Sections:**
1. **Key Metrics**: Event counts by category (from timeline aggregation)
2. **Engagement Band**: Active/Cooling/Dormant indicator
3. **Loyalty Summary**: Tier + points + progression (from loyalty service)
4. **Recency/Frequency**: Visit patterns (derived metric)

### Center Panel (Timeline)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Filter: Session ✓] [Gaming ✓] [Financial] [Loyalty] [Staff]   │
│ [Date: Last 30 days ▼]                         [3 active] Clear│
├─────────────────────────────────────────────────────────────────┤
│ TODAY                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🎰 Rating Started                              2:15 PM      │ │
│ │    Table BJ-04, Seat 3 | Avg Bet: $50                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 💵 Cash In                                     1:30 PM      │ │
│ │    $500 | Source: Cage | Visit #V-2026-0121                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ YESTERDAY                                                       │
│ ...                                                             │
│                         [Load more events...]                   │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Filter bar with event type chips (multi-select)
- Date range presets
- Day grouping with sticky headers
- Expandable event cards
- Infinite scroll with keyset pagination

### Right Rail (Collaboration + Compliance)

```
┌──────────────────────────┐
│ [Notes] [Tags] [Compliance] │
├──────────────────────────┤
│ NOTES                    │
│ ┌────────────────────────┐│
│ │ [Add note...]          ││
│ └────────────────────────┘│
│ ┌────────────────────────┐│
│ │ "VIP guest, prefers    ││
│ │  corner seats"         ││
│ │ — J. Smith, 1/20       ││
│ └────────────────────────┘│
├──────────────────────────┤
│ TAGS                     │
│ [VIP] [High Roller]      │
│ [Service Alert]          │
│ + Add tag...             │
├──────────────────────────┤
│ SHIFT REPORT             │
│ [Add to today's report]  │
└──────────────────────────┘
```

**Tabs:**
1. **Notes**: Staff notes with author attribution
2. **Tags**: Quick-apply chips (VIP, Risk flags, Preferences)
3. **Compliance**: CTR progress bar + MTL list (separate from timeline)

---

## Feature Migration Plan

### Phase 1: Navigation Bridge (Interim)

**Goal:** Add navigation from existing dashboard to Player 360 Timeline

**Changes:**
1. Add "View Full Profile →" button to `player-profile-panel.tsx`
2. Link navigates to `/players/[playerId]/timeline`
3. Add breadcrumb in timeline to return to `/players`

**Files Modified:**
- `components/player-dashboard/player-profile-panel.tsx`
- `app/(dashboard)/players/[playerId]/timeline/page.tsx`

**Definition of Done:**
- [ ] Button visible when player selected
- [ ] Navigation works both directions
- [ ] URL is shareable

### Phase 2: Search-Only Page Refactor

**Goal:** Simplify `/players` to search-focused entry point

**Changes:**
1. Remove grid layout with placeholder panels
2. Keep `PlayerSearchCommand` as primary UI
3. Add search results list with navigation to `/players/[playerId]`
4. Remove Zustand `selectedPlayerId` (use URL navigation instead)

**Route Before:**
```tsx
// /players/page.tsx
<PlayerDashboard>
  <PlayerSearchCommand />
  <PlayerProfilePanel />
  <MetricsPanel />
  <LoyaltyPanel />
  ...
</PlayerDashboard>
```

**Route After:**
```tsx
// /players/page.tsx
<PlayerSearchPage>
  <PageHeader title="Player Lookup" />
  <PlayerSearchWithResults onSelect={(id) => router.push(`/players/${id}`)} />
  <RecentPlayers /> {/* Optional: quick access list */}
</PlayerSearchPage>
```

**Files Modified:**
- `app/(dashboard)/players/page.tsx` - Simplify to search-only
- `components/player-dashboard/player-search-command.tsx` - Add result navigation
- `stores/player-dashboard.ts` - Deprecate or remove

**Definition of Done:**
- [ ] `/players` shows search UI only
- [ ] Search result click navigates to `/players/[playerId]`
- [ ] Zustand store deprecated
- [ ] No broken references

### Phase 3: Player 360 as Default View

**Goal:** Move timeline to `/players/[playerId]` as canonical player view

**Changes:**
1. Create `/players/[playerId]/page.tsx` → renders Player 360 Portal
2. Move `timeline-content.tsx` logic to new portal component
3. Add redirect from `/players/[playerId]/timeline` to `/players/[playerId]` (preserve old URLs)
4. Update sidebar to show "Player Lookup" only

**Route Structure:**
```
app/(dashboard)/players/
├── page.tsx                    # Search-only
└── [playerId]/
    ├── page.tsx                # Player 360 Portal (NEW)
    ├── layout.tsx              # Player-scoped layout
    └── timeline/
        └── page.tsx            # Redirect to parent (backward compat)
```

**Files Created:**
- `app/(dashboard)/players/[playerId]/page.tsx`
- `app/(dashboard)/players/[playerId]/layout.tsx`
- `components/player-360/portal/player-360-portal.tsx`

**Files Modified:**
- `app/(dashboard)/players/[playerId]/timeline/page.tsx` - Add redirect
- `components/layout/app-sidebar.tsx` - Update navigation

**Definition of Done:**
- [ ] `/players/[playerId]` shows full Player 360 view
- [ ] Old timeline URL redirects correctly
- [ ] Sidebar navigation updated
- [ ] All timeline features preserved

### Phase 4: Feature Integration

**Goal:** Integrate preserved features into Player 360 layout

#### 4A: Profile Edit Modal Integration

**Changes:**
1. Add "Edit Profile" button to `Player360Header`
2. Reuse existing `PlayerEditModal` component
3. Pass `playerId` from URL params

**Files Modified:**
- `components/player-360/layout.tsx` - Add edit action to header
- Mount `PlayerEditModal` in portal

#### 4B: Loyalty Integration

**Changes:**
1. Create `LoyaltySection` for left rail
2. Adapt `loyalty-panel.tsx` to compact rail format
3. Show: Tier badge, points balance, progression bar

**Files Created:**
- `components/player-360/metrics/loyalty-section.tsx`

**Data Source:** `usePlayerLoyalty(playerId, casinoId)` (existing hook)

#### 4C: Enhanced Metrics

**Changes:**
1. Add recency/frequency metrics to left rail
2. Add engagement band indicator
3. Add "data freshness" timestamp

**Files Modified:**
- `components/player-360/metrics/` - Extend existing metrics components

#### 4D: Right Rail Build-out (Phase 4 features)

**Changes:**
1. Implement Notes tab with composer
2. Implement Tags tab with quick-apply chips
3. Add "Share to Shift Report" action
4. Compliance tab: CTR progress + MTL list

**Files to Build:**
- `components/player-360/collaboration/notes-tab.tsx`
- `components/player-360/collaboration/tags-tab.tsx`
- `components/player-360/compliance/compliance-tab.tsx`
- `components/player-360/snapshot/share-action.tsx`

**Definition of Done (Phase 4):**
- [ ] Profile edit works from Player 360 header
- [ ] Loyalty summary visible in left rail
- [ ] Notes can be added/viewed
- [ ] Tags can be applied/removed
- [ ] Compliance status visible
- [ ] Snapshot shareable

### Phase 5: Cleanup & Deprecation

**Goal:** Remove redundant components and stores

**Deprecate:**
- `components/player-dashboard/player-dashboard.tsx`
- `components/player-dashboard/player-profile-panel.tsx`
- `components/player-dashboard/metrics-panel.tsx`
- `components/player-dashboard/session-control-panel.tsx`
- `components/player-dashboard/activity-visualization-panel.tsx`
- `components/player-dashboard/compliance-panel.tsx`
- `components/player-dashboard/notes-panel.tsx`
- `stores/player-dashboard.ts` (Zustand store)

**Keep:**
- `components/player-dashboard/player-search-command.tsx` (move to shared)
- `components/player-dashboard/player-edit-modal.tsx` (reuse in Player 360)
- `components/player-dashboard/player-edit-form.tsx` (reuse)
- `components/player-dashboard/loyalty-panel.tsx` (adapt for rail)

---

## Component Reuse Strategy

### Direct Reuse (No Changes)

| Component | Current Path | Reuse Location |
|-----------|--------------|----------------|
| `PlayerEditModal` | `player-dashboard/player-edit-modal.tsx` | Player 360 Header action |
| `PlayerEditForm` | `player-dashboard/player-edit-form.tsx` | Inside edit modal |

### Adapt for New Context

| Component | Current Path | Adaptation Needed |
|-----------|--------------|-------------------|
| `PlayerSearchCommand` | `player-dashboard/player-search-command.tsx` | Add `onSelect(playerId)` callback for navigation |
| `LoyaltyPanel` | `player-dashboard/loyalty-panel.tsx` | Create compact `LoyaltySection` variant for rail |

### Already in Player 360

| Component | Path | Status |
|-----------|------|--------|
| `Player360Layout` | `player-360/layout.tsx` | Ready |
| `SnapshotCard` | `player-360/snapshot/card.tsx` | Ready |
| `CollaborationPanel` | `player-360/collaboration/panel.tsx` | Phase 4 placeholder |
| `CompliancePanel` | `player-360/compliance/` | Phase 4 placeholder |
| Timeline components | `player-360/timeline/` | Ready |

---

## Service Layer Alignment

All services remain unchanged. The consolidation is UI-only.

| Service | Location | Used By |
|---------|----------|---------|
| `player` | `services/player/` | Search, profile CRUD, identity |
| `player-timeline` | `services/player-timeline/` | Timeline events |
| `loyalty` | `services/loyalty/` | Tier, points, rewards |
| `visit` | `services/visit/` | Active visit status |

---

## State Management Migration

### Remove Zustand Dependency

**Current:**
```typescript
// stores/player-dashboard.ts
export const usePlayerDashboard = create<PlayerDashboardState>((set) => ({
  selectedPlayerId: null,
  setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
}))
```

**Target:** Delete store, use URL params everywhere

**Migration Pattern:**
```typescript
// Before (Zustand)
const { selectedPlayerId } = usePlayerDashboard()

// After (URL params)
const { playerId } = useParams<{ playerId: string }>()
// or for search page:
const router = useRouter()
const handleSelect = (id: string) => router.push(`/players/${id}`)
```

---

## Testing Strategy

### Unit Tests

- Test Player 360 portal renders with mock player data
- Test navigation from search to player detail
- Test profile edit modal integration
- Test loyalty section data binding

### E2E Tests (Playwright)

```typescript
// tests/e2e/player-360-portal.spec.ts
test('search and navigate to player 360', async ({ page }) => {
  await page.goto('/players')
  await page.fill('[data-testid="player-search"]', 'John')
  await page.click('[data-testid="search-result-0"]')
  await expect(page).toHaveURL(/\/players\/[a-f0-9-]+/)
  await expect(page.locator('[data-testid="player-360-header"]')).toBeVisible()
})

test('edit profile from player 360', async ({ page }) => {
  await page.goto('/players/test-player-id')
  await page.click('[data-testid="edit-profile-btn"]')
  await expect(page.locator('[data-testid="player-edit-modal"]')).toBeVisible()
})
```

---

## Implementation Timeline

| Phase | Scope | Dependencies | Effort |
|-------|-------|--------------|--------|
| Phase 1 | Navigation bridge | None | Small |
| Phase 2 | Search-only refactor | Phase 1 | Medium |
| Phase 3 | Player 360 as default | Phase 2 | Medium |
| Phase 4 | Feature integration | Phase 3 | Large |
| Phase 5 | Cleanup & deprecation | Phase 4 | Small |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing workflows | Phase 1 adds bridge, doesn't remove anything |
| URL changes break bookmarks | Phase 3 adds redirects from old routes |
| Feature regression | Preserve all working components, adapt don't rewrite |
| State management complexity | Clean migration from Zustand to URL params |
| Testing gaps | E2E tests cover critical user journeys |

---

## Success Criteria

1. **Single URL** for all player information: `/players/[playerId]`
2. **All features accessible** from one view (profile, loyalty, timeline, notes)
3. **URL shareable** - deep links work for any player
4. **No feature regression** - all current capabilities preserved
5. **Cleaner codebase** - fewer duplicate components, one pattern

---

## References

- `docs/00-vision/player-dashboard/GAP-PLAYER-360-NAVIGATION.md` - Gap analysis
- `docs/00-vision/player-dashboard/player-360-crm-dashboard-ux-ui-baselines.md` - UX design
- `docs/00-vision/player-dashboard/player-360-dashboard-mvp-outline.md` - MVP scope
- `docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md` - Event taxonomy
- `components/player-360/` - Existing Player 360 components
- `components/player-dashboard/` - Legacy dashboard components

---

## Appendix A: File Change Summary

### Files to Create
- `app/(dashboard)/players/[playerId]/page.tsx`
- `app/(dashboard)/players/[playerId]/layout.tsx`
- `components/player-360/portal/player-360-portal.tsx`
- `components/player-360/portal/header-with-actions.tsx`
- `components/player-360/metrics/loyalty-section.tsx`

### Files to Modify
- `app/(dashboard)/players/page.tsx` - Simplify
- `app/(dashboard)/players/[playerId]/timeline/page.tsx` - Add redirect
- `components/player-dashboard/player-search-command.tsx` - Add navigation callback
- `components/layout/app-sidebar.tsx` - Update nav items

### Files to Deprecate (Phase 5)
- `components/player-dashboard/player-dashboard.tsx`
- `components/player-dashboard/player-profile-panel.tsx`
- `components/player-dashboard/metrics-panel.tsx`
- `components/player-dashboard/session-control-panel.tsx`
- `components/player-dashboard/activity-visualization-panel.tsx`
- `components/player-dashboard/compliance-panel.tsx`
- `components/player-dashboard/notes-panel.tsx`
- `stores/player-dashboard.ts`
