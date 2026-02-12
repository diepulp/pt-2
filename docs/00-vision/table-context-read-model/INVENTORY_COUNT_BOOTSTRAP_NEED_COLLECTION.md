---
title: Inventory Count Bootstrap: Need/Par Collection
version: 0.1.0
status: draft
scope: provisioning_onboarding
table_bank_mode: INVENTORY_COUNT
last_updated: 2026-02-10
---

# Inventory Count Bootstrap: Need/Par Collection (Pit Setup)

## Purpose

When the product is instantiated into an **already-operating casino**, the pit typically has an established (often informal) *need/par* per table. In **Inventory Count mode**, this value is a **target** used for operational control (reducing fill pressure), **not** an accounting truth.

This document defines how onboarding should collect and store the initial **need/par targets** for *freshly provisioned tables* in a live pit, **Inventory Count model only**.

---

## Inventory Count model (high-level)

### What the floor does
- At shift close, the tray is **counted** and recorded.
- Fills/credits happen as needed.
- Shift close does **not** require restoring the tray to par.

### What the system records as facts (per session/shift)
- **Opening tray snapshot**
- **Closing tray snapshot**
- **Fills** (chips to table)
- **Credits** (chips from table)
- **Drop** (soft count)

### What the system stores as policy/targets
- **need_total / par_total** = a *target bankroll* for the table (nullable)

### Shared rundown identity (stable)
The **rundown accounting identity** remains:

`table_win = closing_bankroll + credits + drop − opening_bankroll − fills`

> Inventory Count mode differs by treating **need/par as a target**, not something inferred from the first closing count.

---

## Bootstrap problem statement

At go-live, we must configure **need/par targets** for tables that already have:
- Existing operating practices (fills, credits, drops)
- An established par/need concept (even if undocumented)
- Varying targets by table type, limits, day-of-week, events

### Key constraint
**Do not assume** the most recent closing inventory equals par.  
In Inventory Count houses, closing inventory floats; par is a managerial target.

---

## Collection strategies (Inventory Count only)

### Strategy A — Import existing par sheet (preferred)
**Goal:** fast alignment with what operations already believes.

**Onboarding input**
- Upload or paste a table list template including:
  - table name/number
  - game type / limits band (optional)
  - `need_total` (target bankroll, dollars)
  - (optional) chip breakdown
  - (optional) notes (e.g., “weekends high-limit”, “tournament nights”)

**Why it works**
- Minimal disruption
- Immediate operational buy-in (“this matches our par sheet”)
- Avoids false inference from early data anomalies

---

### Strategy B — Structured manual entry (per-table)
Used when there is no par sheet (or they won’t share it yet).

**Who should provide values**
- Cage manager / table games manager / shift manager (whoever owns bankroll controls)

**Questions to capture**
- Target bankroll for Table X (dollars)
- Stability: stable vs day/shift-dependent
- Known pain points: “frequent fills”, “high volatility”, “event-driven”

**Result**
- `need_total` stored with provenance metadata:
  - `source = manual`
  - `approved_by` (staff id)
  - `approved_at`
  - `effective_from_gaming_day` (or effective timestamp)

---

### Strategy C — Run without par initially (MVP-minimal)
If the casino refuses or cannot provide targets on day 1:

- Allow `need_total = null`
- Continue collecting shift snapshots and rundown data
- Defer par configuration

**Trade-off**
- Rundown works
- “Need vs actual” and operational pressure insights are unavailable until par is set

---

### Strategy D — Post go-live suggested par (advisory only)
After enough data is collected, the system may **recommend** (never auto-apply) a target.

**Avoid unsafe inference**
- Do **not** set par equal to median/mean closing inventory (closing floats in Inventory Count).

**Safer advisory signals**
- fills per shift
- total fills amount per shift
- max single fill
- pattern by day-of-week / shift

**Rule**
- Recommendations must be **approval-gated** and **append-only** with an effective date.

---

## Onboarding flow (wizard)

### Step 1 — Choose default bank mode
- `casino.table_bank_mode_default = INVENTORY_COUNT`

### Step 2 — Provision table list (default template)
- Create initial `gaming_table` rows
- Attach minimal `game_settings` references as needed

### Step 3 — Collect need/par targets
Pick one:
- Import par sheet (A)
- Manual entry (B)
- Skip (C)

### Step 4 — Create active need policy per table
- Insert `table_need_policy` (or equivalent) rows:
  - `table_id`
  - `par_total` (nullable)
  - `source` (import/manual/system_suggested)
  - `approved_by`, `approved_at` (required unless imported by authorized actor)
  - `effective_from_gaming_day` (or timestamp)
  - `notes` (optional)

### Step 5 — Bind need to sessions
When a table session/shift starts:
- `session.table_bank_mode = INVENTORY_COUNT`
- `session.need_total = active_policy.par_total` (nullable)

---

## Data model notes (implementation-agnostic)

### Append-only need policy
Need/par is **policy**, so store it as an append-only timeline:
- Current value determined by:
  - `table_id`
  - effective date
  - status/active flag (optional)
- Never overwrite history; record changes with who/when/why.

### Provenance fields (minimum)
- `source`: enum { `import`, `manual`, `system_suggested` }
- `approved_by`: staff id (nullable only for imports by privileged actor)
- `approved_at`: timestamp
- `effective_from_gaming_day` (or `effective_from_ts`)
- `notes`: free text

---

## UI copy (avoid the “par = truth” fight)

Recommended labels:
- **Target need (par)** — “Operational target bankroll for this table”
- Tooltip: “Inventory Count mode: target used to reduce fill pressure; closing inventory may vary.”

If `need_total` is null:
- Display: “Target need not configured”
- CTA: “Set target need”

---

## Definition of Done (bootstrap scope)

- [ ] Casino can set `table_bank_mode_default = INVENTORY_COUNT`
- [ ] Tables can be provisioned from a template list
- [ ] Need/par targets can be:
  - [ ] imported (bulk) OR
  - [ ] manually set per table OR
  - [ ] left unset (null) without breaking rundown
- [ ] Need policy is stored with provenance + effective date
- [ ] Sessions bind to the active need policy at start
- [ ] UI clearly distinguishes **target** vs **facts** (opening/closing counts)

---

## Non-goals (for this phase)
- Automated par calculation and auto-application
- Multi-mode support (Fill-to-Par) in this onboarding spec
- Complex time-sliced par by event calendar (can be layered later)

---

## Open questions (for later refinement)
- Should `effective_from` be gaming-day based or timestamp based (or both)?
- Do we need multiple active targets per table (daypart/weekend variants) or a single default?
- What privileges allow importing par sheet without explicit per-row approval?
