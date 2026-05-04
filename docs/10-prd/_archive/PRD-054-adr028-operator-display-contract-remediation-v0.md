---
id: PRD-054
title: "ADR-028 D6 Operator Display Contract — Remediation"
owner: Engineering
status: Draft
affects: [ADR-028, PRD-038A, PRD-031]
created: 2026-03-25
last_review: 2026-03-25
phase: Phase 2 (Table Lifecycle Hardening)
http_boundary: false
---

# PRD-054 — ADR-028 D6 Operator Display Contract Remediation

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** The ADR-028 Amendment (D6 Operator Display Contract, v0.3.0) defines how operator-facing surfaces must derive table display state from the combination of `gaming_table.status` and `table_session.status`. The amendment is frozen; this PRD delivers the code changes it specifies. Four components need targeted fixes — one missing prop wire, one raw-enum fallback replacement, one interface extension, and one label correction. No database migrations, no new RPCs. Presentation-layer only.

## 2. Problem & Goals

### Problem

After a table session closes, the pit terminal badge on `tables-panel.tsx` displays raw `"active"` (the `gaming_table.status` enum value) instead of the operator-friendly `"Available"` label. This happens because:

1. `tables-panel.tsx` has the `session` object but does not pass `sessionStatus` to `TableLayoutTerminal` — the prop is simply missing.
2. `table-layout-terminal.tsx` falls back to the raw `tableStatus` string when `sessionStatus` is undefined, violating D6.4 (raw enum ban).
3. `pit-map-selector.tsx` has no session awareness at all — every active table shows "Available" regardless of whether play is underway.

The result: a pit boss cannot distinguish a table with live play from one that just closed, and the raw string `"active"` leaks onto the operator surface.

### Goals

1. **Wire the missing prop** — `tables-panel.tsx` passes session status to the terminal badge so D6.1 derivation can execute.
2. **Eliminate raw enum fallback** — `table-layout-terminal.tsx` routes all badge text through `TABLE_AVAILABILITY_LABELS` / `SESSION_PHASE_LABELS`, never displaying raw database values.
3. **Distinguish AVAILABLE from IN_PLAY visually** — pulse ring + full opacity for IN_PLAY; dimmed emerald, no pulse for AVAILABLE. A pit boss can tell them apart without reading label text.
4. **Enrich pit navigator with session awareness** — `pit-map-selector.tsx` reflects D6.1 composite derivation so table selection also shows session state.

### Non-Goals

- No changes to database schema, enums, or migrations.
- No new RPCs or service layer changes.
- No changes to `session-status-banner.tsx`, `session-action-buttons.tsx`, or `table-toolbar.tsx` — these already handle null sessions correctly.
- No mounting of `table-grid.tsx` / `pit-dashboard-client.tsx` — the multi-table grid is a separate future initiative.

## 3. Users & Use Cases

### Primary User: Pit Boss / Floor Supervisor

| Job | Current Experience | After Fix |
|-----|--------------------|-----------|
| Scan selected table status at a glance | Badge shows raw `"active"` after session close — indistinguishable from live play | Badge shows `"Available"` (dimmed, no pulse) vs `"In Play"` (emerald, pulse ring) |
| Navigate between tables via pit selector | All active tables show "Available" regardless of session state | Tables with active sessions show session-derived labels (e.g., "In Play", "Rundown") |
| Understand table readiness | Must click into table detail to see if session is open | Badge + navigator both reflect session presence at first glance |

## 4. Scope & Feature List

### WS1: Wire Session Status to Terminal Badge

- [ ] `tables-panel.tsx:224-236` — pass `sessionStatus={session?.status ?? null}` to `TableLayoutTerminal`

### WS2: D6.1 Derivation in Terminal Badge

