---
prd_id: PRD-023
title: "Player 360 Panels v0 — Action-First Summary, Charts & Timeline"
status: Draft
version: 2.2.0
created: 2026-01-24
updated: 2026-01-26
author: Claude (lead-architect)
priority: P1
category: FEATURE/UI
bounded_contexts:
  - PlayerContext
  - VisitContext
  - LoyaltyContext
depends_on:
  - PRD-022-PATCH-OPTION-B (Embedded Search in Player 360)
  - ADR-029 (Player 360 Timeline Dashboard)
supersedes:
  - PRD-023 v1.0.0
  - PRD-023-PATCH-UX (Addendum)
tags: [player-360, ux, panels, charts, timeline, mvp, dashboard, action-first]
---

# PRD-023: Player 360 Panels v0

## 1. Overview

- **Owner:** Product/Engineering
- **Status:** Draft
- **Summary:** Implement action-first dashboard enhancements to Player 360 that enable pit staff to quickly assess player value, session momentum, and reward eligibility. This PRD consolidates the original v1.0.0 specification with UX improvements that eliminate redundant temporal displays and prioritize operational decision-making over passive reporting.

## 2. Problem & Goals

### 2.1 Problem Statement

The current Player 360 dashboard provides timeline-based activity tracking but lacks **quick comprehension** and **actionability**. Pit staff need to answer operational questions in under 10 seconds:

1. **Player value now** — win/loss, buy-ins, "action load" (flee vs whale heuristic)
2. **Session momentum** — active vs cooling off, last action time, cash velocity
3. **Landmines** — reward eligibility/cooldowns ("why didn't I get a matchplay?"), notes/approval flags
4. **Where & what** — current table/area, last known location, recent events

**Current Issues:**
- Multiple period metrics (30d/90d) lack session context
- Temporal story repeated across snapshot tiles AND charts (visits + rewards shown twice)
- Static displays with no interaction surfaces to drive the timeline
- No eligibility/cooldown visibility for rewards

**Result:** Duplicated temporal data, layout clutter, low actionability.

### 2.2 Goals

1. **Action-first metrics** — Session value, cash velocity, engagement, and reward eligibility as primary tiles
2. **De-duplicate temporal data** — Trend shown in ONE place only (either inline micro-trends or single consolidated chart)
3. **Interactive coordination** — Tile clicks filter timeline to relevant category
4. **Reward eligibility visibility** — Surface availability status, cooldowns, and reason codes
5. **< 10 second comprehension** — First meaningful answer about player state within 10 seconds

### 2.3 Non-Goals

Per the vision spec, the following are **explicitly prohibited** in Player 360:

- Leaderboards, "top players", rankings
- Cohorts/segments
- Casino-wide averages or comparisons ("above average", "percentile")
- Shift/day/table rollups (belongs to Shift Dashboard)
- Predictive scoring (churn risk, LTV, ML recommendations)
- Cross-player search analytics or aggregated dashboards

**Rule of thumb:** If it requires data from *other players* to be meaningful, it belongs outside Player 360.

## 3. Users & Use Cases

### 3.1 Primary Personas

| Persona | Primary Need |
|---------|--------------|
| **Pit Boss** | Quick player value assessment during floor rounds |
| **Floor Supervisor** | Monitor player engagement patterns, session status |
| **Host** | Evaluate loyalty activity, reward eligibility for interactions |

### 3.2 User Stories

```gherkin
Feature: Player 360 Summary Band (Action-First)

  Scenario: View player session value
    Given I am viewing a player's 360 dashboard
    When the page loads
    Then I see a Summary Band with 4 action tiles
    And the "Session Value" tile shows net W/L and theo estimate
    And I can see when their last action occurred

  Scenario: Check reward eligibility
    Given I am viewing a player's 360 dashboard
    When I look at the "Rewards Eligibility" tile
    Then I see whether matchplay is "Available" or "Not available"
    And if not available, I see the cooldown time remaining
    And I see a reason code explaining why (e.g., COOLDOWN_ACTIVE)

  Scenario: Filter timeline by tile interaction
    Given I am viewing a player's 360 dashboard
    When I click on the "Cash Velocity" tile
    Then the timeline filters to show only "Financial" events
    And the timeline scrolls to the first matching event
```

```gherkin
Feature: Player 360 Trend Visualization

  Scenario: View activity trend (Pattern A - Inline)
    Given I am viewing a player's 360 dashboard
    And the implementation uses Pattern A (no separate charts section)
    When I look at the Summary Band tiles
    Then I see micro-trend indicators inside relevant tiles
    And there is no separate Charts Section

  Scenario: View activity trend (Pattern B - Consolidated)
    Given I am viewing a player's 360 dashboard
    And the implementation uses Pattern B (consolidated chart)
    When I look at the Charts Section
    Then I see ONE "Activity" chart with visits + rewards series
    And I do NOT see separate Visits and Rewards charts
```

