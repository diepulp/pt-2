---
title: Player 360 Panels v0 — Player-Scoped Summary, Charts, and Timeline
status: Draft Spec
date: 2026-01-24
spec_type: feature-extension
scope_level: MVP
targets:
  - Player 360 (app/(dashboard)/players/[[...playerId]])
depends_on:
  - PRD-022 Patch — Option B (Embedded Search in Player 360)
out_of_scope_parent:
  - Shift Dashboard analytics (casino/shift-wide rollups)
tags: [player-360, ux, panels, charts, timeline, mvp]
---

# Player 360 Panels v0

## 0. Purpose

Provide a **simple, fast Player 360 detail** that enables:
- quick player lookup (already solved by embedded search)
- **quick comprehension** of one player’s activity and daily value they bring
- **player-scoped** “graphs and such” (visits frequency, rewards timeline, recent activity)

This spec intentionally avoids building BI/reporting inside Player 360.

---

## 1. Scope

### 1.1 In Scope (Player-Scoped Only)

**Panels to add/standardize:**
1. **Player Header Actions**
   - Edit Profile (parity)
   - Add Note (if Notes exist; else stub UI)
   - Issue Reward (only if Loyalty v0 supports issuance; else stub UI)

2. **Snapshot Row (4–6 tiles)**
   - Visits: last 30 days
   - Visits: last 90 days
   - Last seen (latest visit end or latest interaction)
   - Rewards issued: last 30 days
   - Rewards issued: last 90 days
   - Last reward date (if any)

3. **Charts (max 3)**
   - **Visits per week** (last 12 weeks)
   - **Rewards issued per week** (last 12 weeks)
   - **Activity timeline feed** (event stream; see §2.3)

4. **Recent Activity Timeline**
   - A unified, chronologically sorted feed of player events with filters:
     - Visits
     - Rating slips (if present)
     - Rewards / loyalty ledger entries
     - Notes (if present)
     - Financial transactions (if exposed to this view)
     - Compliance/MTL notes (if present)

### 1.2 Out of Scope (Hard Boundary)

Not allowed in Player 360 Panels v0:
- leaderboards, “top players”, rankings
- cohorts/segments
- casino-wide averages or comparisons (“above average”, “percentile”)
- shift/day/table rollups (belongs to Shift Dashboard / Reports)
- predictive scoring (churn risk, LTV, ML recommendations)
- cross-player search analytics or aggregated dashboards

**Rule of thumb:** if it requires data from *other players* to be meaningful, it belongs outside Player 360.

---

## 2. UX / IA

### 2.1 Layout (Desktop)

- Left: (optional) compact rail for navigation anchors (Summary, Charts, Activity)
- Center: main content
- Right: (optional) collaboration/actions rail (Notes, Flags) — can be postponed

Recommended ordering (top to bottom):
1. PlayerHeader (identity + actions)
2. SnapshotRow
3. Charts section (2 small charts + 1 large or 3 equal)
4. ActivityTimeline (default)

### 2.2 Layout (Mobile)

- Snapshot row collapses into 2 rows
- Charts stack vertically
- Timeline becomes primary scroll

### 2.3 Timeline (Event Types)

Each event must render minimally:
- timestamp
- type icon + label
- short summary line
- optional “open details” affordance

Event types (player-scoped):
- Visit (open/close)
- Rating slip (open/close) if present
- Reward issued / loyalty ledger entry
- Financial transaction (if allowed)
- Note (if implemented)
- Compliance note (if implemented)

---

## 3. Data Contracts (Player-Scoped)

### 3.1 Inputs

- `player_id` from route param (`/players/:playerId`)
- Context: casino_id and actor_id via existing RLS context model (no spoofable params)

### 3.2 Required Queries (Minimal)

Implement as RPCs or SQL views + query-side aggregation (choose simplest consistent approach in your stack).

**Q1 — Player snapshot**
Returns:
- visits_30d_count
- visits_90d_count
- last_seen_at
- rewards_30d_count
- rewards_90d_count
- last_reward_at

**Q2 — Visits weekly series (12 weeks)**
Returns weekly buckets:
- week_start
- visit_count

**Q3 — Rewards weekly series (12 weeks)**
Returns weekly buckets:
- week_start
- reward_count (and optionally total_value if modeled)

**Q4 — Activity timeline (paged)**
Returns a unified list sorted by time desc:
- occurred_at
- event_type
- event_id
- summary (or enough fields to compose summary client-side)
- optional metadata (JSON allowed if already standard in table; do not introduce new JSON blobs just for fun)

### 3.3 Performance Expectations

- Snapshot query target: < 150ms on warm cache (server-side), minimal payload.
- Timeline: paged (e.g., 50 rows) with “load more”.
- Charts: 12 buckets only; no heavy joins.

---

## 4. Component Architecture

### 4.1 Components (suggested)

- `components/player-360/header/Player360Header.tsx`
- `components/player-360/snapshot/Player360SnapshotRow.tsx`
- `components/player-360/charts/VisitsPerWeekChart.tsx`
- `components/player-360/charts/RewardsPerWeekChart.tsx`
- `components/player-360/timeline/Player360Timeline.tsx`
- `components/player-360/timeline/event-renderers/*`

### 4.2 State Rules

- URL is authoritative for selected player
- Panel state (expanded/collapsed) may be local UI state
- Avoid global Zustand for panel selection unless already standard

---

## 5. Definition of Done (DoD)

Feature is complete when:

1. **Snapshot row renders** for a selected player with correct counts/dates.
2. **Charts render**:
   - Visits per week (12 weeks)
   - Rewards per week (12 weeks)
3. **Timeline renders** with:
   - default “All” filter
   - at least 3 event types implemented (Visits, Rewards, Rating slips OR Notes)
   - pagination (“Load more”)
4. **No cross-player analytics** present:
   - no leaderboards, ranking, or comparisons
5. **Error/empty states**:
   - Player has no visits → charts show empty state, not broken UI
   - Player has no rewards → rewards chart shows empty state
6. **Tests**
   - Snapshot query renders correct values (unit/integration)
   - Timeline filter changes query key and content
   - Charts render with 0 buckets safely
7. **Accessibility basics**
   - keyboard focus order sensible
   - chart containers have aria labels / titles
   - timeline items accessible

---

## 6. Test Plan

### 6.1 Unit/Integration

- Snapshot row displays expected values given mock API responses
- Weekly series charts render correct number of buckets (0–12)
- Timeline:
  - filter chips toggle query keys
  - paging appends results without replacing
  - empty response renders “No activity yet”

### 6.2 E2E

1. Navigate to `/players/:id` → snapshot + charts + timeline present
2. Toggle timeline filters → results change
3. Load more timeline items → list grows
4. Player with no rewards → rewards chart shows empty state

---

## 7. Risks / Pitfalls

- Overstuffing the timeline: keep summaries short and consistent
- Chart library/performance: keep to simple 12-bucket series
- Data definition drift: ensure “visit” and “reward issued” semantics match Shift Dashboard definitions, even though aggregates differ

---

## 8. Work Plan (Minimal)

1. Implement data queries (Q1–Q4)
2. Build SnapshotRow
3. Build Visits/Rewards weekly charts
4. Build Timeline with filters + pagination
5. Add tests
6. Polish empty/loading states

---