- [ ] Create `deriveOperatorDisplayState(tableAvailability, sessionPhase)` helper in `services/table-context/labels.ts` or `services/table-context/display.ts`
- [ ] Helper returns `{ state, label, color, pulse }` per D6.2 table
- [ ] Replace `effectiveStatus` / `effectiveLabel` inline logic in `table-layout-terminal.tsx:67-79` with call to shared helper
- [ ] Null session + active table → `AVAILABLE` label from `TABLE_AVAILABILITY_LABELS`, dimmed emerald, no pulse ring
- [ ] Active session → `IN_PLAY` label from `SESSION_PHASE_LABELS`, full emerald, pulse ring
- [ ] RUNDOWN → amber, no pulse
- [ ] Inactive table (any session) → `IDLE`, gray/amber
- [ ] Closed table (any session) → `DECOMMISSIONED`, zinc/grayscale

### WS3: Pit Navigator Session Enrichment (D6.6.1)

- [ ] Extend `PitMapTable` interface in `pit-map-selector.tsx` with `sessionStatus?: 'OPEN' | 'ACTIVE' | 'RUNDOWN' | null`
- [ ] Apply D6.1 composite derivation to status dot color and label when `sessionStatus` is present
- [ ] Wire `sessionStatus` from `DashboardTableDTO.current_session_status` through `groupTablesByPit()` utility to `PitMapPit.tables`

### WS4: Label Correction

- [ ] `use-table-session.ts` `getSessionStatusLabel()` — change OPEN from `"Opening"` to `"Open"` per D6.2
- [ ] `services/table-context/labels.ts` `SESSION_PHASE_LABELS.OPEN` — verify already reads `"Opening"`, update to `"Open"`

## 5. Requirements

### Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| FR-1 | Terminal badge displays `"Available"` (not raw `"active"`) when table is active with no session | D6.1, D6.4 |
| FR-2 | Terminal badge displays `"In Play"` with emerald pulse ring when session is ACTIVE | D6.2 S1 |
| FR-3 | Terminal badge displays `"Rundown"` in amber when session is RUNDOWN | D6.2 S2 |
| FR-4 | Terminal badge displays `"Idle"` when table is inactive | D6.2 S8/S9 |
| FR-5 | Terminal badge displays `"Decommissioned"` when table is closed | D6.2 S10 |
| FR-6 | AVAILABLE visually distinct from IN_PLAY — pulse ring presence + opacity/saturation | D6.2 |
| FR-7 | Pit navigator reflects session state for active tables | D6.6.1 |
| FR-8 | No operator surface displays raw `"active"` or `"ACTIVE"` as badge text | D6.4 |
| FR-9 | D6.1 derivation shared across terminal badge and pit-map-selector | Acceptance criteria |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | No database migrations |
| NFR-2 | No new RPCs or service layer changes |
| NFR-3 | Badge derivation is a pure function — no side effects, no async |
| NFR-4 | No bundle size regression (shared helper, not new dependency) |

## 6. UX / Flow Overview

### Terminal Badge State Machine (Visual)

```
gaming_table.status = 'closed'    → DECOMMISSIONED (zinc, grayscale)
gaming_table.status = 'inactive'  → IDLE (gray/amber, muted)
sessionPhase = 'ACTIVE'           → IN_PLAY (emerald, pulse ring, full opacity)
sessionPhase = 'RUNDOWN'          → RUNDOWN (amber, no pulse)
sessionPhase = 'OPEN'             → OPEN (blue)
sessionPhase = null               → AVAILABLE (emerald dimmed, no pulse, reduced opacity)
```

### Pit Navigator Change

- Before: All active tables show green dot + "Available"
- After: Active table with ACTIVE session → emerald dot + "In Play"; active table with no session → dimmed emerald dot + "Available"

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| ADR-028 Amendment v0.3.0 | Frozen | Defines D6.1-D6.6 contracts |
| `TABLE_AVAILABILITY_LABELS` in `labels.ts` | Exists | Already maps `active → "Available"` |
| `SESSION_PHASE_LABELS` in `labels.ts` | Exists | Maps session phases to labels |
| `DashboardTableDTO.current_session_status` | Exists | RPC already returns session status |
| `session` object in `TablesPanel` | Exists | Available at line 63, just not wired to terminal |

