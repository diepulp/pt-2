# ADR-047: Operator–Admin Surface Separation for Table Status

**Status:** Proposed
**Date:** 2026-03-25
**Owner:** TableContext
**Decision Scope:** Table status display surfaces, dashboard filtering, operator vocabulary
**Amends:** ADR-028 D6 (Operator Display Contract), ADR-028 D6.6 (Surface-Question Contract)
**Supersedes:** ADR-028 Amendment v0.3.0 §D6.2 (Operator Display State Table), §D6.5 (Scenario Tests)
**Triggered By:** Post-PRD-057 investigation — session-gating hardened the null-session boundary, making the D6 "Available" label semantically incorrect
**Related:** ADR-028, PRD-054, PRD-057

---

## Context

### Two Orthogonal Axes, One Surface

PT-2 encodes two orthogonal concerns about a gaming table:

| Axis | Column | Who owns it | Change frequency | Question it answers |
|------|--------|-------------|------------------|---------------------|
| **Administrative availability** | `gaming_table.status` | Admin / casino manager | Rarely — setup, removal, regulatory action | "Is this table administratively available for sessions?" |
| **Operational state** (daily ops) | `table_session.status` | Pit boss / shift manager | Multiple times per shift | "What is happening at this table right now?" |

The administrative availability axis is broader than physical floor presence. An `inactive` table may still physically exist on the gaming floor — it is not absent, it is *administratively unavailable* (maintenance, regulatory hold, low demand, game change). The distinction matters: "floor presence" implies a physical question the system cannot answer; "administrative availability" describes exactly what `gaming_table.status` controls — whether the system permits sessions to be opened.

ADR-028 correctly identified these as separate systems (D1: "Two Status Systems Remain Separate") and created type aliases to prevent code-level confusion (D5). The D6 amendment then created a **composite operator display state** that merges both axes into a single badge on a single surface — the pit terminal.

### What Changed: PRD-057 Hardened the Session Boundary

Before PRD-057 (`96a8ab9`), `sessionPhase = null` was a soft signal — rating slips could be created and players seated at a table without an active session. The D6 amendment chose the label "Available" because the badge answered "Can I act on this table?" — and without session enforcement, the answer was "yes."

PRD-057 hardened three gates:

1. `rpc_close_table_session` computes `has_unresolved_items` from live `rating_slip` state
2. `rpc_start_rating_slip` rejects with `NO_ACTIVE_SESSION` when no session exists
3. `rpc_check_table_seat_availability` returns `no_active_session` when no session exists

After PRD-057, a table with no session is **operationally closed** — no players can be seated, no rating slips can be opened, no gameplay can occur. The label "Available" now contradicts the system's own enforcement.

### The Convergence Problem

The D6 composite derivation places six states on a single surface:

| State | Source axis | Label | Target audience |
|-------|-----------|-------|-----------------|
| `IN_PLAY` | Session (operational) | "In Play" | Pit boss |
| `RUNDOWN` | Session (operational) | "Rundown" | Pit boss |
| `OPEN` | Session (operational) | "Open" | Pit boss |
| `AVAILABLE` | Composite — table active + no session | "Available" | Pit boss |
| `IDLE` | Administrative availability | "Idle" | **Admin** — leaking onto pit surface |
| `DECOMMISSIONED` | Administrative availability | "Decommissioned" | **Admin** — leaking onto pit surface |

The pit boss sees admin-state labels interspersed with operational ones. A decommissioned table — permanently removed from the floor — occupies visual space on the same grid as tables generating revenue. An `inactive` table shows "Idle," which implies "waiting for players" when it actually means "administratively pulled from operation, no sessions allowed."

The root cause: the dashboard RPC (`rpc_get_dashboard_tables_with_counts`) returns all tables regardless of `gaming_table.status`, and no client-side filter excludes admin states.

### Why This Is a New ADR, Not Another Amendment