```gherkin
Feature: Player 360 Rewards Panel

  Scenario: Understand why reward unavailable
    Given I am viewing a player who is not eligible for a matchplay
    When I look at the Rewards Eligibility panel
    Then I see status "Not available"
    And I see "Next eligible in: HH:MM"
    And I see reason codes (e.g., MIN_PLAY_NOT_MET, COOLDOWN_ACTIVE)
    And I see guidance on what to do (e.g., "Play X more minutes")

  Scenario: View reward history
    Given I am viewing a player's 360 dashboard
    When I expand the rewards detail
    Then I see a descending list of issued rewards
    And I can filter by reward type (Matchplay, Freeplay, All)
```

## 4. Scope & Feature List

### 4.1 In Scope

| Component | Description | Priority |
|-----------|-------------|----------|
| **Summary Band** | 4 action-first tiles replacing 6 static snapshot tiles | P1 |
| **Tile Interactions** | Click to filter timeline + scroll to first match | P1 |
| **Time Lens Control** | Global `30d | 90d | 12w` selector affecting tiles and timeline | P1 |
| **Trend Visualization** | EITHER inline micro-trends (Pattern A) OR single Activity chart (Pattern B) | P1 |
| **Rewards Eligibility Card** | Status, cooldown, reason codes, guidance | P1 |
| **Rewards History List** | Descending list with type filters | P1 |
| **Recent Events Strip** | 3-item strip (last buy-in, last reward, last note) above timeline | P2 |
| **Timeline Filters** | Source category chips coordinated with tile clicks | P1 |
| **Timeline Pagination** | Infinite scroll with "Load More", 50 items per page | P1 |
| **Empty States** | No visits, no rewards, no activity states | P1 |
| **Header Actions** | Edit Profile (existing), Add Note, Issue Reward buttons | P2 |

### 4.2 Out of Scope

- New bounded contexts or backend service decomposition
- Cross-player analytics of any kind
- Heavy AI/ML layers (rule-based eligibility logic only)
- Mobile-specific layouts (responsive design improvements)
- Loyalty issuance workflow (Issue Reward button may be stub if backend not ready)

### 4.3 Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| PRD-022-PATCH-OPTION-B (Embedded Search) | Complete | Player360 |
| ADR-029 (Timeline Dashboard) | Complete | Player360 |
| `useInfinitePlayerTimeline` hook | Complete | Player360 |
| Visit service (`services/visit/`) | Complete | VisitContext |
| Loyalty service (`services/loyalty/`) | Complete | LoyaltyContext |

## 5. Requirements

### 5.1 Functional Requirements

**Summary Band (Center Panel):**
- FR-1: Summary Band MUST render 4 action tiles: Session Value, Cash Velocity, Engagement, Rewards Eligibility
- FR-2: Each tile MUST display primary metric, secondary metric, and micro-detail (timestamp or state)
- FR-3: Clicking a tile MUST apply a timeline filter and scroll to first matching event
- FR-4: Historical metrics (30d/90d counts) MAY appear as secondary text, NOT as equal-weight tiles

**Viewport & Scroll Constraints (CRITICAL):**
- FR-5: The main dashboard surface (`Player360Layout`) MUST NOT scroll — viewport is fixed
- FR-6: Only content within each rail/panel may scroll independently (`overflow-y-auto`)
- FR-7: Left Rail content MUST fit within viewport OR scroll internally within the rail

**Left Rail — Interactive Control Surface (Pattern A: Compact):**

> **Design Principles:**
> 1. Nothing in the left rail may be "read-only decoration." Every element must filter, navigate, or explain.
> 2. Left Rail must fit within viewport — prioritize above-the-fold content.

*Content Budget (Viewport Fit):*
- Filter Tiles: ~200px (4 tiles × ~48px each)
- Rewards Eligibility: ~80px (compact)
- Jump To + History: Below fold, scrollable if needed
- **Total above fold: ~280-340px** (fits 768px viewport with header)

*Filter Tiles (compact, stacked):*
- FR-8: Left Rail MUST render 4 compact filter tiles (~48px height each)
- FR-9: Each tile MUST be clickable and apply the same timeline filter as its Center counterpart:
  - Session Value → `Gaming/Rating` filter
  - Cash Velocity → `Financial` filter
  - Engagement → `Session/Visit` filter
  - Rewards Eligibility → `Loyalty/Rewards` filter
- FR-10: Active filter tile MUST show visual indicator (`ring-2 ring-primary` or equivalent)
- FR-11: Active filter state MUST include a "Clear" affordance (×) to reset the filter
- FR-12: Left Rail tile values MUST be condensed (value + delta only, no labels duplicating Center)

*Rewards Eligibility Card (compact, explain + drill):*
- FR-13: Rewards Eligibility Card MUST be compact (~80px) and display:
  - Status: `Available` / `Not available`
  - One-line reason code label (e.g., "Cooldown active", "Min play not met")
  - Countdown: "Next eligible in: HH:MM" (if applicable)
- FR-14: Card MUST include "Show related events" button that:
  - Applies `Loyalty/Rewards` filter to timeline
  - Scrolls timeline to the last reward issuance event
- FR-15: If eligibility rules are not configured, UI MUST show explicit "Unknown" state

