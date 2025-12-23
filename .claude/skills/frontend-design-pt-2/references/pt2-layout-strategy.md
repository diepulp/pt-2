# PT-2 Layout Strategy (UI/UX) — Low-Click Pit Workflow

> **Design North Star:** The UI should behave like a pit: fast glances, muscle memory, minimal ceremony. If staff has to "navigate," the layout already failed.

---

## 1) Design for Loops, Not Pages

Casino work is cyclical and repetitive. Build the interface around operational loops:

### Core Daily Loops
- **Start shift**: open tables → verify inventory → assign dealers → confirm readiness
- **During shift**: quick player lookup → open/adjust slips → log fill/drop → add notes
- **End shift**: close slips → reconcile inventories → run reports → handover

**Layout Implication**: Loop-centric layout keeps the "work surface" stable while details change contextually.

---

## 2) PT-2 Shell Layout

### A. Persistent Left Navigation (stations/domains)
- Tables / Pit, Players, Visits, Slips
- Finance / Cashier (role-gated), MTL / Compliance (role-gated)
- Reports, Settings / Admin

**Rule**: Navigation should be *rare* during a shift; users live in one station.

### B. Central Work Surface (lists/grids)
- Table grid (pit view), Player list, Slip list, Visit list

**Rule**: The list stays visible. Never "leave the list" to do routine work.

### C. Right Context Panel (primary detail + action surface)
Clicking an item opens a right panel with:
- Summary + status + critical telemetry
- Tabs: **Overview / Actions / History** (or domain-specific)

**Rule**: The right panel replaces most "detail pages".

### D. Global Command Surface (always present)
- Global search / create
- Gaming day selector, shift selector
- Role badge + quick actions
- **Command Palette** hint (Ctrl/⌘+K)

---

## 3) Choosing the Right UI Primitive

Use the lightest interaction that safely completes the job.

### Dropdowns (fast choice, low risk)
**Use for**: Filters, sorts, presets, small option sets
**Examples**: Gaming Day, Shift, Pit, Table Status, Sort by Theo

**Rules**:
- Keep options **≤ ~12**
- Most common option is the default
- Typeahead + keyboard support
- Filters visible as "chips" (not hidden behind icons)

### Menus (contextual actions)
**Use for**: Action lists on an item ("do something to this thing")
**Examples**: `Open Slip`, `Add Note`, `Log Fill`, `View History`

**Rules**:
- Show top **2–3** actions inline; menu for the rest
- Group with separators: **Common / Rare / Danger**
- Dangerous actions isolated and labeled clearly

### Drawers / Right Panels (workhorse)
**Use for**: Inspect + edit while keeping list context
**Examples**: Click table row → inventory + open slips + dealer + last drop + actions

**Rules**:
- Keep the list visible behind the panel (no "lost place")
- Provide **pin panel** for power users
- Support item traversal (↑/↓) while panel is open
- Prefer inline editing inside the panel over separate pages

### Modals (interruptions — use sparingly)
**Use for**: Irreversible actions, multi-step confirmation, permission gates
**Examples**: `Finalize Drop`, `Void Transaction`, `Close Table`

**Rules**:
- A modal should never feel like a page (avoid scroll)
- Avoid stacking modals; if you need depth, use a panel
- Esc closes (when safe); Enter submits (when safe)
- No global navigation inside modals (design smell)

---

## 4) Click-Reduction Patterns

### 1) Command Palette (highest ROI)
Global **Ctrl/⌘+K** for:
- "Open Table 12", "Create slip for John Doe"
- "Log fill", "Issue mid-session reward"

**Impact**: Replaces multi-step navigation with one muscle-memory action.

### 2) Inline Row Actions + Overflow
In dense lists (tables/players/slips):
- 2–3 primary actions visible (buttons/icons)
- Everything else in `⋯`

**Avoid**: Click row → open detail page → find action → click again.

### 3) Smart Defaults + Remembered State
- Remember last Pit / Shift / filters
- Default gaming day via `compute_gaming_day`
- Prefill forms with common values

### 4) Bulk Operations
Pit work is batchy:
- Multi-select → open/close/assign/export in one pass
- Persistent selection bar appears immediately
- Confirm only when destructive

### 5) Quick-Add (one field + Enter)
For rapid logging:
- Add note inline → Enter to submit
- Add player tag with typeahead → Enter
- Keep "full form" in the panel for edge cases

---

## 5) Modal Design: Make Them Surgical

If a modal is necessary, it must be tight and decision-oriented.

**Template**:
- **Header**: Verb + object (e.g., "Finalize Drop — Table 12")
- **Body**: Only what's needed to decide + minimal fields
- **Footer**: Primary action right, cancel left
- **Danger**: Explicit label ("Void Transaction", not "OK")
- **Validation**: Inline, actionable ("Open slips exist → View & resolve")

---

## 6) Filters as Shift Presets

Staff shouldn't "recreate the same view" all day.

### Saved Views (recommended)
- "My Pit — Open Tables"
- "Needs Attention"
- "Open Slips — High Theo"
- "Tables Awaiting Drop"

### Filter Rules
- Composable chips/tokens
- Visible by default
- One-click reset/clear
- Stable ordering + cursors for pagination (avoid drift)

---

## 7) Error Reduction Patterns

### Two-Stage Commit (only where needed)
- **High-risk**: voids, finalize drop, cash-out, compliance actions
- **Low-risk**: notes, tags, assignments → prefer **Undo**

### Validation Strategy
- Inline validation (don't "submit → fail → toast")
- Optimistic UI for low-risk actions with reliable rollback
- Permission-aware action surfacing (hide what users can't do)

---

## 8) Micro-Interactions

- **Focus management**: Close panel/modal → return focus to originating row
- **Toast discipline**: Only meaningful state changes; errors must be actionable
- **Latency masking**: Skeletons for lists; spinners inside action buttons only
- **Keyboard first-class**:
  - `/` focuses search
  - `Enter` opens selected row/panel
  - `Esc` closes panel/modal (when safe)
  - Optional hotkeys: `N` note, `F` fill, `D` drop (role-gated)
- **Role-based UX**: Don't flood users with disabled buttons; show what matters

---

## 9) Anti-Patterns (Don't Do This)

| Anti-Pattern | Why It Fails |
|--------------|--------------|
| Modal-as-page (scrolling modal forms) | Breaks decision-oriented flow |
| Hidden filters behind a single funnel icon | Forces filter recreation |
| Deep navigation chains for routine actions | Slows repetitive loops |
| Stacked modals (modal → modal → modal) | Confuses context, hard to escape |
| Disabled-button graveyards | Role-gating should simplify, not taunt |
| "Success" toasts for every trivial mutation | Noise ≠ feedback |

---

## Implementation Checklist

- [ ] Users complete top workflows without page navigation
- [ ] Most actions happen from list + right panel
- [ ] Modals only for irreversible/high-risk commits
- [ ] Ctrl/⌘+K supports: open table, open player, create slip, log fill/drop
- [ ] Filters visible, composable, and saveable as presets
- [ ] Keyboard + focus management correct across panel/modal flows
- [ ] Role-gating reduces UI clutter rather than increasing it

---

**Source**: `docs/ui-design/PT2_LAYOUT_STRATEGY_UI_UX.md`