ADR-028's D6 amendment was explicitly scoped to "presentation-layer only — no database migrations, no new RPCs." This decision requires:

- Dashboard query filtering (behavioral change)
- Surface-role binding (new architectural concept)
- Separate vocabularies for admin and operational surfaces
- Revision of the D6.6 surface-question contract framing

These exceed the amendment's scope. ADR-028 made the right foundational choice — keep the two status systems separate. This ADR carries that principle to its logical conclusion: **separate systems belong on separate surfaces.**

---

## Decision

### D1: Surface-Role Separation (Normative)

Operator-facing and admin-facing surfaces MUST NOT render table-availability states and session-lifecycle states as peer-level items on the same badge or status indicator.

Each surface is bound to a **primary role** and a **primary axis**:

| Surface | Primary role | Primary axis | What it shows |
|---------|-------------|-------------|---------------|
| **Pit dashboard** (`/pit`) | Pit boss, shift manager | Session lifecycle (operational) | Only `gaming_table.status = 'active'` tables; badge derived from session phase |
| **Admin catalog** (`/admin/tables`, future) | Admin, casino manager | Administrative availability | All tables; badge derived from `gaming_table.status` |

A surface MAY show the other axis as secondary context (e.g., admin catalog could show session state as a detail column) but MUST NOT merge both axes into a single composite badge.

### D2: Pit Dashboard Filters to Active Tables

The pit dashboard MUST show only tables where `gaming_table.status = 'active'`.

**Implementation**: Add `AND gt.status = 'active'` to `rpc_get_dashboard_tables_with_counts` WHERE clause, or apply a default client-side filter in `useDashboardTables`.

**Rationale**: A pit boss monitors the gaming floor — tables that are administratively offline or decommissioned are not on the gaming floor. Showing them creates visual noise and semantic confusion.

**Edge case — bringing a table online mid-shift**: If a pit boss needs to activate an inactive table, that action flows through the admin catalog or a dedicated "Bring Online" management action. It does not require the table to be visible on the operational monitoring surface while it is inactive.

### D3: Operational Display States (Pit Surface)

When admin states are filtered, the operator display collapses to **session-derived states only**. All tables on the pit surface have `gaming_table.status = 'active'`, so the badge is determined entirely by session phase:

**Normative states** (reachable in MVP runtime):

| Operator State | Session Phase | Label | Color | Badge Style |
|----------------|--------------|-------|-------|-------------|
| `IN_PLAY` | `ACTIVE` | "In Play" | Emerald | Solid, pulse ring |
| `RUNDOWN` | `RUNDOWN` | "Rundown" | Amber | Solid, no pulse |
| `CLOSED` | `null` | "Closed" | Zinc/gray | Muted, no pulse |

**Defensive compatibility state** (not reachable in MVP — see D3.1):

| Operator State | Session Phase | Label | Color | Badge Style | Gate |
|----------------|--------------|-------|-------|-------------|------|
| `OPEN` | `OPEN` | "Open" | Blue | Solid | Requires OPEN workflow PRD + custodial chain |

`OPEN` is included in the `PitDisplayState` type union for forward compatibility only. It MUST NOT appear in normative scenario tests, acceptance criteria, or implementation scope for any execution slice until the gate conditions in D3.1 are met. Any EXEC-SPEC covering this ADR should treat `OPEN` as a non-blocking defensive branch, not a normative contract.

#### D3.1: OPEN State Deferred

ADR-028 D4 explicitly reserves the `OPEN` session phase for a future workflow ("session created, awaiting opening inventory snapshot"). MVP sessions start directly in `ACTIVE` — no code path produces `OPEN` today. The `OPEN` → `ACTIVE` transition requires an administrative custodial chain validation (opening snapshot capture, par binding verification) that does not yet exist.

The `OPEN` display state is included in the `PitDisplayState` type union for forward compatibility but MUST NOT appear in normative scenario tests, acceptance criteria, or implementation scope until:

1. An RPC or workflow actually writes `table_session.status = 'OPEN'`
2. The custodial chain validation for OPEN → ACTIVE is specified and built (separate PRD)

Until then, `derivePitDisplayBadge()` handles the `OPEN` case defensively (returns blue badge) but no test or UI code should assert on it as a reachable runtime state.

#### D3.2: What "Closed" Means on the Pit Surface

The pit display state `CLOSED` is a **derived monitoring state**, not a lifecycle claim about the underlying data model. It does not mean `table_session.status = 'CLOSED'` — that is a historical fact about a finalized session row. The dashboard RPC filters closed sessions from the current-session query (`WHERE status IN ('OPEN','ACTIVE','RUNDOWN')`), so a closed session appears as `sessionPhase = null`.

What the pit display `CLOSED` communicates:

> "No current session exists for this table. PRD-057 gates all gameplay behind an active session — no players can be seated, no rating slips can be opened. This table is operationally closed for pit monitoring purposes."

The pit boss does not need to know *why* there is no session (never opened, closed an hour ago, between gaming day rollovers). All three produce the same monitoring state: not generating revenue, not accepting gameplay, waiting for the pit boss to open a new session.

**On the word "Closed":** The triple collision identified in the ADR-028 amendment dissolves under surface separation:

| "Closed" usage | Surface | Collision? |
|---------------|---------|-----------|
| `gaming_table.status = 'closed'` | Admin catalog only — pit boss never sees it | No |
| `table_session.status = 'CLOSED'` | Filtered from current-session queries — appears as `null` | No |
| Pit display `CLOSED` (derived monitoring state) | Pit dashboard — the only "Closed" the pit boss encounters | **No collision** |

"Closed" is the natural word a pit boss uses for a table that is not open for business. Post-PRD-057, it's also accurate — no seating, no slips, no gameplay permitted.

**Visual distinction**: `IN_PLAY` (emerald + pulse) vs `CLOSED` (zinc/gray, muted) provides maximum contrast between the two most common states. The pit boss scanning 30 tables sees green-pulsing (revenue) vs gray (not revenue) instantly, without reading labels.

### D4: Administrative Display States (Admin Surface)

The admin catalog uses its own vocabulary for `gaming_table.status`, independent of the operational display:

| Table Availability | Label | Color | Meaning |
|-------------------|-------|-------|---------|
| `active` | "On Floor" | Emerald | Table is on the gaming floor and available for sessions |
| `inactive` | "Offline" | Amber/gray | Administratively removed from operation — maintenance, low demand, regulatory hold |
| `closed` | "Retired" | Zinc | Permanently decommissioned, terminal state |

**On "Idle" → "Offline":** "Idle" implies the table is waiting for players — a revenue opportunity signal. The actual meaning of `inactive` is "admin has pulled this table from the floor; no sessions, no seating, no activity permitted." "Offline" communicates this unambiguously.

**On "Decommissioned" → "Retired":** "Decommissioned" is technically precise but operationally verbose. "Retired" is shorter, equally clear in context, and pairs naturally with "On Floor" / "Offline" as a vocabulary set.

**Alternative considered — "Dark":** Casino industry term for a non-operating table ("the table went dark"). Domain-native and instantly understood by casino operators. Acceptable alternative to "Offline" — the admin catalog could use either. This ADR recommends "Offline" for broader accessibility but does not prohibit "Dark" if user research with casino operators favors it.

### D5: Revised `deriveOperatorDisplayBadge()` Contract

The existing `deriveOperatorDisplayBadge()` function in `services/table-context/labels.ts` is refactored to reflect the surface separation:

```typescript
// === Pit surface constants (services/table-context/pit-display.ts) ===

/** Live states + OPEN reserved for future custodial chain workflow (D3.1) */
export type PitDisplayState = 'IN_PLAY' | 'RUNDOWN' | 'CLOSED' | 'OPEN';

export const PIT_DISPLAY_LABELS: Record<PitDisplayState, string> = {
  IN_PLAY: 'In Play',
  RUNDOWN: 'Rundown',
  CLOSED:  'Closed',
  OPEN:    'Open',    // D3.1: deferred — no code path produces this today
};

export function derivePitDisplayBadge(
  sessionPhase: SessionPhase | null | undefined,
): PitDisplayBadge {
  if (sessionPhase === 'ACTIVE')  return { state: 'IN_PLAY',  label: 'In Play',  color: 'emerald', pulse: true,  dimmed: false };
  if (sessionPhase === 'RUNDOWN') return { state: 'RUNDOWN',  label: 'Rundown',  color: 'amber',   pulse: false, dimmed: false };
  if (sessionPhase === 'OPEN')    return { state: 'OPEN',     label: 'Open',     color: 'blue',    pulse: false, dimmed: false }; // D3.1: defensive only
  return                                 { state: 'CLOSED',   label: 'Closed',   color: 'zinc',    pulse: false, dimmed: false };
}

// === Admin surface constants (services/table-context/admin-display.ts) ===

export type AdminDisplayState = 'ON_FLOOR' | 'OFFLINE' | 'RETIRED';

export const ADMIN_DISPLAY_LABELS: Record<AdminDisplayState, string> = {
  ON_FLOOR: 'On Floor',
  OFFLINE:  'Offline',
  RETIRED:  'Retired',
};

export function deriveAdminDisplayBadge(
  tableAvailability: TableAvailability,
): AdminDisplayBadge { ... }
```

**Surface-specific constants, not shared mutation.** `PIT_DISPLAY_LABELS` and `ADMIN_DISPLAY_LABELS` are separate constant sets. The existing `TABLE_AVAILABILITY_LABELS` (`active → "Available"`, `inactive → "Idle"`, `closed → "Decommissioned"`) is NOT mutated — it is deprecated. New code imports from the surface-appropriate module. This prevents admin vocabulary from bleeding into pit surfaces or vice versa through a shared constant that pretends to be universal.

Note: `derivePitDisplayBadge` no longer accepts `tableAvailability` — the pit surface pre-filters to active tables, so the parameter is redundant. This makes the surface-role separation **type-enforced**, not just conventional.

The existing `deriveOperatorDisplayBadge(tableAvailability, sessionPhase)` and `TABLE_AVAILABILITY_LABELS` are deprecated. They MAY be retained during transition but MUST NOT be imported by new code. Removal is deferred until all consumers have migrated to surface-specific imports.

### D6: Revised Surface-Question Contract

Supersedes ADR-028 Amendment §D6.6.

| Surface | Component | Primary question | Label source | Null session renders as |
|---------|-----------|-----------------|--------------|------------------------|
| **Terminal badge** | `table-layout-terminal.tsx` | "Is this table generating revenue?" | `derivePitDisplayBadge(sessionPhase)` | `CLOSED` — "Closed", zinc/gray |
| **Session banner** | `session-status-banner.tsx` | "What is the current session state?" | `table_session.status` directly | "No Session" — outline badge |
| **Action buttons** | `session-action-buttons.tsx` | "What can I do next?" | State machine guards | "Open Session" enabled |
| **Pit navigator** | `pit-map-selector.tsx` | "Which table should I look at?" | `derivePitDisplayBadge(sessionPhase)` | "Closed" with muted dot |
| **Admin catalog** | Future `/admin/tables` | "What is this table's floor status?" | `deriveAdminDisplayBadge(availability)` | N/A — all states shown |

The terminal badge question changes from "Can I act on this table?" (D6 original) to **"Is this table generating revenue?"** This aligns with the pit boss's actual scanning behavior: green-pulsing tables are producing, gray tables are not. The action question is answered by the action buttons, not the badge.

### D7: Scenario Tests (Revised)

Supersedes ADR-028 Amendment §D6.5.