*Jump To Navigation (below fold, collapsible):*
- FR-16: Left Rail SHOULD include a collapsible "Jump To" section with anchor links:
  - "Summary" → scroll to top of center panel
  - "Chart" → scroll to chart section (if Trend Pattern B)
  - "Timeline" → scroll to timeline top
- FR-17: Jump To links MUST work with both keyboard (Enter/Space) and mouse click
- FR-18: Jump To navigation is in-page scrolling only, NOT app routing

*Rewards History List (below fold, compact):*
- FR-19: Reward History List MUST show 2-3 most recent items above fold
- FR-20: Additional items are accessible via scroll within the rail
- FR-21: Clicking a reward history item MUST scroll timeline to the corresponding event
- FR-22: Each history item MUST show: type, amount/value, relative time

**Time Lens:**
- FR-23: A global Time Lens control (`30d | 90d | 12w`) MUST affect Summary Band secondary labels
- FR-24: Time Lens selection MUST affect the default timeline query range
- FR-25: Time Lens selection SHOULD affect chart highlight/range if charts are present

**Trend Visualization (Choose One Pattern):**
- FR-26: Temporal trend MUST appear in exactly ONE place (de-duplication rule)
- FR-27 (Trend Pattern A): Integrate micro-trend sparklines inside Summary Band tiles; no separate Charts Section
- FR-28 (Trend Pattern B): Display ONE consolidated "Activity" chart with visits + rewards series; clicking a bucket filters timeline by date range

**Recent Events Strip:**
- FR-29: Recent Events Strip SHOULD display 3 items: last buy-in/cash-in, last reward, last note/flag
- FR-30: Clicking a Recent Events item MUST scroll timeline to that event

**Timeline:**
- FR-31: Timeline MUST support category filters coordinated with tile clicks (Session, Gaming, Financial, Loyalty, Staff, Compliance, Identity)
- FR-32: Timeline MUST implement pagination with "Load More" button and infinite scroll trigger at 200px from bottom
- FR-33: Timeline MUST display 50 items per page
- FR-34: Timeline filter state MUST be synchronized between Left Rail tiles and Center Summary Band tiles

**Header Actions:**
- FR-35: Header MUST include Edit Profile button (existing)
- FR-36: Header MUST include Add Note button (opens note composer or stub if notes not ready)
- FR-37: Header MUST include Issue Reward button (disabled with tooltip if loyalty issuance not ready)

### 5.2 Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| NFR-1: Time to first meaningful answer | < 10 seconds | User observation |
| NFR-2: Snapshot/summary query latency | < 150ms (p95) | Server metrics |
| NFR-3: Chart render performance | < 100ms | Client metrics |
| NFR-4: Filter interaction latency | < 50ms | Client metrics |
| NFR-5: No layout shift on data load | 0 CLS | Lighthouse |

### 5.3 Data Requirements

**Summary Band Data:**
- Session/gaming-day boundary for: session cash-in total, session net W/L, last action timestamp
- Rolling window fallback if session not defined (e.g., last 90 minutes)

**Rewards Data:**
- issued_at, reward_type, amount/value, issued_by, visit_id/session_id
- eligibility_status, next_eligible_at, reason_codes[]

**State Derivation Rules:**
- **Active**: last action within 15 minutes (configurable)
- **Idle**: otherwise
- **Cash Velocity**: `session_cash_in_total / session_duration_hours` (fallback: `last_90m_cash_in / 1.5h`)

## 6. Technical Design

> **Note:** This section specifies WHAT the system must do, not HOW. Implementation details (SQL, TypeScript code, component internals) belong in the EXECUTION-SPEC.

### 6.1 Architecture Overview

The Player 360 dashboard uses an existing **three-column layout** that MUST be preserved.

#### Viewport Constraint (CRITICAL)

> **The main dashboard surface MUST NOT scroll.** Only content within each rail/panel scrolls independently.

- `Player360Layout`: Fixed viewport (`h-full`, no outer scroll)
- `Player360Body`: `overflow-hidden` — rails handle their own scroll
- Each rail: `overflow-y-auto` — independent scroll within fixed height

This means **Left Rail content must fit within viewport OR scroll internally**.

#### Three-Column Structure

| Rail | Width | Visibility | Scroll |
|------|-------|------------|--------|
| **Left Rail** | w-72 / xl:w-80 | lg+ only | `overflow-y-auto` |
| **Center Panel** | flex-1 | Always | `overflow-y-auto` |
| **Right Rail** | w-80 (collapsible) | xl+ only | `overflow-y-auto` |

#### Left Rail Design: Pattern A — Compact (MVP)

The Left Rail must fit within viewport. Content is prioritized into two zones:

**Above the Fold (Always Visible):**
1. Filter Tiles (4 compact tiles, ~200px total)
2. Rewards Eligibility Card (status + reason, ~80px)

