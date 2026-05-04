---
id: PRD-058
title: "ADR-047 Operator–Admin Surface Separation"
owner: Engineering
status: Draft
affects: [ADR-047, ADR-028, PRD-054, PRD-057]
created: 2026-03-25
last_review: 2026-03-25
phase: Phase 2 (Table Lifecycle Hardening)
http_boundary: false
---

# PRD-058 — ADR-047 Operator–Admin Surface Separation

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** The pit dashboard currently merges administrative table availability (`gaming_table.status`) and operational session state (`table_session.status`) onto a single surface, producing semantic drift — "Available" on a table where PRD-057 blocks all gameplay, "Idle" implying players might sit down at an admin-blocked table, "Decommissioned" visible to pit bosses who cannot act on it. ADR-047 establishes that administrative and operational axes belong on separate surfaces with separate vocabularies. This PRD delivers the code changes for ADR-047 Phase 1 (data-flow filter) and Phase 2 (vocabulary split). Phase 3 (admin catalog) and Phase 4 (OPEN workflow) are explicitly out of scope.

---

## 2. Problem & Goals

### 2.1 Problem

After PRD-057 hardened session-gated seating (`96a8ab9`), a table with no session is operationally closed — no players can be seated, no rating slips opened, no gameplay permitted. Yet the pit terminal badge shows "Available" (dimmed emerald), a label that implies readiness. Simultaneously, tables that are administratively offline (`inactive`) or permanently retired (`closed`) appear on the pit dashboard with labels ("Idle", "Decommissioned") that belong on an admin catalog surface, not an operational monitoring surface.

The root cause is twofold:

1. **No data-flow boundary.** `rpc_get_dashboard_tables_with_counts` returns all tables regardless of `gaming_table.status`. The pit boss sees admin-state tables interspersed with operational ones.
2. **Shared vocabulary.** A single `deriveOperatorDisplayBadge()` function and a single `TABLE_AVAILABILITY_LABELS` constant map serve both axes, producing a composite badge that pretends to answer two different questions at once.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Pit dashboard shows only operationally relevant tables | Zero tables with `gaming_table.status != 'active'` in pit dashboard query results |
| **G2**: Null-session tables display "Closed" (zinc/gray), not "Available" | Badge text and color verified in scenario tests S3–S5 |
| **G3**: Admin and pit vocabularies are type-separated | `derivePitDisplayBadge()` does not accept `tableAvailability`; `PIT_DISPLAY_LABELS` and `ADMIN_DISPLAY_LABELS` are separate constant sets with no shared mutable map |
| **G4**: No pit surface displays "Idle", "Decommissioned", or "Available" | Grep verification across `components/table/` and `components/pit-panels/` |

### 2.3 Non-Goals

- **Admin catalog UI** (`/admin/tables`). ADR-047 Phase 3. Separate PRD when prioritized.
- **OPEN session workflow.** ADR-047 Phase 4 / ADR-028 D4. Requires custodial chain validation PRD. The `OPEN` display state exists defensively in the type union but is not a testable runtime expectation.
- **Database schema changes.** No enum additions, no column changes, no new tables.
- **Session banner or action buttons changes.** `session-status-banner.tsx` and `session-action-buttons.tsx` already handle null sessions correctly.
- **Multi-table grid mounting.** `table-grid.tsx` / `pit-dashboard-client.tsx` remain unmounted on live routes.

---

## 3. Users & Use Cases

- **Primary users:** Pit boss, shift manager (operational surface consumers)
- **Secondary users:** Admin / casino manager (admin surface — future, this PRD prepares constants only)

**Top Jobs:**

- As a **pit boss**, I need to scan 30 tables and instantly distinguish revenue-generating tables (green pulse) from non-revenue tables (gray) so that I can prioritize floor attention without reading label text.
- As a **pit boss**, I need tables that are administratively offline or retired to not appear in my operational view so that I am not distracted by tables I cannot act on.
- As a **shift manager**, I need the null-session badge to say "Closed" (not "Available") so that I understand the table is operationally gated — no seating, no slips — and I must open a session before play can begin.

---

## 4. Scope & Feature List

### 4.1 In Scope

**WS1: Data-Flow Filter (ADR-047 Phase 1)**
- Dashboard RPC or client-side hook filters to `gaming_table.status = 'active'` only
- Pit-map-selector, pit-panels-client, table-grid verified with reduced table set
- Redundant `tables.find((t) => t.status === 'active')` auto-select simplified

