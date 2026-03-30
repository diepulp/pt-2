---
title: "ADR-028 Amendment: Operator Display Contract (D6 Hardening)"
status: proposed
date: 2026-03-24
amends: ADR-028 (Table Status Standardization)
scope: D6 UI Label Mapping → Operator Display Contract
trigger: ISSUE-SESSION-CLOSE-DOWNSTREAM — table badge shows raw "active" after session close
---

# ADR-028 Amendment: Operator Display Contract

## Why This Amendment Exists

ADR-028 D6 defined two independent label maps — one for `TableAvailability`, one for `SessionPhase` — and stopped there. It never specified:

- Which label system takes precedence when both apply
- What to display when a session is absent (null) or just closed
- Whether raw enum values are acceptable on operator-facing surfaces

The result: `table-layout-terminal.tsx` falls back to the raw string `"active"` when `sessionStatus` is null, making a table that just closed its session visually identical to one mid-play. This is not a new architectural problem. ADR-028 chose the right direction; D6 just stopped one sentence too early.

This amendment hardens D6 into a normative operator display contract.

---

## Amendment to D6: Operator Display Contract

### D6.1: Composite Derivation (Normative)

Every operator-facing surface that displays table state MUST derive a single **operator display state** from the combination of `gaming_table.status` (TableAvailability) and the current `table_session.status` (SessionPhase | null).

The derivation is:

```
operatorDisplayState(availability, sessionPhase):
  if availability = 'closed'       → DECOMMISSIONED
  if availability = 'inactive'     → IDLE
  if sessionPhase = 'ACTIVE'       → IN_PLAY
  if sessionPhase = 'RUNDOWN'      → RUNDOWN
  if sessionPhase = 'OPEN'         → OPEN
  if sessionPhase is null          → AVAILABLE
  — no other cases exist; CLOSED sessions are filtered
    from the current-session query and appear as null
```

Note: `table_session.status = 'CLOSED'` never appears in the `current_session_status` field — the dashboard RPC (`rpc_get_dashboard_tables_with_counts`) filters to `WHERE status IN ('OPEN','ACTIVE','RUNDOWN')`. A session that just closed produces `sessionPhase = null`, which falls through to `AVAILABLE`.

### D6.2: Operator Display State Table

| Operator State | Derived When | Label | Color | Badge Style |
|---|---|---|---|---|
| `IN_PLAY` | `active` + session `ACTIVE` | "In Play" | Emerald (green) | Solid, pulse ring |
| `RUNDOWN` | `active` + session `RUNDOWN` | "Rundown" | Amber | Solid, play continues |
| `OPEN` | `active` + session `OPEN` | "Open" | Blue | Solid |
| `AVAILABLE` | `active` + session null | "Available" | Emerald (green), **dimmed** | No pulse, reduced opacity vs IN_PLAY |
| `IDLE` | `inactive` + any | "Idle" | Amber/Gray | Muted |
| `DECOMMISSIONED` | `closed` + any | "Decommissioned" | Zinc/Gray | Grayscale |

**Visual distinction between IN_PLAY and AVAILABLE is mandatory.** These are the two most common states a pit boss sees, and they answer different questions: "is this table generating revenue right now?" vs "can I open a session here?" A pit boss scanning a grid of 30 tables must be able to distinguish them at a glance without reading the label text.

Minimum differentiation: pulse ring presence (IN_PLAY has it, AVAILABLE does not) plus opacity or saturation difference.

### D6.2.1: RUNDOWN Operational Semantics

**RUNDOWN does not stop play.** The amber badge signals that an accounting snapshot procedure is underway, not that the table is winding down or unavailable. During RUNDOWN:

- Fills and credits remain permitted (the fill/credit RPCs explicitly include `'RUNDOWN'` in the active status check)
- New rating slips can be opened; new players can be seated
- Buy-in telemetry continues to be logged

RUNDOWN can be triggered:
- **End of shift** — the normal case: capture closing inventory, compute win/loss, close session
- **Mid-shift** — for accounting purposes (e.g., gaming day boundary rollover, supervisor spot check)
- **Gaming day rollover** — a table crosses the admin-configured gaming day boundary (`casino_settings.gaming_day_start_time`, default 06:00 local); the session cycles through RUNDOWN → CLOSED → new session ACTIVE without interrupting play at the felt