**Below the Fold (Scrollable):**
3. Jump To Nav (compact anchor list)
4. Rewards History (2-3 recent items)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Player360Header (sticky, ~64px)                                              │
│  ┌───────────────────────────────────────────────────────────────────────────┐│
│  │ Breadcrumb │ Avatar │ Name │ Status │ Edit │ Add Note │ Issue Reward      ││
│  └───────────────────────────────────────────────────────────────────────────┘│
├───────────────────────────────────────────────────────────────────────────────┤
│  Player360Body (flex-1, overflow-hidden — NO OUTER SCROLL)                    │
│ ┌──────────────┬─────────────────────────────────────────┬──────────────────┐ │
│ │ LEFT RAIL    │ CENTER PANEL                            │ RIGHT RAIL       │ │
│ │ overflow-y-  │ overflow-y-auto                         │ overflow-y-auto  │ │
│ │ auto         │                                         │                  │ │
│ │──────────────│─────────────────────────────────────────│──────────────────│ │
│ │ FILTER TILES │ Time Lens: [ 30d | 90d | 12w ]          │ Collaboration    │ │
│ │ (compact)    │─────────────────────────────────────────│ ┌──────────────┐ │ │
│ │ ┌──────────┐ │ Summary Band (4 action tiles)           │ │ Notes        │ │ │
│ │ │Session ●│ │ ┌────────┬────────┬────────┬────────┐  │ │ [Composer]   │ │ │
│ │ │+$1.2k [×]│←│→│Session │Cash    │Engage- │Rewards │  │ │ [list...]    │ │ │
│ │ ├──────────┤ │ │Value   │Velocity│ment    │Elig.   │  │ └──────────────┘ │ │
│ │ │Cash Vel  │ │ └────────┴────────┴────────┴────────┘  │ ┌──────────────┐ │ │
│ │ │$150/hr   │ │─────────────────────────────────────────│ │ Tags         │ │ │
│ │ ├──────────┤ │ (Trend Pattern B) Activity Chart        │ │ [VIP] [High] │ │ │
│ │ │Engage.   │ │ ┌─────────────────────────────────────┐ │ └──────────────┘ │ │
│ │ │2h ● Act  │ │ │ [combined sparkline]                │ │──────────────────│ │
│ │ ├──────────┤ │ └─────────────────────────────────────┘ │ Compliance       │ │
│ │ │Rewards   │ │─────────────────────────────────────────│ ┌──────────────┐ │ │
│ │ │✓ Avail   │ │ Recent Events Strip                     │ │ MTL Status   │ │ │
│ │ └──────────┘ │ ┌───────────┬───────────┬───────────┐  │ │ [flags...]   │ │ │
│ │──────────────│ │Buy-in $500│Reward 1d  │Note 3d    │  │ └──────────────┘ │ │
│ │ REWARDS ELIG │ └───────────┴───────────┴───────────┘  │                  │ │
│ │ ┌──────────┐ │─────────────────────────────────────────│                  │ │
│ │ │✗ N/A     │ │ Timeline Filter Bar                     │                  │ │
│ │ │Cooldown  │ │ ┌────────────────────────────────────┐ │                  │ │
│ │ │1h 12m    │ │ │ [All][Session][Gaming][Financial]  │ │                  │ │
│ │ │MIN_PLAY  │ │ └────────────────────────────────────┘ │                  │ │
│ │ │[Show evts]│→│─── filters + scrolls ─────────────────→│                  │ │
│ │ └──────────┘ │ Timeline Events                         │                  │ │
│ │··············│ ┌────────────────────────────────────┐ │                  │ │
│ │ (scroll ↓)   │ │ Visit Start - 2:30 PM              │ │                  │ │
│ │··············│ │ Cash In - 2:40 PM                  │ │                  │ │
│ │ JUMP TO      │ │ Rating Open - 2:35 PM              │ │                  │ │
│ │ ┌──────────┐ │ │ ...                                │ │                  │ │
│ │ │▸ Summary │→│ │ [Load More]                        │ │                  │ │
│ │ │▸ Chart   │→│ └────────────────────────────────────┘ │                  │ │
│ │ │▸ Timeline│→│                                         │                  │ │
│ │ └──────────┘ │                                         │                  │ │
│ │ REWARDS HIST │                                         │                  │ │
│ │ ┌──────────┐ │                                         │                  │ │
│ │ │Matchplay │→│─── scrolls to event ──────────────────→│                  │ │
│ │ │Freeplay  │→│                                         │                  │ │
│ │ └──────────┘ │                                         │                  │ │
│ └──────────────┴─────────────────────────────────────────┴──────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Layout Rules (Existing - PRESERVE):**
- `Player360Layout`: Root container (`flex flex-col h-full`) — **viewport-locked**
- `Player360Header`: Sticky header with backdrop blur (~64px)
- `Player360Body`: Three-panel flex container (`flex flex-1 min-h-0 overflow-hidden`) — **no outer scroll**
- `Player360LeftRail`: Hidden < lg, `w-72 xl:w-80`, `overflow-y-auto`, border-r
- `Player360Center`: `flex-1 min-w-0`, `overflow-y-auto` — scrolls independently
- `Player360RightRail`: Hidden < xl, `w-80`, `overflow-y-auto`, collapsible to `w-12`, border-l