### Risks

| Risk | Mitigation |
|------|------------|
| `groupTablesByPit()` utility may strip `current_session_status` | Verify utility passes through all DTO fields; extend if needed |
| Visual regression in compact variant (unmounted grid) | Shared helper ensures both variants get same derivation; visual snapshot optional |

### Open Questions

None. The amendment fully specifies all display states, labels, colors, and scenarios.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Scenarios S1–S10 from D6.5 produce correct display state, label, and visual treatment
- [ ] Terminal badge shows `"Available"` (dimmed emerald, no pulse) when table is active with null session
- [ ] Terminal badge shows `"In Play"` (emerald, pulse ring) when session is ACTIVE
- [ ] Pit navigator status dot and label reflect D6.1 derivation when `sessionStatus` is available

**Data & Integrity**
- [ ] No database changes — presentation-layer only

**Security & Access**
- [ ] No authorization changes — display derivation is read-only

**Testing**
- [ ] Unit tests for `deriveOperatorDisplayState()` helper covering all 10 D6.5 scenarios
- [ ] Component test or visual snapshot confirming AVAILABLE vs IN_PLAY pulse ring distinction

**Operational Readiness**
- [ ] No new runtime dependencies

**Documentation**
- [ ] ADR-028 amendment acceptance criteria checkboxes checked on completion

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| **ADR** | `docs/80-adrs/ADR-028-amendment-delta-operator-status-contract.md` | Governing spec — D6.1 through D6.6 |
| **PRD** | `docs/10-prd/PRD-038A-table-lifecycle-audit-patch.md` | Prior table lifecycle fixes; session wiring introduced |
| **ARCH** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | TableContext bounded context ownership |
| **V&S** | `docs/00-vision/table-context-read-model/TABLE-SESSION-LIFECYCLE-IMPLEMENTATION-PRECIS.md` | Implementation posture and gap map |

---

## Appendix A: Workstream Summary

| WS | Scope | Files | Estimated LOC |
|----|-------|-------|---------------|
| WS1 | Wire missing prop | `tables-panel.tsx` | ~1 line |
| WS2 | D6.1 derivation helper + terminal badge refactor | `labels.ts` or `display.ts`, `table-layout-terminal.tsx` | ~40-60 lines |
| WS3 | Pit navigator session enrichment | `pit-map-selector.tsx`, `group-tables-by-pit.ts` | ~20-30 lines |
| WS4 | Label correction | `use-table-session.ts`, `labels.ts` | ~2 lines |

**Total estimated change:** ~65-95 lines across 5-6 files. No migrations, no RPCs, no new dependencies.

## Appendix B: D6.5 Scenario Verification Matrix

Copied from ADR-028 Amendment for build pipeline consumption:

| # | `gaming_table.status` | `current_session_status` | Expected Label | Expected Visual |
|---|---|---|---|---|
| S1 | `active` | `ACTIVE` | "In Play" | Emerald, pulse ring |
| S2 | `active` | `RUNDOWN` | "Rundown" | Amber, no pulse |
| S3 | `active` | `OPEN` | "Open" | Blue |
| S4 | `active` | `null` | "Available" | Dimmed emerald, no pulse |
| S5 | `active` | `null` | "Available" | Dimmed emerald, no pulse |
| S6 | `active` | `null` | "Available" | Dimmed emerald, no pulse |
| S7 | `active` | `RUNDOWN` | "Rundown" | Amber, no pulse |
| S8 | `inactive` | `ACTIVE` | "Idle" | Gray/amber |
| S9 | `inactive` | `null` | "Idle" | Gray/amber |
| S10 | `closed` | any | "Decommissioned" | Zinc, grayscale |

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-25 | Initial draft — remediation scope from ADR-028 Amendment v0.3.0 |
