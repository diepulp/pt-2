---
title: "Pit → Tables Navigation UX Layout"
date: 2025-12-28
status: draft
audience: pit_operations_ui
---

# Goal

Design an intuitive, **fast** nested navigation for a casino pit hierarchy: **Pit → Tables**.

In this domain, **speed beats elegance**: operators must locate and act on a pit/table in ~1–2 seconds.

---

# Recommended Default Layout

## Left “Pit Switcher” + Main “Table Grid” (best general-purpose pattern)

### Layout

- **Left rail (Pits)**
  - Compact list of pits for instant switching
  - Each pit row shows:
    - Pit name
    - Tiny status summary (e.g., `6 open / 2 closed`)
  - Supports:
    - **Search**
    - **Pinned/Favorites**
    - **Recent pits**

- **Main area (Tables)**
  - **Grid of table cards** for the currently selected pit
  - Cards are uniform and large (tablet-friendly)
  - Each card shows only key operational data (avoid cram)

- **Top bar**
  - Breadcrumb for orientation: `Casino > Pit A`
  - “Switch pit” dropdown as a redundant escape hatch
  - Global search (jump directly to a table)

### Why this is optimal

- A persistent anchor for **where you are** (left pits)
- A consistent area for **what you can do** (table grid)
- Switching pits feels like changing a filter, not “navigating back”

### Speed features (make it feel “casino-fast”)

- **Pinned pits** at top
- **Last-used pit** opens by default
- **Keyboard jump**: `Ctrl/Cmd+K` command palette (e.g., “Pit 3”, “Table BJ-12”)
- “Type-to-filter” when pit list has focus

---

# Tables View: Grid vs List

## Default: Grid

Grid wins because table selection is **scanning-heavy** and often **identifier-driven** (e.g., “12”, “Baccarat 3”, “HL BJ”).

## Offer List mode when

- You need dense operational columns (min/max, dealer, open time, occupancy)
- Users sort/filter frequently by columns

> Suggestion: provide `Grid | List` toggle, default to **Grid**.

---

# Alternative Patterns (use when constraints demand it)

## 1) Pit Tabs (good when pits ≤ ~6)

- Top tabs: `HL | Main | North | Poker | …`
- Main grid for tables

**Caveat:** as pits grow, tabs become noisy. Add “More…” overflow or switch to left rail.

## 2) Map / Floorplan View (excellent if layout is stable)

- Pits on left, tables displayed as a spatial **pit layout / mini map**
- Matches how pit staff think and move

**Caveat:** more build + ongoing maintenance when layouts change. Best as an optional view.

## 3) Drilldown Pages (avoid as primary)

`Pits page → Pit detail → Table`

Clean, but slower due to back/forth. Use only when forced (e.g., very small mobile screens).

---

# Mobile / Tablet Adaptation

## Tablet (landscape)

- Left rail + grid is ideal.

## Mobile

- Replace left rail with:
  - Pit selector dropdown, **or**
  - Bottom-sheet pit chooser
- Keep table grid (2 columns) with big tap targets
- Add a sticky header: `Pit: X` so users don’t get lost

---

# Table Card Content (don’t over-engineer)

Keep table cards to **3–5 items max**:

- **Table identifier** (big): `BJ-12`
- **Status**: `Open / Closed / Paused`
- **Game type + limit** (or min/max)
- Optional (choose one):
  - Dealer name
  - Time open
  - Occupancy
- Alerts as small badges (fills, drops, MTL flags, etc.)

---

# Small UX Details That Matter

- Use **color + icon + label** (never rely on color alone)
- Sort by operational priority:
  - Open first → paused → closed
- Favorites at both levels:
  - Favorite pits
  - Favorite tables
- “Recent tables” strip (last 5 visited/opened)
- Search should **jump**:
  - Typing `12` surfaces `BJ-12` immediately

---

# Verdict

**Default pick:** Left rail pit switcher + table grid, with pin/recent/search + command palette jump.

This stays intuitive under stress and scales as pits/tables grow.