**Left Rail Content Budget (Viewport Fit):**

| Section | Height | Priority | Notes |
|---------|--------|----------|-------|
| Filter Tiles (4) | ~200px | P0 | Compact, 48px each |
| Rewards Eligibility | ~80px | P0 | Status + reason + action |
| Jump To Nav | ~60px | P1 | Collapsible, 3-4 anchors |
| Rewards History | ~100px | P1 | 2-3 items, scrollable if more |
| **Total Above Fold** | ~340px | — | Fits 768px viewport with header |

**Left Rail Interaction Model:**

| Section | Role | Interaction |
|---------|------|-------------|
| Filter Tiles | Control | Click → applies timeline filter, shows ring + clear affordance |
| Rewards Eligibility | Explain | Status + reason; "Show events" → filters + scrolls timeline |
| Jump To | Navigate | Click → smooth scroll to center panel section |
| Rewards History | Drill | Click item → scrolls timeline to corresponding event |

**Filter State Synchronization:**
- Left Rail tiles and Center Summary Band tiles share the same filter state
- Clicking either updates both (active ring visible on both)
- Clear affordance (×) resets filter to "All"

**New Component Placement:**
| Component | Rail | Notes |
|-----------|------|-------|
| Filter Tiles (compact, stacked) | Left Rail | 4 tiles, ~48px each, interactive |
| Rewards Eligibility Card | Left Rail | Compact, ~80px, "Show events" action |
| Jump To Nav | Left Rail | Below fold, collapsible |
| Rewards History (2-3 items) | Left Rail | Below fold, scrollable if needed |
| Time Lens Control | Center (top) | Above Summary Band |
| Summary Band (4 tiles) | Center | Horizontal grid, interactive |
| Activity Chart (Trend Pattern B) | Center | Optional, below Summary Band |
| Recent Events Strip | Center | Above timeline filters |
| Timeline + Filters | Center | Scrollable |
| Collaboration Panel | Right Rail | Existing (notes, tags) |
| Compliance Panel | Right Rail | Existing (MTL, flags) |

### 6.2 Component Ownership

**Existing Components (PRESERVE):**

| Component | Location | Rail | Purpose |
|-----------|----------|------|---------|
| `Player360Layout` | `components/player-360/layout.tsx` | — | Root layout container |
| `Player360LayoutProvider` | `components/player-360/layout.tsx` | — | Layout context provider |
| `Player360Header` | `components/player-360/layout.tsx` | — | Sticky header slot |
| `Player360Body` | `components/player-360/layout.tsx` | — | Three-panel container |
| `Player360LeftRail` | `components/player-360/layout.tsx` | Left | Metrics rail slot |
| `Player360Center` | `components/player-360/layout.tsx` | Center | Main content slot |
| `Player360RightRail` | `components/player-360/layout.tsx` | Right | Collaboration/compliance slot |
| `Player360HeaderContent` | `components/player-360/header/` | Header | Player identity + actions |
| `CollaborationPanel` | `components/player-360/collaboration/` | Right | Notes, tags |
| `CompliancePanel` | `components/player-360/compliance/` | Right | MTL status, flags |
| `SnapshotCard` | `components/player-360/snapshot/` | Left | Existing metric card |

**New Components — Center Panel:**

| Component | Location | Rail | Purpose |
|-----------|----------|------|---------|
| `SummaryBand` | `components/player-360/summary/` | Center | 4 action tiles (horizontal grid) |
| `SummaryTile` | `components/player-360/summary/` | Center | Individual tile with micro-trend |
| `TimeLensControl` | `components/player-360/` | Center | Global time range selector |
| `ActivityChart` | `components/player-360/charts/` | Center | Consolidated chart (Trend Pattern B) |
| `RecentEventsStrip` | `components/player-360/` | Center | 3-item quick links |
| `TimelineFilterBar` | `components/player-360/timeline/` | Center | Category filter chips |

**New Components — Left Rail (Interactive Control Surface):**

| Component | Location | Rail | Purpose |
|-----------|----------|------|---------|
| `FilterTileStack` | `components/player-360/left-rail/` | Left | Stacked filter tiles container |
| `FilterTile` | `components/player-360/left-rail/` | Left | Clickable tile with ring + clear affordance |
| `JumpToNav` | `components/player-360/left-rail/` | Left | In-page anchor links |
| `JumpToAnchor` | `components/player-360/left-rail/` | Left | Individual anchor link |
| `RewardsEligibilityCard` | `components/player-360/rewards/` | Left | Status, reason, countdown, "Show events" |
| `RewardsHistoryList` | `components/player-360/rewards/` | Left | Clickable items → scroll to timeline |
| `RewardsHistoryItem` | `components/player-360/rewards/` | Left | Individual reward with click handler |

**New Components — Header:**

| Component | Location | Rail | Purpose |
|-----------|----------|------|---------|
| `AddNoteButton` | `components/player-360/header/` | Header | Opens note composer |
| `IssueRewardButton` | `components/player-360/header/` | Header | Opens reward modal (stub) |