**WS2: Pit Display Module (ADR-047 Phase 2 — pit surface)**
- New `services/table-context/pit-display.ts` with `PitDisplayState`, `PIT_DISPLAY_LABELS`, `derivePitDisplayBadge()`
- `derivePitDisplayBadge()` accepts only `SessionPhase | null | undefined` — no `tableAvailability` parameter
- `table-layout-terminal.tsx` imports from `pit-display.ts`; replaces `AVAILABLE`/`IDLE`/`DECOMMISSIONED` state checks with `CLOSED`; updates colors from dimmed-emerald to zinc/gray
- `pit-map-selector.tsx` imports from `pit-display.ts`; replaces `STATUS_CONFIG` inline map and `BADGE_COLOR_CLASSES` with `derivePitDisplayBadge()` path

**WS3: Admin Display Module (ADR-047 Phase 2 — admin surface constants)**
- New `services/table-context/admin-display.ts` with `AdminDisplayState`, `ADMIN_DISPLAY_LABELS`, `deriveAdminDisplayBadge()`
- Constants only — no UI consumer in this PRD (admin catalog is Phase 3)

**WS4: Deprecation (ADR-047 Phase 2 — cleanup)**
- `deriveOperatorDisplayBadge()`, `OperatorDisplayState`, `TABLE_AVAILABILITY_LABELS` in `labels.ts` annotated `@deprecated` with JSDoc pointer to surface-specific replacements
- No mutation of deprecated constants — values remain unchanged for any unconverted consumer
- Verify no new imports of deprecated symbols in changed files

### 4.2 Out of Scope

- Admin catalog UI route and table management page (ADR-047 Phase 3)
- OPEN session workflow and custodial chain validation (ADR-047 Phase 4)
- `session-status-banner.tsx`, `session-action-buttons.tsx`, `table-toolbar.tsx` — already compliant
- Mounting `table-grid.tsx` / `pit-dashboard-client.tsx` on live routes

---

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| FR-1 | Pit dashboard query returns only `gaming_table.status = 'active'` tables | ADR-047 D2 |
| FR-2 | Pit terminal badge shows "Closed" (zinc/gray, muted) when `sessionPhase` is null | ADR-047 D3, D3.2 |
| FR-3 | Pit terminal badge shows "In Play" (emerald, pulse ring) when `sessionPhase` is `ACTIVE` | ADR-047 D3 |
| FR-4 | Pit terminal badge shows "Rundown" (amber) when `sessionPhase` is `RUNDOWN` | ADR-047 D3 |
| FR-5 | Pit navigator (pit-map-selector) shows "Closed" with muted dot for null-session tables | ADR-047 D6 |
| FR-6 | `derivePitDisplayBadge()` signature does not accept `tableAvailability` | ADR-047 D5 |
| FR-7 | No pit-facing surface renders the strings "Idle", "Decommissioned", or "Available" | ADR-047 D3 |
| FR-8 | `OPEN` display state handled defensively but not asserted as reachable in tests | ADR-047 D3.1 |

### 5.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | No database migrations for vocabulary changes (presentation-layer only for WS2–WS4) |
| NFR-2 | WS1 RPC filter change requires one migration (idempotent `CREATE OR REPLACE FUNCTION`) |
| NFR-3 | Badge derivation remains a pure function — no side effects, no async |
| NFR-4 | Deprecated symbols retain runtime functionality — no breaking change for unconverted consumers |

> Architecture details: See `docs/80-adrs/ADR-047-operator-admin-surface-separation.md`, `docs/80-adrs/ADR-028-table-status-standardization.md`

---

## 6. UX / Flow Overview

**Flow 1: Pit boss scans the floor (after fix)**
1. Pit dashboard loads — RPC returns only `active` tables
2. Each table shows badge derived solely from session phase
3. Tables with active sessions pulse emerald ("In Play")
4. Tables with no session show zinc/gray ("Closed")
5. Pit boss opens a session on a closed table — badge transitions to emerald pulse
6. No "Idle" or "Decommissioned" badges appear anywhere on the pit surface