**Pit surface scenarios — normative** (only `active` tables reach this surface):

| # | `current_session_status` | Scenario | Expected State | Expected Label | Visual |
|---|---|---|---|---|---|
| S1 | `ACTIVE` | Normal play | `IN_PLAY` | "In Play" | Emerald, pulse ring |
| S2 | `RUNDOWN` | End-of-shift accounting snapshot | `RUNDOWN` | "Rundown" | Amber |
| S3 | `null` | No session opened today | `CLOSED` | "Closed" | Zinc/gray, muted |
| S4 | `null` | Session closed earlier this shift | `CLOSED` | "Closed" | Zinc/gray, muted |
| S5 | `null` | Gaming day rollover gap | `CLOSED` | "Closed" | Zinc/gray, muted |
| S6 | `RUNDOWN` | Mid-shift spot check | `RUNDOWN` | "Rundown" | Amber |

**Pit surface scenarios — defensive compatibility only** (D3.1: OPEN state not reachable in MVP):

| # | `current_session_status` | Scenario | Expected State | Expected Label | Visual | Gate |
|---|---|---|---|---|---|---|
| SF1 | `OPEN` | Session created, awaiting opening snapshot + custodial chain validation | `OPEN` | "Open" | Blue | Requires OPEN workflow PRD + custodial chain implementation |

SF1 is **non-normative** for any execution slice until a code path writes `table_session.status = 'OPEN'`. It is a defensive compatibility branch in `derivePitDisplayBadge()` — included for forward compatibility, excluded from normative acceptance criteria. EXEC-SPECs implementing this ADR MUST classify SF1 as non-blocking defensive coverage, not as a normative contract.

**Admin surface scenarios** (all tables):

| # | `gaming_table.status` | Scenario | Expected State | Expected Label |
|---|---|---|---|---|
| A1 | `active` | Table on the floor | `ON_FLOOR` | "On Floor" |
| A2 | `inactive` | Maintenance / low demand | `OFFLINE` | "Offline" |
| A3 | `closed` | Permanently removed | `RETIRED` | "Retired" |

**Eliminated scenarios** (no longer reachable on pit surface):

| ADR-028 # | Condition | Why eliminated |
|-----------|-----------|---------------|
| S8 | `inactive` + `ACTIVE` | `inactive` tables filtered from pit dashboard (D2) |
| S9 | `inactive` + `null` | Same |
| S10 | `closed` + any | Same |

---

## Data Flow Changes

### Dashboard RPC

```sql
-- Current (returns all tables):
FROM gaming_table gt
WHERE gt.casino_id = v_casino_id

-- After (pit dashboard only sees active tables):
FROM gaming_table gt
WHERE gt.casino_id = v_casino_id
  AND gt.status = 'active'
```

### Client-Side

`useDashboardTables` default behavior changes from "all tables" to "active tables only." The existing `filters.status` parameter remains for explicit overrides (e.g., admin catalog could pass `{ status: undefined }` for unfiltered).

### Pit Panel Auto-Select

`pit-panels-client.tsx:210` currently does `tables.find((t) => t.status === 'active')` — this becomes unnecessary when all returned tables are active. The fallback `tables[0]` is sufficient.

---

## Migration Path

### Phase 1: RPC + Filter (Data Flow)

1. Add `AND gt.status = 'active'` to `rpc_get_dashboard_tables_with_counts`
2. Alternatively, set `{ status: 'active' }` as default filter in `useDashboardTables`
3. Verify pit-map-selector, table-grid, and pit-panels-client still function correctly with reduced table set

### Phase 2: Vocabulary (Presentation)