### 6.3 Data Contracts

**Player Summary DTO:**
- session_value: { net_wl, theo_est, last_action_at }
- cash_velocity: { rate_per_hour, session_total, last_buyin_at }
- engagement: { duration_minutes, last_seen_at, is_active }
- rewards_eligibility: { status, next_eligible_at, reason_codes[] }

**Weekly Series DTO:**
- buckets[]: { week_start, visit_count, reward_count }

**Reward History DTO:**
- items[]: { issued_at, reward_type, amount, issued_by, visit_id }

**Timeline Event DTO:**
- (Existing per ADR-029)

### 6.4 Query Key Registry

All Player 360 data fetching MUST use query keys from a central registry to guarantee React Query de-duplication:

| Key Pattern | Data |
|-------------|------|
| `['player', playerId, 'summary']` | Summary Band data |
| `['player', playerId, 'weekly-series']` | Activity chart data |
| `['player', playerId, 'rewards-eligibility']` | Eligibility + reasons |
| `['player', playerId, 'rewards-history']` | Reward list |
| `['player', playerId, 'timeline', filters]` | Timeline events (existing) |

### 6.5 State Management

Per ADR-003 (State Management Strategy):

| State Type | Solution | Location |
|------------|----------|----------|
| Summary/chart data | TanStack Query | Hooks in `hooks/player-360/` |
| Timeline data | TanStack Query | `useInfinitePlayerTimeline` (existing) |
| Time Lens selection | URL query param OR local state | Component |
| Active filter | Local component state | `TimelineFilterBar` |
| Tile hover/tooltip | Local component state | `SummaryTile` |

### 6.6 Tile → Timeline Coordination

When a tile is clicked:
1. Update timeline filter state to the corresponding category
2. Optionally update Time Lens if relevant
3. Scroll timeline container to first matching event
4. Highlight the clicked tile as "active"

| Tile | Timeline Category |
|------|-------------------|
| Session Value | Gaming/Rating |
| Cash Velocity | Financial |
| Engagement | Session/Visit |
| Rewards Eligibility | Loyalty/Rewards |

## 7. UX Design

### 7.1 Design Tokens

Per `pt2-ui-design-system-prototype-style-guide.md`:

| Element | Token |
|---------|-------|
| Session Value tile | `bg-emerald-500/10`, `border-emerald-500/20`, `text-emerald-400` |
| Cash Velocity tile | `bg-blue-500/10`, `border-blue-500/20`, `text-blue-400` |
| Engagement tile | `bg-slate-500/10`, `border-slate-500/20`, `text-slate-300` |
| Rewards tile | `bg-amber-500/10`, `border-amber-500/20`, `text-amber-400` |
| Active state indicator | `ring-2 ring-primary` |

### 7.2 Layout Specifications

**Summary Band:**
- Grid: `grid-cols-2 lg:grid-cols-4`
- Gap: `gap-3` (12px)
- Tile padding: `p-4` (16px)
- Tile min-height: 100px

**Recent Events Strip:**
- Grid: `grid-cols-3`
- Height: ~48px
- Clickable with hover state

**Timeline:**
- Filter bar: sticky below Summary Band
- Event item height: ~72px
- Scroll container: `overflow-y-auto`
- Load threshold: 200px from bottom

### 7.3 Responsive Breakpoints

**Existing Layout Breakpoints (PRESERVE):**

| Breakpoint | Left Rail | Center | Right Rail |
|------------|-----------|--------|------------|
| Mobile (<1024px / < lg) | Hidden | Full width | Hidden |
| Desktop (1024-1280px / lg-xl) | Visible (w-72) | Flexible | Hidden |
| Wide (>1280px / xl+) | Visible (w-80) | Flexible | Visible (w-80, collapsible) |

**Summary Band Responsive Behavior:**

| Breakpoint | Summary Band (Center) | Summary Tiles (Left Rail) |
|------------|----------------------|---------------------------|
| Mobile (<640px) | 2 cols grid | N/A (rail hidden) |
| Tablet (640-1024px) | 2 cols grid | N/A (rail hidden) |
| Desktop (1024-1280px) | 4 cols grid | Stacked vertical |
| Wide (>1280px) | 4 cols grid | Stacked vertical |

**Note:** On mobile/tablet, Summary Band in Center becomes the sole summary display. On desktop+, Left Rail provides redundant stacked view for users who prefer vertical scanning.

### 7.4 Empty States

**No Session Data:**
```
┌─────────────────────────────────────┐
│     [Activity icon - muted]         │
│                                     │
│     No session data available       │
│     Start tracking when player      │
│     begins their session            │
└─────────────────────────────────────┘
```

**Eligibility Unknown:**
```
┌─────────────────────────────────────┐
│     [Question icon - muted]         │
│                                     │
│     Eligibility unknown             │
│     Rules not configured            │
└─────────────────────────────────────┘
```

### 7.5 Loading States

- Summary tiles: Shimmer skeletons with tile shape
- Chart: Pulsing bar placeholder
- Timeline: Existing `TimelineCardSkeleton`
- Recent Events: Skeleton chips