The `crossed_gaming_day` flag on `table_session` marks sessions that spanned a gaming day boundary as computed by `compute_gaming_day(casino_id, timestamp)`. The boundary is the casino's configured gaming day start time, not midnight. This is an accounting artifact, not a play-state signal.

**Tooltip guidance:** RUNDOWN tooltips should say "Accounting snapshot in progress" or "Rundown in progress — play continues", not "Closing procedures underway" which implies imminent shutdown.

### D6.2.2: Scope of the Badge Fix

The null-session display problem manifests on `table-layout-terminal.tsx`'s internal badge. There are **two render sites** for this component, and only one currently receives session data:

| Render site | Component chain | Variant | `sessionStatus` prop | Status |
|---|---|---|---|---|
| **Pit panel (live)** | `pit-panels-client.tsx` → `PanelContainer` → `TablesPanel` → `TableLayoutTerminal` | `full` | **Not passed** — `session` object available but not wired to the terminal's `sessionStatus` prop | **Broken** |
| **Dashboard grid (unmounted)** | `pit-dashboard-client.tsx` → `TableGrid` → `TableLayoutTerminal` | `compact` | Passed via `table.current_session_status` | Correct wiring, but component not mounted on live `/pit` route |

The **primary bug surface** is `tables-panel.tsx:224-236`, which renders `TableLayoutTerminal` in `full` variant without passing the `sessionStatus` prop. The `session` object is available at `tables-panel.tsx:63` (passed through from `PanelContainer`) and is already wired to `SessionActionButtons` and `TableToolbar`, but not to `TableLayoutTerminal`. The terminal falls back to raw `tableStatus` ("active") because `sessionStatus` is undefined.

The `TableGrid` component in `components/dashboard/table-grid.tsx` correctly wires `sessionStatus` but is not rendered on the live pit route. The pit page (`app/(dashboard)/pit/page.tsx`) renders `PitPanelsDashboardLayout` → `PitPanelsClient` → `PanelContainer`, which uses `TablesPanel` with a single full-variant terminal and `PitMapSelector` (dropdown) for table switching — not a grid of compact thumbnails.

**Fix scope:**
1. `tables-panel.tsx` — pass `session?.status ?? null` as `sessionStatus` to `TableLayoutTerminal`
2. `table-layout-terminal.tsx` — replace raw `tableStatus` fallback in `effectiveLabel` with D6.1 derivation

The detail-level components (`session-status-banner.tsx`, `session-action-buttons.tsx`, `table-toolbar.tsx`) already handle null sessions correctly and do not need changes.

### D6.3: Precedence Rule

**Session phase takes precedence over availability when present.**

Evaluation order:
1. Check `gaming_table.status` for terminal/offline states (`closed` → DECOMMISSIONED, `inactive` → IDLE). These override everything because the table is not operational.
2. If the table is `active`, check `current_session_status`. If a session exists, the session phase determines the display state.
3. If the table is `active` and no session exists, the display state is `AVAILABLE`.

This is a read-only derivation. It does not create a new database column, enum, or materialized state. It is a presentation-layer contract.

### D6.4: Raw Enum Ban on Operator Surfaces

**No operator-facing badge, label, or status indicator may display a raw database enum value.**

Concretely:
- The string `"active"` (lowercase, the `table_status` enum value) MUST NOT appear as badge text on pit terminals, dashboards, or navigation dropdowns.
- The string `"ACTIVE"` (uppercase, the `table_session_status` enum value) MUST NOT appear as badge text.
- All operator surfaces MUST resolve through the D6.2 display state table or the existing `TABLE_AVAILABILITY_LABELS` / `SESSION_PHASE_LABELS` constants from `services/table-context/labels.ts`.

**Rationale:** Raw enum fallback is the concrete leak path that produced the observed bug. The `effectiveLabel` in `table-layout-terminal.tsx:75-79` falls back to `tableStatus` (the raw enum) when `sessionStatus` is null. This violates D6's intent and produces the ambiguous "active" badge.

UI components MUST NOT use raw fallback patterns such as:

```ts
const effectiveLabel = sessionStatusLabel ?? tableStatus;
```

Instead, all operator-facing badge rendering must flow through a single centralized derivation helper:

```ts
type TableBadgeInput = {
  tableAvailability: TableAvailability;
  sessionPhase: SessionPhase | null;
};

export function deriveOperatorTableBadge(input: TableBadgeInput): {
  label: string;
  color: string;
} {
  if (input.sessionPhase) {
    return SESSION_PHASE_BADGES[input.sessionPhase];
  }
  return TABLE_AVAILABILITY_BADGES[input.tableAvailability];
}
```

This helper becomes the canonical rendering path for terminal and pit-facing table badges. It lives in `services/table-context/labels.ts` or a dedicated `services/table-context/display.ts`.

### D6.5: Scenario Tests

The following scenarios MUST produce the specified display state. Any implementation that fails these is non-compliant with D6:

| # | `gaming_table.status` | `current_session_status` | Scenario | Expected Display | Expected Label | Visual |
|---|---|---|---|---|---|---|
| S1 | `active` | `ACTIVE` | Normal play | `IN_PLAY` | "In Play" | Emerald, pulse ring |
| S2 | `active` | `RUNDOWN` | Accounting snapshot underway, play continues | `RUNDOWN` | "Rundown" | Amber, no pulse |
| S3 | `active` | `OPEN` | Session created, awaiting opening snapshot (dormant — no code path produces this today) | `OPEN` | "Open" | Blue |
| S4 | `active` | `null` | Table never opened today | `AVAILABLE` | "Available" | Dimmed emerald, no pulse |
| S5 | `active` | `null` | Session closed earlier this shift | `AVAILABLE` | "Available" | Dimmed emerald, no pulse |
| S6 | `active` | `null` | Gaming day rollover — old session closed, new not yet opened | `AVAILABLE` | "Available" | Dimmed emerald, no pulse |
| S7 | `active` | `RUNDOWN` | Mid-shift rundown for spot check | `RUNDOWN` | "Rundown" | Amber, no pulse |
| S8 | `inactive` | `ACTIVE` | Admin deactivated table mid-session (D3 edge case) | `IDLE` | "Idle" | Gray/amber |
| S9 | `inactive` | `null` | Table offline | `IDLE` | "Idle" | Gray/amber |
| S10 | `closed` | any | Decommissioned | `DECOMMISSIONED` | "Decommissioned" | Zinc, grayscale |

**S4, S5, and S6 produce the same display state.** From the terminal badge perspective, "never opened", "closed earlier", and "between rollover sessions" are all `AVAILABLE` — the table has no running session and can accept a new one. The badge answers "can I open a session here?" not "what happened before." The detail-level `session-status-banner.tsx` answers the session-state question separately with "No Session" (see D6.6).

**S2 and S7 produce the same display state.** Whether the rundown is end-of-shift or mid-shift, the badge shows the same amber "Rundown". The tooltip may optionally distinguish these if operational need arises, but the badge does not.

---

## Affected Code Paths

### Must Change

| File | Current Behavior | Required Change |
|---|---|---|
| `components/pit-panels/tables-panel.tsx:224-236` | Renders `TableLayoutTerminal` full variant **without** passing `sessionStatus` prop; `session` object is available at line 63 but not wired | Pass `sessionStatus={session?.status ?? null}` to `TableLayoutTerminal` |
| `components/table/table-layout-terminal.tsx:67-79` | `effectiveLabel` falls back to raw `tableStatus` string when `sessionStatus` is null/undefined | Use D6.1 derivation; import labels from `labels.ts`; null session → `TABLE_AVAILABILITY_LABELS[tableStatus]` |
| `components/table/table-layout-terminal.tsx:69-73` | `effectiveStatus` maps RUNDOWN→`'inactive'`, all else→`'active'`; no visual distinction between IN_PLAY and AVAILABLE | Replace with D6.1 derivation producing distinct AVAILABLE vs IN_PLAY visuals |

### Already Compliant

