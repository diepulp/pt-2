# PT‑2 Layout Strategy (UI/UX) — Low‑Click Pit Workflow

**Purpose:** Optimize PT‑2’s daily gaming workflows for speed, accuracy, and low cognitive load by designing for *repetitive operational loops* (not “pages”), using drawers/panels as the primary interaction surface, and reserving modals for high‑risk commitments.

---

## Design North Star

> **The UI should behave like a pit:** fast glances, muscle memory, minimal ceremony.  
> If staff has to “navigate,” the layout already failed.

---

## 1) Design for Loops, Not Pages

Casino work is cyclical and repetitive. Build the interface around the handful of loops users execute constantly.

### Core daily loops
- **Start shift**
  - open tables → verify inventory/need → assign dealers → confirm readiness
- **During shift**
  - quick player lookup → open/adjust slips → log fill/drop → add incident notes
- **End shift**
  - close slips → reconcile inventories → run reports → handover notes

### Layout implication
A loop‑centric layout keeps the “work surface” stable while details and actions change contextually.

---

## 2) Recommended PT‑2 Shell Layout

### A. Persistent left navigation (stations/domains)
- Tables / Pit
- Players
- Visits
- Slips
- Finance / Cashier (role‑gated)
- MTL / Compliance (role‑gated)
- Reports
- Settings / Admin

**Rule:** navigation should be *rare* during a shift; users should live in one station.

### B. Central work surface (lists/grids)
- Table grid (pit view)
- Player list
- Slip list
- Visit list

**Rule:** the list stays visible. You don’t “leave the list” to do routine work.

### C. Right context panel (primary detail + action surface)
Clicking an item opens a right panel with:
- summary + status
- critical telemetry
- tabs: **Overview / Actions / History** (or domain‑specific)

**Rule:** the right panel replaces most “detail pages”.

### D. Global command surface (always present)
- global search / create
- gaming day selector
- shift selector
- role badge + quick actions
- **Command Palette** hint (Ctrl/⌘+K)

---

## 3) Choosing the Right UI Primitive

Use the lightest interaction that safely completes the job.

### Dropdowns (fast choice, low risk)
**Use for:** filters, sorts, presets, small option sets  
**Examples:** Gaming Day, Shift, Pit, Table Status, Sort by Theo/Last Activity

**Rules**
- Keep options **≤ ~12**
- Most common option is the default
- Typeahead + keyboard support
- Filters must remain visible as “chips” (not hidden behind icons)

### Menus (contextual actions)
**Use for:** action lists on an item (“do something to this thing”)  
**Examples:** `Open Slip`, `Add Note`, `Log Fill`, `View History`, `Issue Reward`

**Rules**
- Show top **2–3** actions inline; menu is for the rest
- Group with separators: **Common / Rare / Danger**
- Dangerous actions are isolated and labeled clearly

### Drawers / Right panels (workhorse)
**Use for:** inspect + edit while keeping list context  
**Examples:** click table row → inventory + open slips + dealer + last drop + actions

**Rules**
- Keep the list visible behind the panel (no “lost place”)
- Provide **pin panel** for power users
- Support item traversal (↑/↓) while panel is open
- Prefer inline editing inside the panel over separate pages

### Modals (interruptions — use sparingly)
**Use for:** irreversible actions, multi‑step confirmation, permissions gates  
**Examples:** `Finalize Drop`, `Void Transaction`, `Close Table`, `Change Gaming Day Start`

**Rules**
- A modal should never feel like a page (avoid scroll)
- Avoid stacking modals; if you need depth, use a panel
- Esc closes (when safe); Enter submits (when safe)
- No global navigation inside modals (design smell)

---

## 4) Click‑Reduction Patterns That Actually Work

### 1) Command Palette (highest ROI)
A global **Ctrl/⌘+K** for:
- “Open Table 12”
- “Create slip for John Doe”
- “Log fill”
- “Issue mid‑session reward”
- “Open player by card/ID”

**Impact:** replaces multi‑step navigation with one muscle‑memory action.

### 2) Inline row actions + overflow
In dense lists (tables/players/slips):
- 2–3 primary actions visible (buttons/icons)
- everything else in `⋯`

**Avoid:** click row → open detail page → find action → click again.

### 3) Smart defaults + remembered state
- remember last Pit / Shift / filters
- default gaming day via `compute_gaming_day`
- prefill forms with common values