**Flow 2: Pit boss navigates between tables**
1. Pit-map-selector dropdown shows only `active` tables
2. Tables with sessions show emerald dots; tables without show muted zinc dots
3. Each entry label reflects `derivePitDisplayBadge()` output
4. No table in the navigator shows "Available", "Idle", or "Decommissioned"

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| ADR-047 v0.2.0 accepted | Proposed | Governing architecture — all decisions (D1–D7) frozen |
| PRD-057 session-gated seating | Merged (`96a8ab9`) | `NO_ACTIVE_SESSION` gates make null-session a hard operational boundary |
| `DashboardTableDTO.current_session_status` | Exists | RPC already returns session status per EXEC-038A |
| `session` object in `TablesPanel` | Exists | Available at `tables-panel.tsx:63`, wired to terminal at `:230` |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Pit boss needs to see offline tables mid-shift | Deferred to admin catalog (ADR-047 Phase 3); interim workaround: direct URL to admin, or toolbar "Bring Online" action in future PRD |
| Existing tests assert on `AVAILABLE`, `IDLE`, `DECOMMISSIONED` | Blast radius is 3 component files; test updates included in WS2 scope |
| `groupTablesByPit()` utility may strip fields after filter change | Verify utility passes all DTO fields through; tested in WS1 |
| Shared `TABLE_AVAILABILITY_LABELS` imported elsewhere | Deprecate in place, do not mutate; verify no new imports in changed files |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Pit dashboard returns zero tables where `gaming_table.status != 'active'`
- [ ] Pit terminal badge shows "Closed" (zinc/gray) when session is null
- [ ] Pit terminal badge shows "In Play" (emerald, pulse ring) when session is ACTIVE
- [ ] Pit terminal badge shows "Rundown" (amber) when session is RUNDOWN
- [ ] Pit navigator shows "Closed" with muted dot for null-session tables
- [ ] No pit-facing surface displays "Idle", "Decommissioned", or "Available"
- [ ] ADR-047 normative scenarios S1–S6 produce correct display state, label, color
- [ ] ADR-047 admin scenarios A1–A3 produce correct state from `deriveAdminDisplayBadge()`
- [ ] Deferred scenario SF1 (OPEN) is NOT asserted as reachable — defensive branch only

**Data & Integrity**
- [ ] RPC filter change does not affect admin-context queries (filter is pit-surface-specific)
- [ ] No orphaned references to filtered-out tables in pit-panel state

**Security & Access**
- [ ] No authorization changes — display derivation is read-only
- [ ] RPC still uses `set_rls_context_from_staff()` — casino scoping unchanged

**Testing**
- [ ] Unit tests for `derivePitDisplayBadge()` covering S1–S6 scenarios
- [ ] Unit tests for `deriveAdminDisplayBadge()` covering A1–A3 scenarios
- [ ] Component test or visual snapshot: `IN_PLAY` pulse ring vs `CLOSED` zinc/gray distinguishable

**Operational Readiness**
- [ ] No new runtime dependencies
- [ ] Deprecated symbols annotated with `@deprecated` and JSDoc pointers

**Documentation**
- [ ] ADR-047 acceptance criteria checkboxes checked on completion
- [ ] ADR-028 amendment cross-referenced as superseded in relevant sections

---

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| **ADR** | `docs/80-adrs/ADR-047-operator-admin-surface-separation.md` | Governing architecture — D1 through D7 |
| **ADR** | `docs/80-adrs/ADR-028-table-status-standardization.md` | Foundation — D1–D5 unchanged; D6 amended by ADR-047 |
| **ADR** | `docs/80-adrs/ADR-028-amendment-delta-operator-status-contract.md` | Prior D6 hardening — §D6.2, §D6.5, §D6.6 superseded by ADR-047 |
| **PRD** | `docs/10-prd/PRD-054-adr028-operator-display-contract-remediation-v0.md` | Prior implementation that delivered `deriveOperatorDisplayBadge()` |
| **PRD** | `docs/10-prd/PRD-057-session-close-lifecycle-hardening-v0.md` | Session boundary hardening that triggered ADR-047 |
| **V&S** | `docs/00-vision/table-context-read-model/TABLE-SESSION-LIFECYCLE-IMPLEMENTATION-PRECIS.md` | Implementation posture and gap map |
| **ARCH** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | TableContext bounded context ownership |
| **Schema** | `types/database.types.ts` | `table_status`, `table_session_status` enum definitions |

---

## Appendix A: Workstream Summary

### WS1: Data-Flow Filter (P0)