1. Create `PIT_DISPLAY_LABELS`, `PitDisplayState`, and `derivePitDisplayBadge()` in a new `services/table-context/pit-display.ts`
2. Create `ADMIN_DISPLAY_LABELS`, `AdminDisplayState`, and `deriveAdminDisplayBadge()` in a new `services/table-context/admin-display.ts`
3. Deprecate `deriveOperatorDisplayBadge()`, `OperatorDisplayState`, and `TABLE_AVAILABILITY_LABELS` in `labels.ts` — add `@deprecated` annotations pointing to surface-specific imports; do NOT mutate the shared constants in place
4. Update `table-layout-terminal.tsx` — import from `pit-display.ts`; replace `AVAILABLE` checks with `CLOSED`, update colors from dimmed-emerald to zinc/gray
5. Update `pit-map-selector.tsx` — import from `pit-display.ts`; replace `STATUS_CONFIG` and `BADGE_COLOR_CLASSES` with `derivePitDisplayBadge()` path
6. Verify no new code imports the deprecated shared constants; existing consumers migrate as they are touched

### Phase 3: Admin Catalog (Future)

1. Build `/admin/tables` route with table management UI
2. Wire activate/deactivate/close actions (API routes + server actions already exist)
3. Import from `admin-display.ts`; use `deriveAdminDisplayBadge()` and `ADMIN_DISPLAY_LABELS` for admin surface vocabulary
4. Admin catalog calls `useDashboardTables(casinoId, {})` with no status filter to see all tables

### Phase 4: OPEN Workflow (Future, Separate PRD)

1. Define custodial chain validation for opening snapshot capture and par binding verification
2. Create RPC or workflow that writes `table_session.status = 'OPEN'` and gates the OPEN → ACTIVE transition
3. Promote SF1 to normative scenario table; add acceptance criteria for OPEN display state
4. This phase is explicitly deferred and MUST NOT be conflated with Phase 1–3 scope

---

## Consequences

### Positive

- **Semantic clarity**: Pit boss sees only operational states; admin sees only administrative states
- **"Closed" disambiguated**: Each surface encounters "Closed" in exactly one context — no triple collision
- **Post-PRD-057 alignment**: Null-session label matches the system's actual enforcement (no seating, no slips)
- **Glanceability**: Green-pulsing vs zinc/gray provides maximum visual contrast for the 30-table scan
- **Type-enforced separation**: `derivePitDisplayBadge` doesn't accept `tableAvailability` — the compiler prevents axis mixing

### Negative

- **Pit boss loses visibility of offline tables**: An admin must bring a table online before the pit boss sees it. Mitigated by admin catalog (Phase 3) or a "Bring Online" management action.
- **Two vocabulary systems to maintain**: Admin labels and pit labels diverge. Mitigated by surface-specific modules (`pit-display.ts`, `admin-display.ts`) with no shared mutable state between them.

### Neutral

- **ADR-028 D1–D5 unchanged**: The foundational decisions (separate enums, type aliases, availability gate, OPEN reserved, count/drop separate) remain fully intact.
- **`deriveOperatorDisplayBadge()` and `TABLE_AVAILABILITY_LABELS` deprecated, not deleted**: Transition path exists for any code still calling them. Deprecated symbols annotated with `@deprecated` and pointer to surface-specific replacement.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Pit boss needs to activate a table mid-shift and can't find it | Admin catalog (Phase 3); interim: toolbar "Bring Table Online" action; or filter toggle in pit-map-selector |
| Existing tests assert on `AVAILABLE`, `IDLE`, `DECOMMISSIONED` labels | Phase 2 test update; blast radius is 3 files (labels.ts, table-layout-terminal.tsx, pit-map-selector.tsx) |
| Admin catalog doesn't exist yet | Phase 1–2 can ship independently; Phase 3 is additive. Deprecated `TABLE_AVAILABILITY_LABELS` remain functional for any legacy consumer until migrated |
| Shared constants mutated instead of split | D5 mandates separate modules (`pit-display.ts`, `admin-display.ts`); acceptance criteria verify no shared mutable label map; code review gate |
| Future multi-table grid (`table-grid.tsx`) assumes composite derivation | Grid is unmounted on live routes; when mounted, it should use `derivePitDisplayBadge()` |