### 4) Bulk operations
Pit work is batchy.
- multi‑select → open/close/assign/export in one pass

**Rules**
- persistent selection bar appears immediately
- confirm only when destructive

### 5) Quick‑add (one field + Enter)
For rapid logging:
- add note inline → Enter to submit
- add player tag/language with typeahead → Enter
- keep “full form” in the panel for edge cases

---

## 5) Modal Design: Make Them Surgical

If a modal is necessary, it must be tight and decision‑oriented.

**Template**
- **Header:** Verb + object (e.g., “Finalize Drop — Table 12”)
- **Body:** only what’s needed to decide + minimal fields
- **Footer:** primary action right, cancel left
- **Danger:** explicit label (“Void Transaction”, not “OK”)
- **Validation:** inline, actionable (“Open slips exist → View & resolve”)

---

## 6) Filters as Shift Presets (Stop Rebuilding Filters)

Staff shouldn’t “recreate the same view” all day.

### Saved Views (recommended)
- “My Pit — Open Tables”
- “Needs Attention”
- “Open Slips — High Theo”
- “Tables Awaiting Drop”
- “Player Notes — Today”

### Filter rules
- composable chips/tokens
- visible by default
- one‑click reset/clear
- stable ordering + cursors for pagination (avoid drift)

---

## 7) Reduce Errors While Reducing Clicks (Speed Without Chaos)

### Use two‑stage commit only where needed
High‑risk: voids, finalize drop, cash‑out, compliance actions  
Low‑risk: notes, tags, assignments → prefer **Undo**.

### Validation strategy
- inline validation (don’t “submit → fail → toast”)
- optimistic UI for low‑risk actions with reliable rollback
- permission‑aware action surfacing (hide what users can’t do)

---

## 8) Micro‑Interactions That Matter in the Pit

- **Focus management:** close panel/modal → return focus to the originating row
- **Toast discipline:** only meaningful state changes; errors must be actionable
- **Latency masking:** skeletons for lists; spinners inside action buttons only
- **Keyboard first‑class:**
  - `/` focuses search
  - `Enter` opens selected row/panel
  - `Esc` closes panel/modal (when safe)
  - optional hotkeys: `N` note, `F` fill, `D` drop (role‑gated)
- **Role‑based UX:** don’t flood users with disabled buttons; show what matters.

---

## 9) PT‑2 “Pit Station” Template (Concrete)

**Top bar**
- global search + create
- gaming day dropdown
- shift dropdown
- role badge + quick actions
- Ctrl/⌘+K hint

**Left nav**
- stations/domains
- Saved Views

**Main**
- table/list grid with inline actions and status chips

**Right panel**
- Overview / Slips / Inventory / History (domain‑specific tabs)
- pinned mode
- next/prev traversal

**Modals**
- finalize/void/permission gates only (short forms only)

---

## 10) Anti‑Patterns (Don’t Do This)

- Modal‑as‑page (scrolling modal forms)
- Hidden filters behind a single funnel icon
- Deep navigation chains for routine actions
- Stacked modals (modal → modal → modal)
- Disabled‑button graveyards (role‑gating should simplify, not taunt)
- “Success” toasts for every trivial mutation (noise ≠ feedback)

---

## 11) Implementation Notes for PT‑2

- Prefer **right panel** for edit flows; keep list context stable
- Ensure lists have stable ordering keys (created_at + id) for cursor pagination
- Embed “resolve blockers” links inside validation messages (e.g., open slips)
- Treat command palette + global search as first‑class components
- Persist user preferences (pit/shift/view) per staff user_id and casino_id

---

## Acceptance Criteria (Quick Checklist)

- [ ] Users can complete top workflows without page navigation
- [ ] Most actions happen from list + right panel
- [ ] Modals only for irreversible/high‑risk commits
- [ ] Ctrl/⌘+K supports at least: open table, open player, create slip, log fill/drop
- [ ] Filters are visible, composable, and saveable as presets
- [ ] Keyboard + focus management is correct across panel/modal flows
- [ ] Role‑gating reduces UI clutter rather than increasing it

---

**Owner:** PT‑2 UI/UX  
**Scope:** Layout shell + interaction primitives + click reduction patterns  
**Status:** Draft (ready to align with station-specific PRDs)