- [ ] Add `AND gt.status = 'active'` to `rpc_get_dashboard_tables_with_counts` WHERE clause (new migration)
- [ ] OR: Set `{ status: 'active' }` as default filter in `useDashboardTables`
- [ ] Verify `pit-map-selector`, `pit-panels-client`, `table-grid` function with reduced table set
- [ ] Simplify auto-select in `pit-panels-client.tsx:210` (all returned tables are now active)

### WS2: Pit Display Module (P0)

- [ ] Create `services/table-context/pit-display.ts` with `PitDisplayState`, `PIT_DISPLAY_LABELS`, `PitDisplayBadge` interface, `derivePitDisplayBadge()`
- [ ] Update `table-layout-terminal.tsx` — import from `pit-display.ts`; replace all `badge.state === 'AVAILABLE'` with `'CLOSED'`; update emerald-dimmed to zinc/gray
- [ ] Update `pit-map-selector.tsx` — import from `pit-display.ts`; replace `STATUS_CONFIG` inline map and `BADGE_COLOR_CLASSES` with `derivePitDisplayBadge()` path
- [ ] Unit tests: `derivePitDisplayBadge()` covering scenarios S1–S6; OPEN branch tested as defensive only

### WS3: Admin Display Module (P1)

- [ ] Create `services/table-context/admin-display.ts` with `AdminDisplayState`, `ADMIN_DISPLAY_LABELS`, `AdminDisplayBadge` interface, `deriveAdminDisplayBadge()`
- [ ] Unit tests: `deriveAdminDisplayBadge()` covering scenarios A1–A3

### WS4: Deprecation (P1)

- [ ] Annotate `deriveOperatorDisplayBadge()` with `@deprecated` + JSDoc pointer to `derivePitDisplayBadge()`
- [ ] Annotate `OperatorDisplayState` type with `@deprecated` + pointer to `PitDisplayState`
- [ ] Annotate `TABLE_AVAILABILITY_LABELS` with `@deprecated` + pointer to `ADMIN_DISPLAY_LABELS`
- [ ] Verify no new imports of deprecated symbols in WS1–WS3 changed files

### File Manifest

| File | WS | Change |
|------|----|--------|
| `supabase/migrations/YYYYMMDD_adr047_pit_dashboard_active_filter.sql` | WS1 | New migration — `CREATE OR REPLACE FUNCTION` with `AND gt.status = 'active'` |
| `hooks/dashboard/use-dashboard-tables.ts` | WS1 | Default filter `{ status: 'active' }` |
| `components/pit-panels/pit-panels-client.tsx` | WS1 | Simplify auto-select |
| `services/table-context/pit-display.ts` | WS2 | **New** |
| `components/table/table-layout-terminal.tsx` | WS2 | Import swap + state/color updates |
| `components/table/pit-map-selector.tsx` | WS2 | Import swap + STATUS_CONFIG removal |
| `services/table-context/admin-display.ts` | WS3 | **New** |
| `services/table-context/labels.ts` | WS4 | `@deprecated` annotations only |

---

## Appendix B: ADR-047 Scenario Verification Matrix

Copied from ADR-047 D7 for build pipeline consumption.

**Normative (S1–S6):**

| # | `sessionPhase` | Expected State | Expected Label | Expected Color |
|---|---|---|---|---|
| S1 | `ACTIVE` | `IN_PLAY` | "In Play" | emerald |
| S2 | `RUNDOWN` | `RUNDOWN` | "Rundown" | amber |
| S3 | `null` | `CLOSED` | "Closed" | zinc |
| S4 | `null` | `CLOSED` | "Closed" | zinc |
| S5 | `null` | `CLOSED` | "Closed" | zinc |
| S6 | `RUNDOWN` | `RUNDOWN` | "Rundown" | amber |

**Admin (A1–A3):**

| # | `tableAvailability` | Expected State | Expected Label |
|---|---|---|---|
| A1 | `active` | `ON_FLOOR` | "On Floor" |
| A2 | `inactive` | `OFFLINE` | "Offline" |
| A3 | `closed` | `RETIRED` | "Retired" |

**Deferred (SF1):**

| # | `sessionPhase` | Expected State | Expected Label | Gate |
|---|---|---|---|---|
| SF1 | `OPEN` | `OPEN` | "Open" | Not reachable — defensive only |

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-25 | Initial draft — ADR-047 Phase 1 + Phase 2 delivery scope |