---

## Acceptance Criteria

- [ ] Pit dashboard returns only `gaming_table.status = 'active'` tables (RPC or client filter)
- [ ] Pit terminal badge shows "Closed" (zinc/gray) when session is null — not "Available"
- [ ] Pit terminal badge shows "In Play" (emerald, pulse) when session is ACTIVE
- [ ] `derivePitDisplayBadge()` exists in `pit-display.ts` and does NOT accept `tableAvailability` parameter
- [ ] `deriveAdminDisplayBadge()` exists in `admin-display.ts` for future admin catalog
- [ ] `PIT_DISPLAY_LABELS` and `ADMIN_DISPLAY_LABELS` are separate constant sets — no shared mutable label map
- [ ] `TABLE_AVAILABILITY_LABELS` and `deriveOperatorDisplayBadge()` marked `@deprecated` — not mutated, not imported by new code
- [ ] No pit-facing surface displays "Idle", "Decommissioned", or "Available"
- [ ] Normative scenarios S1–S6 (pit) and A1–A3 (admin) pass
- [ ] OPEN scenario (SF1) is NOT included in normative test assertions — defensive branch only
- [ ] `pit-map-selector.tsx` shows "Closed" with muted dot for tables with no session

---

## References

### Internal

| Document | Relevance |
|----------|-----------|
| `docs/80-adrs/ADR-028-table-status-standardization.md` | Foundation — D1 through D5 unchanged; D6 amended by this ADR |
| `docs/80-adrs/ADR-028-amendment-delta-operator-status-contract.md` | Prior D6 hardening; §D6.2, §D6.5, §D6.6 superseded |
| `docs/10-prd/PRD-054-adr028-operator-display-contract-remediation-v0.md` | PRD that delivered D6 implementation (commit `2f1b30a`) |
| `docs/10-prd/PRD-057-session-close-lifecycle-hardening-v0.md` | Session boundary hardening that triggered this ADR |
| `docs/00-vision/table-context-read-model/issues/REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS.md` | Investigation that found session-gating gaps |

### Code

| File | Impact |
|------|--------|
| `services/table-context/pit-display.ts` | **New** — `PitDisplayState`, `PIT_DISPLAY_LABELS`, `derivePitDisplayBadge()` |
| `services/table-context/admin-display.ts` | **New** — `AdminDisplayState`, `ADMIN_DISPLAY_LABELS`, `deriveAdminDisplayBadge()` |
| `services/table-context/labels.ts` | Deprecate `deriveOperatorDisplayBadge()`, `OperatorDisplayState`, `TABLE_AVAILABILITY_LABELS` — do not mutate |
| `components/table/table-layout-terminal.tsx` | Import from `pit-display.ts`; replace `AVAILABLE`/`IDLE`/`DECOMMISSIONED` state checks with `CLOSED` |
| `components/table/pit-map-selector.tsx` | Import from `pit-display.ts`; replace `STATUS_CONFIG` with `derivePitDisplayBadge()` path |
| `supabase/migrations/` (new) | Add `AND gt.status = 'active'` to `rpc_get_dashboard_tables_with_counts` WHERE clause |
| `hooks/dashboard/use-dashboard-tables.ts` | Default filter to `{ status: 'active' }` |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-25 | Initial — surface-role separation, vocabulary split, post-PRD-057 alignment |
| 0.2.0 | 2026-03-25 | Patch: rename axis to "Administrative availability"; defer OPEN state (D3.1) with custodial chain gate; split shared constants into surface-specific modules; clarify null-session CLOSED as derived monitoring state (D3.2) |
| 0.2.1 | 2026-03-25 | Governance sync: D3 table split into normative vs defensive-compatibility sections; D7 SF1 classification strengthened to explicitly non-normative with EXEC-SPEC binding language; aligns ADR with EXEC-058 execution contract |
