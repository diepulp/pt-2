---
prd_id: PRD-023-PATCH-UX
title: "PRD-023 Addendum — Player 360 Panels v0 UX Optimization (No-Redundancy, Action-First)"
status: Draft
version: 0.1.0
created: 2026-01-26
author: ChatGPT (ux-patch)
applies_to:
  prd_id: PRD-023
  prd_version: 1.0.0
change_type: ADDENDUM/PATCH
priority: P1
tags: [player-360, ux, panels, tiles, timeline, rewards, pit-ops, mvp]
---

# PRD-023 UX Addendum (Patch)

This addendum patches **PRD-023: Player 360 Panels v0** to address layout clutter and redundant temporal summaries (static tiles + duplicated charts) while preserving the PRD intent: **parallel display** (not switchable views).

## 0. Executive Intent

When a pit boss/shift opens Player 360, their first questions are operational and immediate:

1) **Player value now**: win/loss, buy-ins/cash-in, “action load” (flee vs whale heuristic)  
2) **Session momentum**: active vs cooling off, last action time, cash velocity  
3) **Landmines**: reward eligibility/cooldowns (“why didn’t I get a matchplay?”), notes/approval flags  
4) **Where & what**: current table/area, last known location, recent events

The UI must support **fast decisions**, not passive reporting.

---

## 1. Problem & Diagnosis

### 1.1 Current Issue (from PRD-023)
- SnapshotRow shows multiple period metrics (30d/90d) and “last seen/last reward”.
- ChartsSection repeats the same temporal story again (12-week trend for visits/rewards).
- Both are largely **static**, with no interaction that helps staff answer “what do I do / what do I say” in the moment.

Result: **duplicated temporal data, clutter, low actionability.**

### 1.2 Principle
> Every block on the page must either (a) answer a top-3 pit question in < 10 seconds, or (b) be an interaction surface that drives the timeline.

---

## 2. UX Goals & Non-Goals

### 2.1 Goals
- **Reduce redundancy** by ensuring temporal trend is shown in **one place**.
- Make the Summary band (tiles) and any charts **interactive**, coordinating with the timeline.
- Replace “reward sparkline decoration” with **eligibility + reason + list**.
- Support the pit boss “flee/whale” heuristic with **momentum** proxies.

### 2.2 Non-Goals
- No cross-player analytics, ranking, segmentation, or predictive scoring.
- No new heavy AI/ML layer; “Next actions” may be rule-based, deterministic.

---

## 3. Information Architecture (Recommended)

### 3.1 Layout (Desktop)
1) **Sticky Player360Header**
2) **Summary Band** (action-first tiles + optional single consolidated chart)
3) **Timeline (primary content)** with filters
4) **Right Rail (collab/compliance)** collapsible by default (open only if populated/flagged)

### 3.2 “Time Lens” Control (Global)
A small segmented control that applies consistently across panels:
- `30d | 90d | 12w`
This is a **lens**, not a view-switch. It drives:
- Secondary labels in tiles
- Chart highlight/range (if present)
- Default timeline range query

---

## 4. Component Changes (Patch)

## 4.1 SnapshotRow → SummaryBand (Interactive)
Replace 4–6 static tiles with **4 action tiles**:

1) **Session Value**
   - Primary: `Net W/L (session)` (or gaming day if session not defined)
   - Secondary: `Theo (est.)` OR `W/L vs Theo` if available
   - Micro: “last action” timestamp

2) **Cash Velocity**
   - Primary: `Cash-in / hr` (or buy-ins/hr)
   - Secondary: `Session cash-in total`
   - Micro: time since last buy-in

3) **Engagement**
   - Primary: `Session duration`
   - Secondary: `Last seen / last action`
   - Micro: “active / idle” state

4) **Rewards Eligibility**
   - Primary: `Matchplay: Available | Not available`
   - Secondary: `Cooldown: 1h 12m` + **reason code**
   - Micro: “last reward time”

> If you must preserve 30d/90d visit counts, present them as **secondary text** inside Engagement or as a small “Historical” chip—do not give them equal visual weight as session metrics.

### Tile Interactions (Required)
- **Click** on a tile applies a coordinated “lens”:
  - Session Value → timeline category: `Gaming/Rating`
  - Cash Velocity → `Financial`
  - Engagement → `Session/Visit`
  - Rewards Eligibility → `Loyalty/Rewards`
- Tile click also sets the global time lens (if relevant) and scrolls timeline to the first matching event.
- **Hover** shows tooltip with:
  - exact timestamps
  - delta vs prior period (if computed)
  - “top contributors” where applicable (e.g., cash-in sources)

---

## 4.2 ChartsSection (De-duplicate)
Pick **one** of the following patterns (MVP preference: A).