## 8. Testing Strategy

### 8.1 Unit Tests

**Center Panel:**
- Summary tile renders correct primary/secondary/micro values
- Tile click dispatches correct filter action
- Time Lens selection updates query params
- Rewards Eligibility Card renders all reason codes
- Reward History List sorts descending
- Reward History List filters by type

**Left Rail:**
- Filter tile click dispatches filter action
- Filter tile shows active ring when filter is active
- Clear affordance (×) resets filter state
- Jump To anchor renders with correct href
- Rewards Eligibility displays status + reason code + countdown
- "Show related events" dispatches Loyalty filter + scroll action

### 8.2 Integration Tests

- Summary data fetches and displays correctly
- Left Rail tile click updates timeline filter and visible events
- Center tile click updates Left Rail active state (bidirectional sync)
- Time Lens change affects summary secondary labels
- Rewards eligibility renders "Unknown" when rules absent
- Chart bucket click applies date range filter (Pattern B)
- Jump To anchor click scrolls to correct section
- Rewards history item click scrolls timeline to event

### 8.3 E2E Tests

**Center Panel:**
- Navigate to `/players/[playerId]` → Summary Band visible with 4 tiles
- Click "Cash Velocity" tile → Timeline shows Financial events
- Toggle Time Lens to 90d → Summary labels update
- Player with no rewards → Rewards tile shows appropriate empty state
- Click Recent Events item → Timeline scrolls to event

**Left Rail (lg+ screens):**
- Left Rail visible on desktop (≥1024px)
- Click Left Rail "Session Value" tile → Timeline filters to Gaming/Rating
- Active filter shows ring indicator + clear affordance
- Click clear (×) → Filter resets to All
- Click "Jump To: Timeline" → Smooth scroll to timeline section
- Click "Show related events" on Rewards card → Timeline filters to Loyalty + scrolls
- Click Rewards History item → Timeline scrolls to corresponding event
- Verify filter state synchronized between Left Rail and Center tiles

### 8.4 Performance Tests

- Summary query completes under 150ms (p95)
- No duplicate fetches across components (shared query keys)
- No layout shift during data load
- Jump To scroll animation completes in < 300ms

## 9. Definition of Done (DoD)

### 9.1 Center Panel Requirements

- [ ] **Summary Band renders** with 4 action tiles (Session Value, Cash Velocity, Engagement, Rewards Eligibility)
- [ ] **Tile interactions work**: click filters timeline and scrolls to first match
- [ ] **Time Lens control** affects summary secondary labels and timeline default range
- [ ] **De-duplication rule enforced**: temporal trend in ONE place only
  - [ ] Trend Pattern A: micro-trends inside tiles, no ChartsSection, OR
  - [ ] Trend Pattern B: single consolidated Activity chart (not two separate charts)
- [ ] **Recent Events Strip** renders 3 items and links to timeline
- [ ] **Header Actions**: Edit Profile works, Add Note present, Issue Reward present (disabled if not ready)

### 9.2 Left Rail Requirements — "No Static Tiles" (CRITICAL)

> **Acceptance Principle:** Nothing in the left rail may be "read-only decoration." Every element must either filter, navigate, or explain.

**Filter Tiles:**
- [ ] Every left rail tile is clickable and changes the timeline (filter + scroll)
- [ ] Active filter shows visual indicator (`ring-2` or equivalent)
- [ ] Active filter includes "Clear" affordance (×) to reset
- [ ] Filter state synchronized between Left Rail and Center Summary Band

**Jump To Navigation:**
- [ ] Jump To section renders anchor links: Summary, Chart (if Pattern B), Recent Events, Timeline
- [ ] Jump To links work with keyboard (Enter/Space) and mouse
- [ ] Jump To performs smooth scroll to target section (in-page, not app routing)
- [ ] Optional date anchors (Today, Yesterday, Last 7d) scroll timeline to date sections

**Rewards Eligibility Card:**
- [ ] Displays status (Available / Not available)
- [ ] Shows one-line reason code label when not available
- [ ] Shows "Next eligible in: HH:MM" countdown when applicable
- [ ] "Show related events" button filters timeline to Loyalty + scrolls to last issuance event
- [ ] "Unknown" state renders explicitly when rules not configured

**Rewards History List:**
- [ ] Clicking a history item scrolls timeline to the corresponding event
- [ ] List sorts descending by issued_at
- [ ] List supports filter chips: Matchplay, Freeplay, All

### 9.3 Quality Requirements

- [ ] **No cross-player analytics** present (no leaderboards, rankings, comparisons)
- [ ] **First meaningful answer** ("Is this player hot or cold? eligible?") in < 10 seconds
- [ ] **No block exists** that is "read-only decoration" without interaction or unique answer
- [ ] **Performance targets met**:
  - [ ] Summary query < 150ms (p95)
  - [ ] Chart render < 100ms
  - [ ] No layout shift on data load

### 9.4 State Handling

