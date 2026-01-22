# Player 360° CRM Dashboard — UX/UI Baseline Recommendations

This document provides UX/UI baselines for designing an **ergonomic Player 360 CRM dashboard** aligned with the agreed functionality and architecture (timeline-as-spine, facts vs derived metrics, cross-dashboard portability, compliance separation).

> Design intent: **scan → decide → act** with minimal context switching.

---

## 1) Make the timeline the “center of gravity”

If it doesn’t land as an event, it probably doesn’t belong (yet). The UI should behave like mature CRMs:

- **Center column = unified interaction timeline** (chronological feed of events)
- **Event cards are compact, expandable**
  - Collapsed: icon + short summary + timestamp + “source chip” (cash / loyalty / rating / compliance / note)
  - Expanded: metadata block + drill-down link (source_table/source_id)
- **Group-by-day** (Today / Yesterday / Jan 18) with optional “session grouping” by visit_id (nice-to-have)

**Ergonomic rule:** default view is **scan speed**, not read mode.

---

## 2) Three-panel layout that supports scan → decide → act

A pragmatic baseline layout that holds up in dense operational apps:

- **Header (sticky):** Player identity + status + 3–5 critical flags + quick actions
- **Left rail (narrow):** Key metrics (derived)
- **Center (wide):** Timeline (facts/events)
- **Right rail (narrow):** Collaboration (notes/tags/tasks) + “share to shift report”

This layout keeps the contract clean:

- Derived metrics live in the **metrics rail**
- Facts/events live in the **timeline**
- Collaboration lives in the **right rail**

---

## 3) Metric panel: preattentive, not “BI cosplay”

Operators don’t want 14 charts. They want **signals**.

- Use **small KPI tiles** and deltas (last 7/30 days)
- Keep it to the MVP set:
  - Recency/frequency (visits, sessions)
  - Cash in/out totals (and deltas)
  - Play proxies (time played, avg bet, theo proxy if defined)
  - Loyalty (balance / points movement)
  - Engagement band (active / cooling / dormant)
- Add **data freshness** (“Updated 2m ago”) and **source-of-truth** hints (“Derived from financial txns”)

---

## 4) Filters: powerful, predictable, fast

Filtering is the make-or-break for a timeline.

Baseline pattern:

- **Top-of-timeline filter bar** with:
  - Event-type chips (multi-select), grouped by your taxonomy (Session / Gaming / Financial / Loyalty / Staff / Compliance / Identity)
  - Date range presets (24h / 7d / 30d / custom)
  - “Only exceptions” toggle (high delta, MTL present, dormant band, etc.)

Also:

- Make **active filter state obvious** (chips + “Clear all”)
- Keep filter labels jargon-free; predictable = trusted

---

## 5) Action design: “do the thing” without leaving the page

Ergonomic CRM reduces context switching:

- **Inline note composer** (right rail)
- **Tag apply/remove** as one-click chips (confirm only for destructive actions)
- **Context actions per event card**
  - Open source record
  - Add note about this event
  - Flag for shift report
- Keep heavy workflows (identity verification, compliance review) in dedicated panels linked from the timeline

---

## 6) Compliance: separate panel, not timeline pollution

Treat compliance like this:

- Timeline can show **MTL events**
- CTR should be a **computed status/aggregate metric**, not a timeline event

Recommended UI:

- **Compliance panel (tab or section)** shows:
  - MTL events (timeline or list)
  - CTR threshold progress (metric / progress bar)
  - “Needs review” state + handoff workflow

This avoids training staff into “CTR is a single event.”

---

## 7) Performance and “enterprise states” are part of UX

Two things that make users hate systems:

- **Slow with no feedback**
- **Janky scrolling**

Baseline requirements:

- Use skeleton loading for the timeline and metrics
- Virtualize the timeline list for long histories
- Use **keyset pagination** with your cursor model (“Loading older events…”)

Also implement:

- Empty states (“No events in last 30 days” + widen range button)
- Error states (“Timeline unavailable” + retry + correlation id)

---

## 8) Cross-dashboard portability: “snapshot cards”

To support shift reports and other dashboards, expose a **shareable player snapshot component**:

- Mini header + engagement band + “last seen”
- Today’s cash + today’s theo proxy (if you have it)
- Tags requiring attention
- “Add to shift report” button

This implements the “shared customer info across dashboards” goal without duplicating logic.

---

# Blunt MVP UI Definition of Done

Ship **one player page** with:

1. Sticky header (identity + flags)  
2. Left rail: 8–10 KPIs (derived metrics only)  
3. Center: filterable timeline (expand/collapse + drilldown)  
4. Right rail: notes + tags + “share to shift report”  
5. Compliance tab: CTR progress + MTL list (CTR not in feed)

---

## Next optional artifact

If needed, produce a wireframe-level IA spec mapping each `event_type` to:

- card layout (summary vs expanded fields)
- iconography
- required metadata
- drilldown destination
- permissions/visibility rules