### Pattern A (Preferred): Remove ChartsSection
- Integrate a tiny trend indicator (sparkline/microtrend) *inside relevant tiles* (Cash Velocity, Engagement, Rewards)
- Timeline remains the detailed temporal view.

### Pattern B: Keep charts, but consolidate to ONE “Activity” chart
Replace two charts (Visits/Week + Rewards/Week) with a single chart:
- Series: Visits + Rewards (two lines) or stacked bar + line
- Clicking a bucket applies a timeline date-range filter and highlights matching events.

**Do not** render separate visits and rewards charts simultaneously in v0.

---

## 4.3 Rewards Panel (Replace Sparkline with Eligibility + List)
Rewards should answer the pit question: **“Why didn’t I get a matchplay?”**

### Rewards Panel Structure
1) **Eligibility Card (top)**
   - Status: `Available / Not available`
   - Countdown: `Next eligible in: HH:MM`
   - Reason code(s), e.g.:
     - `COOLDOWN_ACTIVE`
     - `MIN_PLAY_NOT_MET`
     - `GAMING_DAY_LIMIT_REACHED`
     - `ROLE_APPROVAL_REQUIRED`
     - `TABLE_EXCLUDED`
     - `BUDGET_CAP_REACHED`
   - Optional: “What to do”: `See pit for approval`, `Play X more minutes`, etc. (rule-based)

2) **Reward History List (descending)**
   - Columns: `Issued at` | `Type` | `Amount/Value` | `Issued by` | `Related visit/session`
   - Default sort: newest first
   - Quick filter chips: `Matchplay`, `Freeplay`, `All`

3) **(Optional) “Last 7 days” mini-summary**
   - only if needed: count by type; no chart required.

---

## 4.4 “Recent Events” Strip (Small but High ROI)
Add a 3-item strip just above timeline:
- Last buy-in/cash-in event
- Last reward issued
- Last note/flag

Each item is clickable → jumps timeline to the event.

---

## 5. States & Rules (MVP)

### 5.1 “Active vs Idle”
Define activity state deterministically:
- **Active** if last action within 15 minutes (configurable)
- **Idle** otherwise

### 5.2 “Cash Velocity”
MVP calculation:
- `session_cash_in_total / session_duration_hours`  
Fallback if session not available:
- `last_90m_cash_in / 1.5h` (rolling window)

### 5.3 “Eligibility & Cooldowns”
MVP: derive from Loyalty rules currently implemented.
If rules not implemented yet, UI must still render with:
- `Unknown` state + “Eligibility rules not configured” (explicit, not silent).

---

## 6. Data Requirements (Additive)

- Session/gaming-day boundary usable for:
  - session cash-in total
  - session net W/L (or at minimum W/L proxy)
  - last action timestamp (rating_slip / financial txn / visit event)
- Rewards:
  - issued_at, reward_type, amount/value, issued_by, visit_id/session_id
  - eligibility_status + next_eligible_at + reason_codes[]

---

## 7. Definition of Done (DoD) — Patch Overrides/Additions

### 7.1 Functional
- [ ] SummaryBand renders **4 action tiles** with correct values
- [ ] Tile click applies category filter and scrolls timeline to first matching event
- [ ] Global Time Lens (`30d|90d|12w`) affects summary secondary labels and timeline default range
- [ ] Rewards Panel includes:
  - [ ] Eligibility Card with `status`, `next_eligible_at`, `reason_codes[]`
  - [ ] Descending reward list with basic filters
- [ ] Recent Events strip renders 3 most recent items and links to timeline

### 7.2 De-duplication Rule
- [ ] Temporal trend appears in **one place** only:
  - [ ] Pattern A: inside tiles (no ChartsSection), OR
  - [ ] Pattern B: single consolidated Activity chart (not two charts)

### 7.3 UX Quality
- [ ] First meaningful answer (“Is this player hot or cold? eligible?”) in **< 10 seconds**
- [ ] No block exists that is “read-only decoration” without an interaction or unique answer

### 7.4 Tests
- [ ] Tile click updates timeline query key + visible items
- [ ] Rewards eligibility renders deterministic “unknown” when rules absent
- [ ] Reward list sorts descending and filters by type

---

## 8. Implementation Notes (Minimal Risk)
- This patch does **not** require new bounded contexts.
- Reuse existing timeline categories as the coordination surface.
- If backend eligibility logic is not ready, ship UI with explicit “unknown” and wire later.

---

## 9. Decision: Overhaul vs Patch
This is a **patch**, not a total overhaul. PRD-023’s structure (header + snapshot + timeline + rail) is sound; the issue is **redundant temporal blocks and missing interaction surfaces**. This addendum replaces duplication with coordinated, action-first UI primitives.