- [ ] **Active/Idle derivation** works (last action within 15 min = Active)
- [ ] **Cash Velocity calculation** works with session or rolling window fallback
- [ ] **Eligibility "Unknown"** renders explicitly when rules not configured
- [ ] **Filter state shared** between Left Rail and Center tiles (single source of truth)

### 9.5 Test Coverage

- [ ] Summary Band renders correct values (unit/integration)
- [ ] Left Rail tile click updates timeline query key and visible events
- [ ] Center Summary Band tile click updates Left Rail active state
- [ ] Jump To anchors perform smooth scroll to correct sections
- [ ] Rewards history item click scrolls timeline to corresponding event
- [ ] Rewards eligibility "Show related events" filters + scrolls correctly
- [ ] Rewards eligibility renders deterministic "Unknown" when rules absent
- [ ] Reward list sorts descending and filters by type
- [ ] All components have `data-testid` attributes

### 9.6 Accessibility

- [ ] Keyboard focus order sensible (left rail → center → right rail)
- [ ] Left Rail tiles are focusable and activatable via keyboard
- [ ] Jump To links are focusable and activatable via keyboard
- [ ] Tiles have aria-label describing their purpose and current state
- [ ] Active filter state announced to screen readers
- [ ] Chart containers have aria labels / titles
- [ ] Timeline items accessible
- [ ] Color contrast meets WCAG AA

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Session boundary logic complexity | High | Medium | Define clear fallback to rolling window |
| Eligibility rules not implemented | Medium | High | Ship with explicit "Unknown" state; wire later |
| Tile interaction conflicts with existing timeline controls | Medium | Low | Tile acts as additional filter, not replacement |
| Scope creep into analytics | High | Medium | Enforce hard boundary review in PR |

## 11. Implementation Workstreams

> **Note:** Detailed implementation specs (SQL, component code, test files) will be generated in the EXECUTION-SPEC phase.

### WS1: Database & Service Layer
- Summary query RPC (session value, cash velocity, engagement metrics)
- Eligibility query RPC (status, cooldown, reason codes)
- Weekly series query RPC (combined visits + rewards)
- Service functions with DTO contracts

### WS2: React Hooks Layer
- `usePlayerSummary` hook
- `usePlayerEligibility` hook
- `usePlayerWeeklySeries` hook (Trend Pattern B)
- `useTimelineFilter` hook (shared filter state)
- Query key registry updates

### WS3: Summary Band Components (Center Panel)
- `SummaryBand` container (horizontal 4-tile grid)
- `SummaryTile` component with micro-trend support
- `TimeLensControl` component
- Tile click handlers with timeline coordination

### WS4: Left Rail Interactive Components (Pattern A: Navigation + Filters)
- `FilterTileStack` container (vertical stacked tiles)
- `FilterTile` component with active ring + clear affordance
- `JumpToNav` component with anchor links
- `RewardsEligibilityCard` component (status, reason, countdown, "Show events" action)
- `RewardsHistoryList` component (clickable items → scroll to timeline event)
- Filter state synchronization with Center Summary Band

### WS5: Chart Component (Trend Pattern B only)
- `ActivityChart` combined series component
- Bucket click → timeline date filter

### WS6: Layout Integration
- Update Player 360 layout with new components
- Recent Events Strip (Center)
- Timeline filter coordination (shared state between Left Rail + Center)
- Header actions (Add Note, Issue Reward stubs)
- Smooth scroll implementation for Jump To anchors

### WS7: Testing & QA
- Unit tests for all new components
- Integration tests for data flow and filter sync
- E2E tests for critical paths (including Left Rail interactions)
- Performance validation
- Accessibility audit (keyboard navigation, screen reader)

## 12. Related Documents

| Document | Purpose |
|----------|---------|
| `docs/00-vision/player-dashboard/PLAYER-360-PANELS-V0-SPEC.md` | Vision spec (scope boundaries) |
| `docs/10-prd/PRD-022-player-360-navigation-consolidation.md` | Navigation architecture |
| `docs/20-architecture/ADR-029-player-360-interaction-event-taxonomy.md` | Event taxonomy |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded contexts (SRM v4.11.0) |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.2.0 | 2026-01-26 | Viewport constraint: main dashboard MUST NOT scroll, only rails scroll internally; Compact Left Rail design with content budget (~340px above fold); FR renumbered (FR-5 through FR-37); Updated architecture diagram |
| 2.1.0 | 2026-01-26 | Left Rail interactive design (Pattern A: Navigation + Filters); Filter tiles with ring + clear; Jump To in-page navigation; Rewards "Show related events" drilldown; "No static tiles" acceptance criteria; Updated DoD, testing strategy, workstreams |
| 2.0.0 | 2026-01-26 | Consolidated v1.0.0 + UX Addendum; action-first tiles replace static snapshot; de-duplication rule (Trend Pattern A/B); rewards eligibility panel; tile interactions; time lens control; removed DDL/code (moved to EXEC-SPEC); preserved three-column layout |
| 1.0.0 | 2026-01-24 | Initial draft (superseded) |

---

**Document Version:** 2.2.0
**Created:** 2026-01-24
**Updated:** 2026-01-26
**Status:** Draft