| File | Status |
|---|---|
| `components/dashboard/table-grid.tsx:119` | Passes `sessionStatus={table.current_session_status}` — correct wiring, but component not mounted on live `/pit` route |
| `components/table/pit-map-selector.tsx` | Uses `STATUS_CONFIG` with D6 labels — but lacks session awareness (see D6.6.1) |
| `services/table-context/labels.ts` | `TABLE_AVAILABILITY_LABELS` and `SESSION_PHASE_LABELS` exist and are correct |
| `hooks/table-context/use-table-session.ts` | `getSessionStatusLabel()` returns session phase labels — **must update OPEN→"Open" (currently returns "Opening")** |

### Must Adopt (D6.6.1, Normative)

| File | Note |
|---|---|
| `components/table/pit-map-selector.tsx` | Currently reads only `gaming_table.status`. MUST accept `sessionStatus` in `PitMapTable` interface and apply D6.1 derivation for consistent display across pit terminal and navigation. |

---

## Amendment to ADR-028 Consequences

### Neutral (corrected)

ADR-028 originally stated:

> Case convention stays: lowercase vs UPPERCASE actually helps distinguish systems

**Replace with:**

> Case convention stays for storage and developer comprehension only; it must not be relied on for operator-facing disambiguation.

The lowercase vs UPPERCASE distinction is acceptable for code and queries, but it cannot do disambiguation work in the UI — a pit boss does not parse casing. The operator display contract (D6.1–D6.4) is the disambiguation mechanism, not typography.

### Risks (strengthened)

ADR-028 risk row:

> | UI shows wrong label | Centralized label constants + component audit |

**Replace with:**

> | Operator surface leaks raw enum vocabulary and misstates operational meaning | Centralized derived-badge helper, no-raw-fallback rule, component audit, and explicit precedence tests |

**Add row:**

> | Developers assume `active` means live gameplay across contexts | Semantic aliases, ADR terminology, and operator-label contract separating `Available` from `In Play` |

### D6.6: Surface-Question Contract (Normative)

The system encodes three orthogonal axes about a gaming table:

| Axis | Persistent source | What it answers |
|------|-------------------|-----------------|
| **Table availability** | `gaming_table.status` | "Is this table administratively/physically operable?" |
| **Current session phase** | `table_session.status` on the current non-closed row (nullable) | "What phase is play in right now?" |
| **Actionability** | Derived from availability + session phase | "Can I open a session here now?" |

These are distinct questions. A single UI badge cannot honestly answer all three. Each operator-facing surface MUST commit to exactly one primary question and derive its label from the axis that answers it.

#### Assigned Surface Contracts

| Surface | Component | Primary question | Label source | Null session renders as |
|---------|-----------|-----------------|--------------|------------------------|
| **Terminal badge** | `table-layout-terminal.tsx` (full variant, in `TablesPanel`) | "Can I act on this table?" | D6.1 composite derivation (actionability) | `AVAILABLE` — dimmed emerald, no pulse |
| **Session banner** | `session-status-banner.tsx` | "What is the current session state?" | `table_session.status` directly | `"No Session"` — outline badge |
| **Action buttons** | `session-action-buttons.tsx` | "What can I do next?" | State machine guards (`canOpenSession`, `canStartRundown`, `canCloseSession`) | `"Open Session"` enabled; Rundown/Close disabled |
| **Pit navigator** | `pit-map-selector.tsx` | "Is this table on the floor?" | `gaming_table.status` + session awareness (D6.6.1) | Table availability label; session-enriched when available |
| **Terminal tooltip** | `table-layout-terminal.tsx` tooltip | "What is the fuller context?" | Session phase + availability combined | `"Table available — no active session"` |
| **Dashboard grid** (unmounted) | `table-grid.tsx` → `table-layout-terminal.tsx` compact variant | "Can I act on this table?" | D6.1 composite derivation | `AVAILABLE` — same as terminal badge |

**Note on the dashboard grid:** `components/dashboard/table-grid.tsx` renders a multi-table grid of compact thumbnails and correctly wires `sessionStatus`. However, it is mounted via `pit-dashboard-client.tsx` which is **not** the component rendered on the live `/pit` route. The live pit page renders `PitPanelsDashboardLayout` → `PitPanelsClient` → `PanelContainer` → `TablesPanel`, which shows a single full-variant terminal with `PitMapSelector` (dropdown) for table switching. The grid component exists for a future multi-table scanning view but is not the current bug surface.

#### D6.6.1: Pit Navigator Session Enrichment (Must Adopt)

`pit-map-selector.tsx` currently reads only `gaming_table.status` and maps `active → "Available"` for every active table regardless of session state. This makes it impossible for a pit boss to distinguish a table with live play from an idle table while navigating between selections.

The `PitMapTable` interface MUST accept an optional `sessionStatus` field. When present, the status dot and label in the navigator dropdown MUST reflect D6.1 composite derivation — specifically, an active table with an `ACTIVE` session should be visually distinct from an active table with no session.

This is promoted from "Should Adopt" (D6.2.2) to normative.

#### Why the Terminal Badge Answers Actionability, Not Session State

The terminal badge shares space with the session banner and action buttons on the same panel. The banner already answers "what is the session state?" and the action buttons answer "what can I do next?" If the terminal badge also answered session state, it would duplicate the banner's signal.

Instead, the terminal badge answers actionability — the composite derivation from D6.1 that combines table availability with session phase. When a session is absent, "Available" tells the pit boss this table is ready for a new session. "No Session" would duplicate the banner and provide no additional signal.

The visual distinction between `IN_PLAY` (emerald + pulse ring) and `AVAILABLE` (dimmed emerald, no pulse) encodes session presence without reading the label text. The tooltip provides the combined context: "Table available — no active session."

The terminal badge and session banner form a complementary pair on the same panel:

- **Terminal badge:** "This table is available" — actionability
- **Session banner:** "No session started" — session state
- **Tooltip (hover):** "Table available — no active session" — combined context

This contract also applies to the compact grid variant if/when the multi-table grid is mounted on a live route.

---

## Disposition

Amend ADR-028 in place. Do not spawn ADR-028B or a replacement ADR. The architectural decision was already correct. What failed was its sharpness at the UI contract edge. This is a hardening amendment, not a new direction.

---

## Known Debt: System-Wide `'active'` Semantic Pollution

ADR-028 resolves the `table_status` / `table_session_status` collision. It does not address the broader problem: `'active'` appears as a status value across five database entities with five different meanings.

| Entity | Column | Type | `'active'` means |
|---|---|---|---|
| `casino` | `status` | untyped text | Casino is operational |
| `staff` | `status` | `staff_status` enum | Staff is employed |
| `player_casino` | `status` | untyped text | Player enrolled at casino |
| `gaming_table` | `status` | `table_status` enum | Table physically available |
| `table_session` | `status` | `table_session_status` enum | Session in operation (UPPERCASE: `'ACTIVE'`) |

Two of these (`casino`, `player_casino`) use untyped `text` columns with no enum constraint. This is a pre-existing schema debt from the baseline SRM, not introduced by ADR-028.

**Disposition:** Out of scope for this amendment. The `active`/`ACTIVE` collision within TableContext is resolved by D5 (type aliases) and D6 (labels). The wider audit belongs in a separate schema-hygiene initiative.

---

## Acceptance Criteria (Amendment)

Extends the original ADR-028 acceptance criteria:

- [ ] D6.1 derivation function implemented and shared across terminal badge and pit-map-selector
- [ ] No operator-facing surface displays raw `"active"` or `"ACTIVE"` as badge text
- [ ] `AVAILABLE` state visually distinguishable from `IN_PLAY` (pulse ring / opacity / saturation)
- [ ] Scenarios S1–S10 pass in component tests or visual regression
- [ ] `pit-map-selector.tsx` `PitMapTable` interface accepts optional `sessionStatus` (D6.6.1, normative)
- [ ] Pit navigator status dot reflects D6.1 derivation when session data available (D6.6.1)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-16 | ADR-028 initial — Table Status Standardization |
| 0.2.0 | 2026-03-24 | Amendment: harden D6 into Operator Display Contract (D6.1–D6.5) |
| 0.3.0 | 2026-03-25 | D6.6: Surface-Question Contract — codify which surface answers which axis; promote pit-map-selector session enrichment to normative; correct bug surface from grid thumbnail to TablesPanel full variant; fix gaming day boundary reference (not midnight) |
